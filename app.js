/* =========================================================
   QUIZ APP – Full JS (optimized)
   - Modal frontend (không prompt)
   - Lưu tiến độ theo USER + CATEGORY
   - Tiếp tục / Review / Làm lại (xóa tiến độ)
   - Import + khử trùng lặp
   - Hỗ trợ answer: "A|B|C|D" / 1..4 / 0..3 / "chuỗi nội dung"
   ========================================================= */
(function () {
  // ---------- DOM ----------
  const fileInput      = document.getElementById('fileInput');
  const categoryScreen = document.getElementById('categoryScreen');
  const categoryList   = document.getElementById('categoryList');
  const homeBtn        = document.getElementById('homeBtn');
  const restartBtn     = document.getElementById('restartBtn');

  const quizCard       = document.getElementById('quizCard');
  const crumbs         = document.getElementById('crumbs');
  const qIndex         = document.getElementById('qIndex');
  const contextBox     = document.getElementById('contextBox');
  const promptBox      = document.getElementById('promptBox');
  const answersWrap    = document.getElementById('answers');
  const feedback       = document.getElementById('feedback');
  const prevBtn        = document.getElementById('prevBtn');
  const nextBtn        = document.getElementById('nextBtn');
  const exitBtn        = document.getElementById('exitBtn');

  const pFill          = document.getElementById('pFill');
  const pText          = document.getElementById('pText');

  const resultCard     = document.getElementById('resultCard');
  const statCorrect    = document.getElementById('statCorrect');
  const statWrong      = document.getElementById('statWrong');
  const statAccuracy   = document.getElementById('statAccuracy');

  const userChip       = document.getElementById('userChip');
  const switchUserBtn  = document.getElementById('switchUserBtn');

  // ---------- Modal ----------
  const modalOverlay   = document.getElementById('modalOverlay');
  const modal          = document.getElementById('resumeModal');
  const modalTitle     = document.getElementById('modalTitle');
  const modalDesc      = document.getElementById('modalDesc');
  const modalContinue  = document.getElementById('modalContinue');
  const modalReview    = document.getElementById('modalReview');
  const modalReset     = document.getElementById('modalReset');
  const modalCancel    = document.getElementById('modalCancel');
  const modalClose     = document.getElementById('modalClose');

  // Force hide modal on load
  if (modalOverlay) { modalOverlay.classList.add('hidden'); modalOverlay.classList.remove('show'); }
  if (modal)        { modal.classList.add('hidden');        modal.classList.remove('show'); }

  // ---------- STATE ----------
  const AUTO_DELAY_MS  = 800;
  const DEFAULT_CAT    = 'Word in Context - Part 1';
  const STORAGE_NS     = 'quizProgress_v5';

  let bank = [];         // full bank (base + import)
  let baseBank = [];     // base exam.json
  let currentSet = [];   // questions in selected category
  let currentSetIdxs = [];
  let currentCatName = '';
  let idx = 0;
  let correctCount = 0;
  let locked = false;
  let answered = new Map();  // Map<idx, {choice, correct}>
  let reviewMode = false;

  // ---------- USER ----------
  let USER_ID = localStorage.getItem('quizUserId') || '';
  function ensureUser() {
    if (!USER_ID) {
      USER_ID = (prompt('Nhập tên người dùng:', 'Khách') || 'Khách').trim();
      localStorage.setItem('quizUserId', USER_ID);
    }
    if (userChip) userChip.textContent = `👤 ${USER_ID}`;
  }
  ensureUser();

  if (switchUserBtn) {
    switchUserBtn.addEventListener('click', () => {
      const name = (prompt('Nhập tên người dùng mới:', USER_ID) || '').trim();
      if (!name) return;
      USER_ID = name;
      localStorage.setItem('quizUserId', USER_ID);
      if (userChip) userChip.textContent = `👤 ${USER_ID}`;
    });
  }

  const catKey = (cat) => `${STORAGE_NS}:${USER_ID}:${cat}`;

  function saveCategoryProgress() {
    if (!currentSetIdxs.length || !currentCatName) return;
    const payload = {
      user: USER_ID,
      timestamp: Date.now(),
      catName: currentCatName,
      idx,
      correctCount,
      answered: Array.from(answered.entries()),
      setIdxs: currentSetIdxs
    };
    try { localStorage.setItem(catKey(currentCatName), JSON.stringify(payload)); } catch {}
  }
  function loadCategoryProgress(catName) {
    try {
      const raw = localStorage.getItem(catKey(catName));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function clearCategoryProgress(catName) {
    try { localStorage.removeItem(catKey(catName)); } catch {}
  }
  window.addEventListener('beforeunload', () => saveCategoryProgress());

  // ---------- HELPERS ----------
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const letterFromIndex = (i) => ['A','B','C','D'][i] || '';
  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');
  function escapeHTML(str){
    return String(str).replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  function setProgress() {
    const total = currentSet.length;
    const done = clamp(idx+1,0,total);
    pText.textContent = `${done}/${total}`;
    pFill.style.width = (total ? (done/total)*100 : 0) + '%';
    qIndex.textContent = `${done}/${total}`;
  }

  function splitQuestionText(qstr='') {
    const marker = /Which choice completes the text with the most logical and precise word or phrase\?/i;
    const parts = String(qstr).split(marker);
    return {
      context: (parts[0] || '').trim(),
      prompt: 'Which choice completes the text with the most logical and precise word or phrase?'
    };
  }

  const ensureCategory = (items) =>
    items.map(q => q ? ({...q, category: q.category || DEFAULT_CAT}) : q).filter(Boolean);

  function makeSig(q){
    const base = (q.context || q.question || '').trim().toLowerCase();
    const pr   = (q.prompt || '').trim().toLowerCase();
    const opts = (q.options || []).map(s => String(s).trim().toLowerCase()).join('|');
    return `${base}|${pr}|${opts}`;
  }
  function dedupeBank(list){
    const seen = new Set(); const out = [];
    for(const q of list){
      const sig = makeSig(q);
      if(!seen.has(sig)){ seen.add(sig); out.push(q); }
    }
    return out;
  }

  // ---------- NORMALIZE ----------
  function normalizeCorrect(correct, options = []) {
    if (typeof correct === 'number') return clamp((correct>=1 && correct<=4 ? correct-1 : correct), 0, 3);
    const s = String(correct || '').trim();
    if (/^[0-3]$/.test(s)) return parseInt(s,10);
    if (/^[1-4]$/.test(s)) return parseInt(s,10)-1;
    const map = { A:0, B:1, C:2, D:3 };
    if (map[s.toUpperCase()] !== undefined) return map[s.toUpperCase()];
    const i = options.findIndex(opt => String(opt).trim() === s);
    return i >= 0 ? i : 0;
  }

  function normalizeRow(obj){
    if(!obj) return null;
    const q = String(obj.question || obj.Question || '').trim();
    const context = obj.context ?? obj.Context ?? '';
    const prompt  = obj.prompt ?? obj.Prompt ?? 'Which choice completes the text with the most logical and precise word or phrase?';

    const A = obj.A ?? obj.a ?? obj.options?.[0];
    const B = obj.B ?? obj.b ?? obj.options?.[1];
    const C = obj.C ?? obj.c ?? obj.options?.[2];
    const D = obj.D ?? obj.d ?? obj.options?.[3];
    const options = [A,B,C,D].map(v => v === undefined ? '' : String(v));
    if (options.filter(Boolean).length < 2) return null;

    const rawCorrect = obj.correct ?? obj.Correct ?? obj.answer ?? obj.Answer;
    const correct = normalizeCorrect(rawCorrect, options);
    return { question:q, context, prompt, options, correct, category: obj.category || obj.Category || DEFAULT_CAT };
  }

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
        if(row.some(c=>c!=='')) rows.push(row);
        row=[]; i++; continue;
      }
      field += ch; i++;
    }
    if(!rows.length) return [];
    const header = rows[0].map(h=>h.trim());
    const looksLikeHeader = /question/i.test(header[0] || '') || header.length >= 5;
    const start = looksLikeHeader ? 1 : 0;
    const data = rows.slice(start).map(cols=>{
      const cells = cols.map(c=>c.trim());
      if(looksLikeHeader){
        const obj = {}; header.forEach((h, i) => obj[h] = cells[i] ?? '');
        return normalizeRow(obj);
      }else{
        const obj = { question: cells[0], A: cells[1], B: cells[2], C: cells[3], D: cells[4], correct: cells[5] };
        return normalizeRow(obj);
      }
    }).filter(Boolean);
    return data;
  }

  function loadFromJSON(text){
    try{
      const parsed = JSON.parse(text);
      if(Array.isArray(parsed)) return parsed.map(normalizeRow).filter(Boolean);
    }catch(e){ alert('Lỗi JSON: ' + e.message); }
    return [];
  }

  // ---------- MODAL ----------
  let __pendingCat = null, __pendingIdxs = null, __pendingSaved = null;

  function openResumeModal(catName, idxs, saved){
    __pendingCat = catName; __pendingIdxs = idxs; __pendingSaved = saved;
    if (modalTitle) modalTitle.textContent = 'Tiếp tục danh mục?';
    if (modalDesc)  modalDesc.textContent  = `Danh mục "${catName}" đã có tiến độ. Chọn một thao tác:`;
    modalOverlay.classList.remove('hidden'); modal.classList.remove('hidden');
    modalOverlay.classList.add('show');      modal.classList.add('show');
    setTimeout(()=>{ try{ modalContinue && modalContinue.focus(); }catch{} }, 30);
  }
  function closeResumeModal(){
    modalOverlay.classList.remove('show'); modal.classList.remove('show');
    setTimeout(()=>{ modalOverlay.classList.add('hidden'); modal.classList.add('hidden'); }, 160);
  }

  modalContinue?.addEventListener('click', ()=>{
    closeResumeModal();
    if(__pendingCat) startSet(__pendingCat, __pendingIdxs, {mode:'continue', saved: __pendingSaved});
  });
  modalReview?.addEventListener('click', ()=>{
    closeResumeModal();
    if(__pendingCat) startSet(__pendingCat, __pendingIdxs, {mode:'review', saved: __pendingSaved});
  });
  modalReset?.addEventListener('click', ()=>{
    if(__pendingCat) clearCategoryProgress(__pendingCat);
    closeResumeModal();
    if(__pendingCat) startSet(__pendingCat, __pendingIdxs, {mode:'fresh'});
  });
  modalCancel?.addEventListener('click', closeResumeModal);
  modalClose?.addEventListener('click', closeResumeModal);
  modalOverlay?.addEventListener('click', (e)=>{ if(e.target === modalOverlay) closeResumeModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !modal.classList.contains('hidden')) closeResumeModal(); });

  // ---------- RENDER ----------
  function buildCategories(){
    const groups = new Map();
    bank.forEach((q,i)=>{
      const cat = q.category || DEFAULT_CAT;
      if(!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(i);
    });
    renderCategoryList(groups);
  }

  function renderCategoryList(groups){
    categoryList.innerHTML = '';
    const arr = Array.from(groups.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
    arr.forEach(([name, indexes])=>{
      const btn = document.createElement('button');
      btn.className = 'category btn';
      const saved = loadCategoryProgress(name);
      const tag = saved ? '• có tiến độ' : '';
      btn.innerHTML = `<span>${escapeHTML(name)}</span><span class="count">${indexes.length} câu ${tag}</span>`;
      btn.addEventListener('click', ()=>{
        const saved = loadCategoryProgress(name);
        if(saved && Array.isArray(saved.setIdxs) && saved.setIdxs.length){
          openResumeModal(name, indexes, saved);
        }else{
          startSet(name, indexes, {mode:'fresh'});
        }
      });
      categoryList.appendChild(btn);
    });

    const allBtn = document.createElement('button');
    allBtn.className = 'category btn';
    allBtn.innerHTML = `<span>Tất cả câu hỏi</span><span class="count">${bank.length} câu</span>`;
    allBtn.addEventListener('click', ()=>{
      const idxs = Array.from({length: bank.length}, (_,i)=>i);
      const saved = loadCategoryProgress('Tất cả');
      if(saved && Array.isArray(saved.setIdxs) && saved.setIdxs.length){
        openResumeModal('Tất cả', idxs, saved);
      }else{
        startSet('Tất cả', idxs, {mode:'fresh'});
      }
    });
    categoryList.prepend(allBtn);
  }

  function startSet(catName, idxs, opts={}){
    currentCatName = catName;
    currentSetIdxs = (idxs || []).slice();
    currentSet     = currentSetIdxs.map(i=>bank[i]).filter(Boolean);

    reviewMode = false;
    idx = 0; correctCount = 0; answered = new Map(); locked = false;

    if(opts.mode === 'continue' && opts.saved){
      const s = opts.saved;
      idx = clamp(s.idx || 0, 0, Math.max(0, currentSet.length - 1));
      correctCount = s.correctCount || 0;
      answered = new Map(s.answered || []);
    } else if (opts.mode === 'review' && opts.saved){
      const s = opts.saved;
      idx = 0;
      correctCount = s.correctCount || 0;
      answered = new Map(s.answered || []);
      reviewMode = true;
    }

    crumbs.textContent = `Danh mục: ${catName}${reviewMode ? ' • Review' : ''}`;
    show(quizCard); hide(categoryScreen); hide(resultCard);
    restartBtn.disabled = false;
    renderQuestion();
    saveCategoryProgress();
  }

  function renderQuestion(){
    if(idx >= currentSet.length) return showResult();
    const q = currentSet[idx];

    if(q.context || q.prompt){
      contextBox.textContent = (q.context || '').trim();
      promptBox.textContent  = (q.prompt  || 'Which choice completes the text with the most logical and precise word or phrase?').trim();
    }else{
      const { context, prompt } = splitQuestionText(q.question || '');
      contextBox.textContent = context;
      promptBox.textContent  = prompt;
    }

    answersWrap.innerHTML = '';
    const opts = (q.options || [q.A, q.B, q.C, q.D].filter(v=>v!==undefined)).slice(0,4);
    opts.forEach((opt, i)=>{
      const btn = document.createElement('button');
      btn.className = 'answer';
      btn.setAttribute('data-index', i);
      btn.setAttribute('aria-label', `Đáp án ${letterFromIndex(i)}`);
      btn.innerHTML = `<span class="pill">${letterFromIndex(i)}</span> <span>${escapeHTML(String(opt))}</span>`;
      if(!reviewMode) btn.addEventListener('click', ()=> handleAnswer(i, btn));
      answersWrap.appendChild(btn);
    });

    if(reviewMode){
      const correctIndex = (typeof q.correct === 'number')
        ? clamp(q.correct,0,3)
        : normalizeCorrect(q.correct, q.options || []);
      const prev = answered.get(idx);
      const correctBtn = answersWrap.querySelector(`[data-index="${correctIndex}"]`);
      if(correctBtn) correctBtn.classList.add('correct');
      if(prev && prev.choice !== correctIndex){
        const wrongBtn = answersWrap.querySelector(`[data-index="${prev.choice}"]`);
        if(wrongBtn) wrongBtn.classList.add('wrong');
      }
      [...answersWrap.querySelectorAll('.answer')].forEach(b=> b.disabled = true);
    } else {
      const prev = answered.get(idx);
      if(prev){
        const correctIndex = (typeof q.correct === 'number')
          ? clamp(q.correct,0,3)
          : normalizeCorrect(q.correct, q.options || []);
        const btn = answersWrap.querySelector(`[data-index="${prev.choice}"]`);
        if(btn){
          if(prev.choice === correctIndex) btn.classList.add('correct');
          else {
            btn.classList.add('wrong');
            const cBtn = answersWrap.querySelector(`[data-index="${correctIndex}"]`);
            if(cBtn) cBtn.classList.add('correct');
          }
          [...answersWrap.querySelectorAll('.answer')].forEach(b=> b.disabled = true);
        }
      }
    }

    setProgress();
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= currentSet.length - 1;
  }

  function flash(type, msg){
    feedback.textContent = msg;
    feedback.className = `feedback show ${type}`;
    clearTimeout(flash._t);
    flash._t = setTimeout(()=> feedback.className = 'feedback', 900);
  }

  function handleAnswer(choiceIndex, btn){
    if(locked || reviewMode) return;
    locked = true;

    const q = currentSet[idx];
    const correctIndex = (typeof q.correct === 'number')
      ? clamp(q.correct,0,3)
      : normalizeCorrect(q.correct, q.options || []);

    const buttons = [...answersWrap.querySelectorAll('.answer')];
    buttons.forEach(b=> b.disabled = true);

    const ok = (choiceIndex === correctIndex);
    if(ok){
      btn.classList.add('correct');
      correctCount++;
      flash('ok', '✅ Chính xác!');
    }else{
      btn.classList.add('wrong');
      const correctBtn = answersWrap.querySelector(`[data-index="${correctIndex}"]`);
      if(correctBtn) correctBtn.classList.add('correct');
      flash('bad', '❌ Chưa đúng');
    }

    answered.set(idx, {choice: choiceIndex, correct: ok});
    saveCategoryProgress();
    setTimeout(()=>{ locked = false; }, AUTO_DELAY_MS/2);
  }

  function showResult(){
    hide(quizCard); show(resultCard);
    const total = currentSet.length;
    const wrong = total - correctCount;
    const acc = total ? Math.round((correctCount/total)*100) : 0;
    statCorrect.textContent = correctCount;
    statWrong.textContent   = wrong;
    statAccuracy.textContent= acc + '%';
  }

  // ---------- IMPORT ----------
  fileInput.addEventListener('change', (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const reader = new FileReader();
    reader.onload = ()=>{
      let data = [];
      if(ext === 'json') data = loadFromJSON(reader.result);
      else data = parseCSV(reader.result);
      if(!data.length){ alert('Không đọc được dữ liệu. Kiểm tra lại định dạng.'); return; }
      data = ensureCategory(data);

      const merged = dedupeBank(bank.concat(data));
      const added  = merged.length - bank.length;
      bank = merged;

      try{
        const baseSigSet = new Set(baseBank.map(makeSig));
        const onlyExtra  = bank.filter(q => !baseSigSet.has(makeSig(q)));
        localStorage.setItem('quizFixedBank', JSON.stringify(onlyExtra));
      }catch{}

      buildCategories();
      alert(`Đã thêm ${added} câu mới (đã khử trùng lặp).`);
    };
    reader.readAsText(file, 'utf-8');
  });

  // ---------- NAV & SHORTCUTS ----------
  prevBtn.addEventListener('click', ()=>{ idx = Math.max(0, idx-1); renderQuestion(); });
  nextBtn.addEventListener('click', ()=>{
    if(idx < currentSet.length - 1){ idx++; renderQuestion(); }
    else { showResult(); }
  });
  exitBtn.addEventListener('click', ()=>{
    saveCategoryProgress();
    hide(quizCard); hide(resultCard); show(categoryScreen);
  });
  homeBtn.addEventListener('click', ()=>{
    saveCategoryProgress();
    hide(quizCard); hide(resultCard); show(categoryScreen);
  });
  restartBtn.addEventListener('click', ()=>{
    if(!quizCard.classList.contains('hidden') && currentCatName){
      if(confirm('Xóa toàn bộ tiến độ danh mục hiện tại và làm lại từ đầu?')){
        clearCategoryProgress(currentCatName);
        startSet(currentCatName, currentSetIdxs, {mode:'fresh'});
      }
    }else{
      alert('Chọn danh mục để bắt đầu.');
    }
  });

  document.addEventListener('keydown', (e)=>{
    const key = e.key.toUpperCase();
    if(['A','B','C','D'].includes(key) && !locked && !quizCard.classList.contains('hidden') && !reviewMode){
      const map = { A:0, B:1, C:2, D:3 };
      const i = map[key];
      const btn = answersWrap.querySelector(`[data-index="${i}"]`);
      if(btn) btn.click();
    }
    if(e.key === 'ArrowLeft'  && !quizCard.classList.contains('hidden')) prevBtn.click();
    if(e.key === 'ArrowRight' && !quizCard.classList.contains('hidden')) nextBtn.click();
    if(e.key === 'Escape'     && !quizCard.classList.contains('hidden')) exitBtn.click();
  });

  // ---------- INIT ----------
  async function init(){
    try{
      const res = await fetch('./exam.json', { cache: 'no-store' });
      const base = res.ok ? await res.json() : [];
      baseBank = ensureCategory(base.map(normalizeRow).filter(Boolean));
      bank = baseBank.slice();
    }catch{ baseBank = []; bank = []; }

    try{
      const extra = JSON.parse(localStorage.getItem('quizFixedBank') || '[]');
      if(Array.isArray(extra)){
        bank = bank.concat(ensureCategory(extra.map(normalizeRow).filter(Boolean)));
      }
    }catch{}

    bank = dedupeBank(bank);
    buildCategories();
    show(categoryScreen); hide(quizCard); hide(resultCard);
  }
  init();
})();
