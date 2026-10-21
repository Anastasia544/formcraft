const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, 'public')));

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ forms: [], events: [] }, null, 2));
  }
}
function readDB() {
  ensureStore();
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { forms: Array.isArray(data.forms) ? data.forms : [], events: Array.isArray(data.events) ? data.events : [] };
  } catch {
    return { forms: [], events: [] };
  }
}
function writeDB(db) {
  ensureStore();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function publicForm(form) {
  const { submissions, ...safe } = form;
  return { ...safe, submissionsCount: (submissions || []).length };
}
function track(db, formId, type, sessionId) {
  db.events.push({ id: crypto.randomUUID(), formId, type, sessionId: sessionId || null, createdAt: new Date().toISOString() });
  if (db.events.length > 10000) db.events = db.events.slice(-8000);
}
function notFound(res) { return res.status(404).json({ error: 'Форма не найдена' }); }
function validateQuestions(questions) {
  if (!questions.length) return 'Добавьте хотя бы один вопрос перед публикацией';
  if (questions.some(q => !q.label.trim())) return 'Заполните текст каждого вопроса';
  if (questions.some(q => ['radio', 'checkbox', 'select'].includes(q.type) && !q.options.length))
    return 'Добавьте хотя бы один вариант для каждого вопроса с выбором';
  return null;
}
function questionStructure(questions) {
  return JSON.stringify(questions.map(q => ({
    id: q.id, label: q.label, type: q.type, required: q.required, options: q.options
  })));
}

app.get('/', (_req, res) => res.redirect('/admin'));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/f/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/admin/forms/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'results.html')));

