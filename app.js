(function(){
  // DOM
  const fileInput = document.getElementById('fileInput');
  const categoryScreen = document.getElementById('categoryScreen');
  const categoryList = document.getElementById('categoryList');
  const homeBtn = document.getElementById('homeBtn');
  const restartBtn = document.getElementById('restartBtn');

  const quizCard = document.getElementById('quizCard');
  const crumbs = document.getElementById('crumbs');
  const qIndex = document.getElementById('qIndex');
  const contextBox = document.getElementById('contextBox');
  const promptBox = document.getElementById('promptBox');
  const answersWrap = document.getElementById('answers');
  const feedback = document.getElementById('feedback');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const exitBtn = document.getElementById('exitBtn');

  const pFill = document.getElementById('pFill');
  const pText = document.getElementById('pText');

  const resultCard = document.getElementById('resultCard');
  const statCorrect = document.getElementById('statCorrect');
  const statWrong = document.getElementById('statWrong');
  const statAccuracy = document.getElementById('statAccuracy');

  const AUTO_DELAY_MS = 1000; // giảm nhẹ để mượt

  let bank = []; // toàn bộ câu hỏi (cố định + import)
  let currentSet = []; // theo danh mục đã chọn
  let idx = 0;
  let correctCount = 0;
  let locked = false;
  let answered = new Map(); // idx -> {choice, correct}

  // ép mọi câu hỏi vào đúng Folder mặc định nếu thiếu category
  const CAT_NAME = 'Word in Context - Part 1';
  const ensureCategory = (items) =>
    items.map(q => q ? ({...q, category: q.category || CAT_NAME}) : q).filter(Boolean);

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const letterFromIndex = (i) => ['A','B','C','D'][i] || '';

  function show(el){ el.classList.remove('hidden'); }
  function hide(el){ el.classList.add('hidden'); }

  function setProgress(){
    const total = currentSet.length;
    const done = clamp(idx+1,0,total);
    pText.textContent = `${done}/${total}`;
    const pct = total? (done/total)*100 : 0;
    pFill.style.width = pct + '%';
    qIndex.textContent = `${done}/${total}`;
  }

  // Tách context và prompt “Which choice…”
  function splitQuestionText(qstr){
    const marker = /Which choice completes the text with the most logical and precise word or phrase\?/i;
    const parts = qstr.split(marker);
    const context = (parts[0]||'').trim();
    const prompt = 'Which choice completes the text with the most logical and precise word or phrase?';
    return { context, prompt };
  }

  // Ưu tiên category gắn trong dữ liệu
  function detectCategory(item){
    return item.category || CAT_NAME;
  }

  function buildCategories(){
    const groups = new Map();
    bank.forEach((q,i)=>{
      const cat = detectCategory(q);
      if(!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(i);
    });
    renderCategoryList(groups);
  }

  function renderCategoryList(groups){
    categoryList.innerHTML = '';
    // Convert to array for stable order
    const arr = Array.from(groups.entries());
    arr.sort((a,b)=> a[0].localeCompare(b[0]));
    arr.forEach(([name, indexes])=>{
      const div = document.createElement('button');
      div.className = 'category btn';
      div.innerHTML = `<span>${escapeHTML(name)}</span><span class="count">${indexes.length} câu</span>`;
      div.addEventListener('click', ()=> startSet(name, indexes.map(i=>bank[i])));
      categoryList.appendChild(div);
    });
    // All questions option
    const allBtn = document.createElement('button');
    allBtn.className = 'category btn';
    allBtn.innerHTML = `<span>Tất cả câu hỏi</span><span class="count">${bank.length} câu</span>`;
    allBtn.addEventListener('click', ()=> startSet('Tất cả', bank.slice()));
    categoryList.prepend(allBtn);
  }

  function startSet(catName, items){
    currentSet = items;
    idx = 0; correctCount = 0; answered = new Map(); locked = false;
    crumbs.textContent = `Danh mục: ${catName}`;
    show(quizCard); hide(categoryScreen); hide(resultCard);
    restartBtn.disabled = false;
    renderQuestion();
  }

  function renderQuestion(){
    if(idx >= currentSet.length){ return showResult(); }
    const q = currentSet[idx];
    const {context, prompt} = splitQuestionText(q.question || '');
    contextBox.textContent = context;
    promptBox.textContent = prompt;

    answersWrap.innerHTML = '';
    const opts = q.options || [q.A, q.B, q.C, q.D].filter(v=>v!==undefined);
    opts.slice(0,4).forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'answer';
      btn.setAttribute('data-index', i);
      btn.setAttribute('aria-label', `Đáp án ${letterFromIndex(i)}`);
      btn.innerHTML = `<span class="pill">${letterFromIndex(i)}</span> <span>${escapeHTML(String(opt))}</span>`;
      btn.addEventListener('click', () => handleAnswer(i, btn));
      answersWrap.appendChild(btn);
    });

    // restore if answered before
    const prev = answered.get(idx);
    if(prev){
      const btn = answersWrap.querySelector(`[data-index="${prev.choice}"]`);
      if(btn){
        btn.classList.add(prev.correct? 'correct':'wrong');
        [...answersWrap.querySelectorAll('.answer')].forEach(b=>b.disabled=true);
      }
    }

    setProgress();
    prevBtn.disabled = idx<=0;
    nextBtn.disabled = idx >= currentSet.length-1;
  }

  function normalizeCorrect(correct){
    if(typeof correct === 'number') return clamp(correct,0,3);
    const s = String(correct || '').trim();
    if(/^[0-3]$/.test(s)) return clamp(parseInt(s,10),0,3);
    if(/^[1-4]$/.test(s)) return clamp(parseInt(s,10)-1,0,3);
    const map = { 'A':0,'B':1,'C':2,'D':3 };
    return map[s.toUpperCase()] ?? 0;
  }

  function flash(type, msg){
    feedback.textContent = msg;
    feedback.className = `feedback show ${type}`;
    clearTimeout(flash._t);
    flash._t = setTimeout(()=> feedback.className = 'feedback', 900);
  }

  function handleAnswer(choiceIndex, btn){
    if(locked) return;
    locked = true;
    const q = currentSet[idx];
    const correctIndex = normalizeCorrect(q.correct);
    const buttons = [...answersWrap.querySelectorAll('.answer')];
    buttons.forEach(b=>b.disabled = true);

    const ok = (choiceIndex === correctIndex);
    if(ok){ btn.classList.add('correct'); correctCount++; flash('ok','✅ Chính xác!'); }
    else {
      btn.classList.add('wrong');
      const correctBtn = answersWrap.querySelector(`[data-index="${correctIndex}"]`);
      if(correctBtn) correctBtn.classList.add('correct');
      flash('bad','❌ Chưa đúng');
    }

    answered.set(idx, {choice: choiceIndex, correct: ok});
    setTimeout(()=>{ locked=false; }, AUTO_DELAY_MS/2);
  }

  function showResult(){
    hide(quizCard); show(resultCard);
    const total = currentSet.length; const wrong = total - correctCount;
    const acc = total? Math.round((correctCount/total)*100) : 0;
    statCorrect.textContent = correctCount;
    statWrong.textContent = wrong;
    statAccuracy.textContent = acc + '%';
  }

  function escapeHTML(str){
    return String(str).replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
  }

  /* File import (optional) */
  fileInput.addEventListener('change', (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const reader = new FileReader();
    reader.onload = () => {
      let data = [];
      if(ext === 'json') data = loadFromJSON(reader.result);
      else data = parseCSV(reader.result);
      if(!data.length){ alert('Không đọc được dữ liệu. Kiểm tra lại định dạng.'); return; }
      data = ensureCategory(data);
      bank = bank.concat(data);
      localStorage.setItem('quizFixedBank', JSON.stringify(bank));
      buildCategories();
      alert('Đã thêm câu hỏi mới vào ngân hàng cố định.');
    };
    reader.readAsText(file, 'utf-8');
  });

  function parseCSV(text){
    const rows = [];
    let i=0, field='', row=[], inQuotes=false;
    while(i <= text.length){
      const ch = text[i];
      if(inQuotes){
        if(ch === '"' && text[i+1] === '"'){ field += '"'; i+=2; continue; }
        if(ch === '"'){ inQuotes = false; i++; continue; }
        if(ch === undefined){ row.push(field); rows.push(row); break; }
        field += ch; i++; continue;
      }
      if(ch === '"'){ inQuotes = true; i++; continue; }
      if(ch === ',' || ch === ';'){ row.push(field); field=''; i++; continue; }
      if(ch === '\n' || ch === '\r' || ch === undefined){
        row.push(field); field='';
        if(row.some(cell=>cell!=='')) rows.push(row);
        row=[]; i++; continue;
      }
      field += ch; i++;
    }
    if(!rows.length) return [];
    const header = rows[0].map(h=>h.trim());
    const looksLikeHeader = /question/i.test(header[0] || '') || header.length >= 5;
    const start = looksLikeHeader ? 1 : 0;
    const data = rows.slice(start).map(cols => {
      const cells = cols.map(c=>c.trim());
      if(looksLikeHeader){
        const obj = {}; header.forEach((h, i) => obj[h] = cells[i] ?? '');
        return normalizeRow(obj);
      } else {
        const obj = { question: cells[0], A: cells[1], B: cells[2], C: cells[3], D: cells[4], correct: cells[5] };
        return normalizeRow(obj);
      }
    }).filter(Boolean);
    return data;
  }

  function normalizeRow(obj){
    if(!obj) return null;
    const q = String(obj.question || obj.Question || '').trim();
    const A = obj.A ?? (obj.options?.[0]) ?? obj.a;
    const B = obj.B ?? (obj.options?.[1]) ?? obj.b;
    const C = obj.C ?? (obj.options?.[2]) ?? obj.c;
    const D = obj.D ?? (obj.options?.[3]) ?? obj.d;
    let correct = obj.correct ?? obj.Correct ?? obj.answer ?? obj.Answer;
    const options = [A,B,C,D].map(v => v === undefined ? '' : String(v));
    if(!q || options.filter(Boolean).length < 2) return null;
    return { question: q, options, correct, category: obj.category || obj.Category };
  }

  function loadFromJSON(text){
    try{
      const parsed = JSON.parse(text);
      if(Array.isArray(parsed)) return parsed.map(normalizeRow).filter(Boolean);
    }catch(e){ alert('Lỗi JSON: ' + e.message); }
    return [];
  }

  // Navigation
  prevBtn.addEventListener('click', ()=>{ idx = Math.max(0, idx-1); renderQuestion(); });
  nextBtn.addEventListener('click', ()=>{
    if(idx < currentSet.length-1){ idx++; renderQuestion(); }
    else { showResult(); }
  });
  document.addEventListener('keydown', (e)=>{
    const key = e.key.toUpperCase();
    if(['A','B','C','D'].includes(key) && !locked && !quizCard.classList.contains('hidden')){
      const map = { 'A':0,'B':1,'C':2,'D':3 };
      const i = map[key];
      const btn = answersWrap.querySelector(`[data-index="${i}"]`);
      if(btn) btn.click();
    }
    if(e.key === 'ArrowLeft' && !quizCard.classList.contains('hidden')) prevBtn.click();
    if(e.key === 'ArrowRight' && !quizCard.classList.contains('hidden')) nextBtn.click();
    if(e.key === 'Escape' && !quizCard.classList.contains('hidden')) exitBtn.click();
  });

  // Home & restart & exit
  homeBtn.addEventListener('click', ()=>{ hide(quizCard); hide(resultCard); show(categoryScreen); });
  restartBtn.addEventListener('click', ()=>{ if(currentSet.length){ idx=0; correctCount=0; answered=new Map(); renderQuestion(); show(quizCard); hide(resultCard);} });
  exitBtn.addEventListener('click', ()=>{ hide(quizCard); hide(resultCard); show(categoryScreen); });

  // Load fixed bank from bundled JSON then from localStorage (append)
  async function init(){
    try{
      const res = await fetch('./satquiz/exam.json', {cache:'no-store'});
      const base = res.ok ? (await res.json()) : [];
      bank = ensureCategory(base.map(normalizeRow).filter(Boolean));
    }catch{ bank = []; }
    // append user-saved items
    try{
      const extra = JSON.parse(localStorage.getItem('quizFixedBank')||'[]');
      if(Array.isArray(extra)) bank = bank.concat(ensureCategory(extra.map(normalizeRow).filter(Boolean)));
    }catch{}
    buildCategories();
    show(categoryScreen); hide(quizCard); hide(resultCard);
  }
  init();
})();
function showQuestion() {
  const currentQuestion = questions[currentIndex];
  
  // Context
  const contextEl = document.querySelector(".context");
  contextEl.textContent = currentQuestion.context || "";

  // Prompt
  const promptEl = document.querySelector(".prompt");
  promptEl.textContent = currentQuestion.prompt || "Which choice completes the text with the most logical and precise word or phrase?";

  // Options
  const answerButtons = document.querySelectorAll(".answer");
  answerButtons.forEach((btn, idx) => {
    btn.querySelector("span").textContent = currentQuestion.options[idx];
  });
}


