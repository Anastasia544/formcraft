const $ = s => document.querySelector(s);
let forms = [], currentId = null, questions = [], currentStatus = 'draft', structureLocked = false;
const choiceTypes = ['radio','checkbox','select'];
const typeNames = {text:'Короткий текст',textarea:'Развёрнутый ответ',email:'Электронная почта',radio:'Один вариант',checkbox:'Несколько вариантов',select:'Выпадающий список'};
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2800);}
async function api(url, opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Не удалось выполнить запрос');return data;}
function dateFmt(s){return new Date(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});}
async function loadForms(){
  try{
    forms=await api('/api/forms');
    $('#stat-forms').textContent=forms.length;
    $('#stat-published').textContent=forms.filter(f=>f.status==='published').length;
    $('#stat-submissions').textContent=forms.reduce((n,f)=>n+f.submissionsCount,0);
    const analytics=await Promise.all(forms.filter(f=>f.status==='published').map(f=>api(`/api/forms/${f.id}/analytics`).catch(()=>({views:0,submits:0,conversion:0}))));
    const totalViews=analytics.reduce((n,a)=>n+a.views,0), totalSubmits=analytics.reduce((n,a)=>n+a.submits,0);
    $('#stat-conversion').textContent=totalViews?`${Math.round(totalSubmits/totalViews*100)}%`:'—';
    const list=$('#forms-list');
    if(!forms.length){list.innerHTML=`<div class="empty"><div class="empty-icon">▤</div><h3>Пока нет форм</h3><p>Создайте первую форму отклика — это займёт всего несколько минут.</p><button class="btn btn-primary" onclick="document.querySelector('#new-form-btn').click()">Создать первую форму</button></div>`;return;}
    list.innerHTML=forms.map(f=>`<article class="form-card"><div class="form-icon">▤</div><div class="form-info"><h3>${escapeHtml(f.title)}</h3><div class="meta"><span>${f.questions.length} вопросов</span><span>${f.submissionsCount} ответов</span><span>Изменена ${dateFmt(f.updatedAt)}</span></div></div><span class="status ${f.status}">${f.status==='published'?'Опубликована':'Черновик'}</span><div class="actions"><button class="btn btn-secondary" data-edit="${f.id}">Редактировать</button>${f.status==='published'?`<button class="btn btn-secondary" data-results="${f.id}">Ответы ↗</button><button class="btn btn-ghost" title="Скопировать ссылку" data-copy="${f.id}">⧉</button>`:''}</div></article>`).join('');
    list.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.edit));
    list.querySelectorAll('[data-results]').forEach(b=>b.onclick=()=>location.href=`/admin/forms/${b.dataset.results}`);
    list.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyLink(b.dataset.copy));
  }catch(e){$('#forms-list').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`;}
}
async function copyLink(id){const url=`${location.origin}/f/${id}`;try{await navigator.clipboard.writeText(url);toast('Ссылка скопирована');}catch{prompt('Скопируйте ссылку:',url);}}
function showEditor(){ $('#editor').classList.remove('hidden'); $('#editor').scrollIntoView({behavior:'smooth',block:'start'}); }
function hideEditor(){ $('#editor').classList.add('hidden'); currentId=null; questions=[]; currentStatus='draft'; structureLocked=false; $('#publish-result').classList.add('hidden'); }
async function openEditor(id=null){
  currentId=id; questions=[]; currentStatus='draft'; structureLocked=false; $('#editor-message').innerHTML=''; $('#publish-result').classList.add('hidden');
  if(id){const f=await api(`/api/forms/${id}`);currentStatus=f.status;structureLocked=f.status==='published'&&f.submissionsCount>0;$('#editor-heading').textContent='Редактирование формы';$('#form-title').value=f.title;$('#form-description').value=f.description||'';questions=f.questions.map(q=>({...q,options:[...(q.options||[])]}));}
  else {$('#editor-heading').textContent='Новая форма';$('#form-title').value='';$('#form-description').value='';}
  $('#save-btn').textContent=currentStatus==='published'?'Сохранить изменения':'Сохранить черновик';
  $('#publish-btn').textContent=currentStatus==='published'?'Открыть ссылку ↗':'Опубликовать ↗';
  $('#editor-message').innerHTML=structureLocked
    ? '<div class="notice">На эту форму уже получены ответы. Чтобы не нарушить историю заявок, вопросы заблокированы. Название и описание можно изменять. Для другой структуры создайте новую форму.</div>'
    : currentStatus==='published'
      ? '<div class="notice">Форма опубликована. Сохранённые изменения сразу видны студентам по прежней ссылке.</div>' : '';
  $('#add-question').disabled=structureLocked;
  renderQuestions();showEditor();
}
function addQuestion(){if(structureLocked)return;questions.push({id:crypto.randomUUID(),label:'',type:'text',required:false,options:[]});renderQuestions();}
function renderQuestions(){
  $('#question-count').textContent=`${questions.length} ${questions.length===1?'вопрос':questions.length>1&&questions.length<5?'вопроса':'вопросов'}`;
  $('#question-list').innerHTML=questions.map((q,i)=>`<div class="question-card" data-q="${q.id}"><div class="question-top"><span class="question-number">${i+1}</span><input class="question-label-input" data-field="label" value="${escapeHtml(q.label)}" placeholder="Текст вопроса, например: Расскажите о себе"><button class="btn btn-ghost" data-remove="${q.id}" title="Удалить вопрос">✕</button></div><div class="question-controls"><select data-field="type" aria-label="Тип вопроса">${Object.entries(typeNames).map(([v,n])=>`<option value="${v}" ${q.type===v?'selected':''}>${n}</option>`).join('')}</select><label class="required-toggle"><input data-field="required" type="checkbox" ${q.required?'checked':''}> Обязательный</label></div>${choiceTypes.includes(q.type)?`<div class="answer-options" style="margin-top:12px;display:grid;gap:8px">${q.options.map((option,j)=>`<div style="display:flex;gap:8px;align-items:center"><input class="options-input" style="margin-top:0;flex:1;min-width:0" data-option-index="${j}" value="${escapeHtml(option)}" placeholder="Вариант ${j+1}"><button class="btn btn-ghost" data-remove-option="${j}" type="button" title="Удалить вариант">✕</button></div>`).join('')}<button class="btn btn-secondary" data-add-option type="button">＋ Добавить вариант</button></div>`:''}</div>`).join('');
  $('#question-list').querySelectorAll('.question-card').forEach(card=>{
    if(structureLocked){card.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);return;}
    const id=card.dataset.q;
    card.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',()=>{
      const q=questions.find(x=>x.id===id);if(!q)return;
      if(el.dataset.field==='required')q.required=el.checked;
      else if(el.dataset.field==='options')q.options=el.value.split(',').map(s=>s.trim()).filter(Boolean);
      else q[el.dataset.field]=el.value;
      if(el.dataset.field==='type')renderQuestions();renderPreview();
    }));
    card.querySelectorAll('[data-option-index]').forEach(el=>el.addEventListener('input',()=>{
      const q=questions.find(x=>x.id===id);if(!q)return;
      q.options[Number(el.dataset.optionIndex)]=el.value;
      renderPreview();
    }));
    const addOption=card.querySelector('[data-add-option]');
    if(addOption)addOption.onclick=()=>{
      const q=questions.find(x=>x.id===id);if(!q)return;
      q.options.push('');renderQuestions();
      const updated=[...document.querySelectorAll('.question-card')].find(el=>el.dataset.q===id);
      updated?.querySelector(`[data-option-index="${q.options.length-1}"]`)?.focus();
    };
    card.querySelectorAll('[data-remove-option]').forEach(el=>el.onclick=()=>{
      const q=questions.find(x=>x.id===id);if(!q)return;
      q.options.splice(Number(el.dataset.removeOption),1);renderQuestions();
    });
    card.querySelector('[data-remove]').onclick=()=>{questions=questions.filter(q=>q.id!==id);renderQuestions();};
  });
  renderPreview();
}
function renderPreview(){
  $('#preview-title').textContent=$('#form-title').value.trim()||'Название формы';
  $('#preview-description').textContent=$('#form-description').value.trim()||'Описание формы появится здесь.';
  $('#preview-questions').innerHTML=questions.map((q,i)=>`<div class="preview-question"><label>${i+1}. ${escapeHtml(q.label||'Текст вопроса')}${q.required?' *':''}</label>${q.type==='textarea'?'<textarea disabled placeholder="Ваш ответ"></textarea>':choiceTypes.includes(q.type)?q.options.map(o=>`<div class="choice"><input type="${q.type==='checkbox'?'checkbox':'radio'}" disabled><span>${escapeHtml(o)}</span></div>`).join(''):`<input disabled placeholder="${q.type==='email'?'name@example.com':'Ваш ответ'}">`}</div>`).join('')||'<p class="muted small">Добавьте вопросы, чтобы увидеть их здесь.</p>';
}
async function saveForm(publish=false){
  const title=$('#form-title').value.trim(), description=$('#form-description').value.trim();
  if(!title){$('#editor-message').innerHTML='<div class="notice error">Введите название формы.</div>';return;}
  if(publish&&!questions.length){$('#editor-message').innerHTML='<div class="notice error">Добавьте хотя бы один вопрос.</div>';return;}
  if(publish&&questions.some(q=>choiceTypes.includes(q.type)&&!q.options.some(o=>o.trim()))){$('#editor-message').innerHTML='<div class="notice error">Добавьте хотя бы один вариант ответа.</div>';return;}
  if(publish&&questions.some(q=>!q.label.trim())){$('#editor-message').innerHTML='<div class="notice error">Заполните текст каждого вопроса.</div>';return;}
  try{
    let form;
    if(!currentId){form=await api('/api/forms',{method:'POST',body:JSON.stringify({title,description})});currentId=form.id;}
    form=await api(`/api/forms/${currentId}`,{method:'PUT',body:JSON.stringify({title,description,questions:questions.map(q=>({...q,options:q.options.map(o=>o.trim()).filter(Boolean)}))})});
    if(publish){form=await api(`/api/forms/${currentId}/publish`,{method:'POST',body:'{}'});$('#publish-result').classList.remove('hidden');$('#publish-result').innerHTML=`<div class="notice success">✓ Форма опубликована и доступна студентам.</div><h2>Ссылка на форму</h2><p class="muted">Отправьте эту ссылку участникам.</p><div class="toolbar" style="margin-top:14px"><input id="published-url" readonly value="${location.origin}${form.url}" style="flex:1;min-width:180px;border:1px solid var(--line);border-radius:9px;padding:11px"><button class="btn btn-primary" id="copy-published">Скопировать ссылку</button><a class="btn btn-secondary" target="_blank" href="${form.url}">Открыть форму ↗</a></div>`;$('#copy-published').onclick=()=>copyLink(currentId);}
    else $('#editor-message').innerHTML=`<div class="notice success">${currentStatus==='published'?'Изменения опубликованной формы сохранены.':'Черновик сохранён. Его можно продолжить позже.'}</div>`;
    currentStatus=form.status;
    $('#save-btn').textContent=currentStatus==='published'?'Сохранить изменения':'Сохранить черновик';
    $('#publish-btn').textContent=currentStatus==='published'?'Открыть ссылку ↗':'Опубликовать ↗';
    await loadForms();
    if(publish)toast('Форма опубликована');else toast('Изменения сохранены');
  }catch(e){$('#editor-message').innerHTML=`<div class="notice error">${escapeHtml(e.message)}</div>`;}
}
$('#new-form-btn').onclick=()=>openEditor();
$('#refresh-btn').onclick=loadForms;
$('#close-editor').onclick=e=>{e.preventDefault();hideEditor();};
$('#add-question').onclick=addQuestion;
$('#save-btn').onclick=()=>saveForm(false);
$('#publish-btn').onclick=()=>saveForm(true);
$('#form-title').addEventListener('input',renderPreview);
$('#form-description').addEventListener('input',renderPreview);
loadForms();