app.get('/api/forms', (_req, res) => {
  const db = readDB();
  res.json(db.forms.map(publicForm).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});
app.post('/api/forms', (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  if (!title) return res.status(400).json({ error: 'Укажите название формы' });
  if (title.length > 120) return res.status(400).json({ error: 'Название должно быть не длиннее 120 символов' });
  const db = readDB();
  const form = {
    id: crypto.randomBytes(4).toString('hex'),
    title, description,
    status: 'draft',
    questions: [],
    submissions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null
  };
  db.forms.push(form);
  writeDB(db);
  res.status(201).json(publicForm(form));
});
app.get('/api/forms/:id', (req, res) => {
  const db = readDB();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return notFound(res);
  res.json(publicForm(form));
});
app.put('/api/forms/:id', (req, res) => {
  const db = readDB();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return notFound(res);
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const questions = req.body.questions;
  if (!title) return res.status(400).json({ error: 'Укажите название формы' });
  if (!Array.isArray(questions) || questions.length > 50) return res.status(400).json({ error: 'Проверьте список вопросов' });
  const allowed = new Set(['text', 'textarea', 'email', 'radio', 'checkbox', 'select']);
  const cleaned = questions.map((q, i) => ({
    id: String(q.id || `q${i + 1}`).slice(0, 80),
    label: String(q.label || '').trim().slice(0, 250),
    type: allowed.has(q.type) ? q.type : 'text',
    required: Boolean(q.required),
    options: Array.isArray(q.options) ? q.options.map(x => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 30) : []
  }));
  // Черновик может содержать незаконченные вопросы. Проверяем их только при публикации.
  // После первых ответов структура опубликованной формы фиксируется.
  if (form.status === 'published' && (form.submissions || []).length > 0 &&
      questionStructure(cleaned) !== questionStructure(form.questions)) {
    return res.status(409).json({ error: 'В опубликованной форме уже есть ответы. Вопросы менять нельзя — создайте новую форму. Название и описание редактировать можно.' });
  }
  // Опубликованная форма не должна становиться некорректной после изменения.
  if (form.status === 'published') {
    const error = validateQuestions(cleaned);
    if (error) return res.status(400).json({ error });
  }
  form.title = title.slice(0, 120);
  form.description = description.slice(0, 1000);
  form.questions = cleaned;
  form.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(publicForm(form));
});
app.post('/api/forms/:id/publish', (req, res) => {
  const db = readDB();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return notFound(res);
  const error = validateQuestions(form.questions);
  if (error) return res.status(400).json({ error });
  form.status = 'published';
  form.publishedAt = form.publishedAt || new Date().toISOString();
  form.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ ...publicForm(form), url: `/f/${form.id}` });
});
app.post('/api/forms/:id/events', (req, res) => {
  const db = readDB();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return notFound(res);
  if (form.status !== 'published') return res.status(403).json({ error: 'Форма пока не опубликована' });
  const allowed = new Set(['view', 'start', 'progress']);
  const type = String(req.body.type || '');
  if (!allowed.has(type)) return res.status(400).json({ error: 'Неизвестное событие' });
  const sessionId = String(req.body.sessionId || '').slice(0, 100);
  const already = db.events.some(e => e.formId === form.id && e.type === type && e.sessionId === sessionId);
  if (sessionId && already && type !== 'progress') return res.json({ ok: true, duplicate: true });
  track(db, form.id, type, sessionId);
  writeDB(db);
  res.json({ ok: true });
});
app.post('/api/forms/:id/submissions', (req, res) => {
  const db = readDB();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return notFound(res);
  if (form.status !== 'published') return res.status(403).json({ error: 'Форма не опубликована' });
  const answers = req.body.answers || {};
  const errors = [];
  for (const q of form.questions) {
    const value = answers[q.id];
    const empty = value === undefined || value === null || (Array.isArray(value) ? !value.length : !String(value).trim());
    if (q.required && empty) errors.push(`Заполните поле «${q.label}»`);
    if (q.type === 'email' && !empty && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors.push(`Проверьте адрес электронной почты в поле «${q.label}»`);
    if (['radio', 'select'].includes(q.type) && !empty && !q.options.includes(String(value))) errors.push(`Недопустимый вариант в поле «${q.label}»`);
    if (q.type === 'checkbox' && Array.isArray(value) && value.some(v => !q.options.includes(String(v)))) errors.push(`Недопустимый вариант в поле «${q.label}»`);
  }
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const safeAnswers = {};
  for (const q of form.questions) {
    let value = answers[q.id];
    if (Array.isArray(value)) value = value.map(v => String(v).slice(0, 1000));
    else if (value !== undefined && value !== null) value = String(value).slice(0, 5000);
    if (value !== undefined) safeAnswers[q.id] = value;
  }
  form.submissions.push({ id: crypto.randomUUID(), answers: safeAnswers, createdAt: new Date().toISOString() });
  form.updatedAt = new Date().toISOString();
  track(db, form.id, 'submit', String(req.body.sessionId || '').slice(0, 100));
  writeDB(db);
  res.status(201).json({ ok: true, message: 'Ответ отправлен. Спасибо!' });
});
app.get('/api/forms/:id/submissions', (req, res) => {
  const db = readDB();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return notFound(res);
  res.json({ form: publicForm(form), questions: form.questions, submissions: form.submissions || [] });
});
app.get('/api/forms/:id/analytics', (req, res) => {
  const db = readDB();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return notFound(res);
  const events = db.events.filter(e => e.formId === form.id);
  const count = type => events.filter(e => e.type === type).length;
  const unique = type => new Set(events.filter(e => e.type === type && e.sessionId).map(e => e.sessionId)).size;
  const views = Math.max(count('view'), unique('view'));
  const starts = Math.max(count('start'), unique('start'));
  const submits = (form.submissions || []).length;
  res.json({
    views, starts, submits,
    conversion: views ? Math.round((submits / views) * 100) : 0,
    abandonment: starts ? Math.max(0, Math.round(((starts - submits) / starts) * 100)) : 0
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});
ensureStore();
app.listen(PORT, () => console.log(`FormCraft запущен: http://localhost:${PORT}`));
