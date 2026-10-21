const root=document.querySelector('#form-root');
const id=location.pathname.split('/').filter(Boolean).pop();
const sessionKey=`fc-session-${id}`;
let sessionId=sessionStorage.getItem(sessionKey);
if(!sessionId){sessionId=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`);sessionStorage.setItem(sessionKey,sessionId);}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Произошла ошибка');return d;}
async function event(type){try{await api(`/api/forms/${id}/events`,{method:'POST',body:JSON.stringify({type,sessionId})});}catch{}}
function inputFor(q){
  if(q.type==='textarea')return `<textarea name="${esc(q.id)}" ${q.required?'required':''} placeholder="Введите ответ"></textarea>`;
  if(q.type==='radio')return q.options.map((o,i)=>`<label class="choice"><input type="radio" name="${esc(q.id)}" value="${esc(o)}" ${q.required&&i===0?'required':''}><span>${esc(o)}</span></label>`).join('');
  if(q.type==='checkbox')return q.options.map(o=>`<label class="choice"><input type="checkbox" name="${esc(q.id)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('');
  if(q.type==='select')return `<select name="${esc(q.id)}" ${q.required?'required':''}><option value="">Выберите вариант</option>${q.options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
  return `<input type="${q.type==='email'?'email':'text'}" name="${esc(q.id)}" ${q.required?'required':''} maxlength="${q.type==='email'?254:5000}" placeholder="${q.type==='email'?'name@example.com':'Введите ответ'}">`;
}
function render(form){
  if(form.status!=='published'){root.innerHTML='<div class="success-screen"><div class="success-mark">!</div><h1>Форма пока недоступна</h1><p class="subtitle">Организатор ещё не опубликовал эту форму.</p></div>';return;}
  root.innerHTML=`<div class="eyebrow">Форма отклика</div><h1>${esc(form.title)}</h1>${form.description?`<p class="subtitle">${esc(form.description)}</p>`:''}<div class="progress-row"><span>Заполнение формы</span><span id="progress-label">0%</span></div><div class="progress-track"><div class="progress-bar" id="progress-bar"></div></div><form id="response-form" novalidate>${form.questions.map((q,i)=>`<div class="public-question"><label for="field-${esc(q.id)}">${i+1}. ${esc(q.label)} ${q.required?'<span class="req">*</span>':''}</label><div id="field-${esc(q.id)}">${inputFor(q)}</div></div>`).join('')}<div id="form-message"></div><div class="public-footer"><span class="muted small">* Обязательные поля</span><button class="btn btn-primary" type="submit">Отправить ответы ↗</button></div></form>`;
  const formEl=document.querySelector('#response-form');
  let started=false;
  const updateProgress=()=>{
    const fields=[...formEl.querySelectorAll('input:not([type=radio]):not([type=checkbox]),textarea,select')];
    const radioNames=[...new Set([...formEl.querySelectorAll('input[type=radio]')].map(x=>x.name))];
    const checkboxNames=[...new Set([...formEl.querySelectorAll('input[type=checkbox]')].map(x=>x.name))];
    const all=[...fields,...radioNames.map(n=>formEl.querySelector(`input[name="${CSS.escape(n)}"]`)),...checkboxNames.map(n=>formEl.querySelector(`input[name="${CSS.escape(n)}"]`))];
    const filled=all.filter(el=>el.type==='radio'?formEl.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`):el.type==='checkbox'?formEl.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`):String(el.value).trim()).length;
    const percent=all.length?Math.round(filled/all.length*100):0;
    document.querySelector('#progress-bar').style.width=percent+'%';document.querySelector('#progress-label').textContent=percent+'%';
    if(!started&&percent>0){started=true;event('start');}
    if(started)event('progress');
  };
  formEl.addEventListener('input',updateProgress);formEl.addEventListener('change',updateProgress);
  formEl.addEventListener('submit',async e=>{
    e.preventDefault();const msg=document.querySelector('#form-message');msg.innerHTML='';
    if(!formEl.reportValidity()){msg.innerHTML='<div class="notice error">Проверьте обязательные поля и формат ответов.</div>';return;}
    const answers={};
    for(const q of form.questions){
      if(q.type==='checkbox')answers[q.id]=[...formEl.querySelectorAll(`input[name="${CSS.escape(q.id)}"]:checked`)].map(x=>x.value);
      else if(q.type==='radio')answers[q.id]=formEl.querySelector(`input[name="${CSS.escape(q.id)}"]:checked`)?.value||'';
      else answers[q.id]=formEl.elements[q.id]?.value||'';
    }
    const button=formEl.querySelector('button[type=submit]');button.disabled=true;button.textContent='Отправляем…';
    try{await api(`/api/forms/${id}/submissions`,{method:'POST',body:JSON.stringify({answers,sessionId})});root.innerHTML='<div class="success-screen"><div class="success-mark">✓</div><h1>Ответ отправлен!</h1><p class="subtitle">Спасибо за интерес. Ваши ответы сохранены.</p></div>';}
    catch(err){msg.innerHTML=`<div class="notice error">${esc(err.message)}</div>`;button.disabled=false;button.textContent='Отправить ответы ↗';}
  });
}
(async()=>{try{const form=await api(`/api/forms/${id}`);document.title=`${form.title} — FormCraft`;if(form.status==='published')event('view');render(form);}catch(e){root.innerHTML=`<div class="success-screen"><div class="success-mark">!</div><h1>Форма не найдена</h1><p class="subtitle">Проверьте ссылку или попросите организатора отправить её повторно.</p><a class="btn btn-secondary" href="/admin">На главную</a></div>`;}})();
