/* =========================================================
   QUIZ APP – Full JS (optimized)
   - Modal frontend (không prompt)
   - Lưu tiến độ theo USER + CATEGORY
   - Tiếp tục / Review / Làm lại (xóa tiến độ)
   - (ĐÃ BỎ Import)
   - Tìm kiếm theo từ khóa, mở set hoặc mở 1 câu
   ========================================================= */
(function () {
  // ---------- DOM ----------
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

  // Search UI
  const searchInput     = document.getElementById('searchInput');
  const searchBtn       = document.getElementById('searchBtn');
  const searchClear     = document.getElementById('searchClear');
  const searchResults   = document.getElementById('searchResults');
  const toggleSearchBtn = document.getElementById('toggleSearchBtn');
  const searchContainer = document.getElementById('searchContainer');

  // Close inline when opened from Search
  const closeInlineBtn  = document.getElementById('closeInlineBtn');

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
  const explainBox = document.getElementById('explainBox');


  // Force hide modal on load
  modalOverlay?.classList.add('hidden'); modalOverlay?.classList.remove('show');
  modal?.classList.add('hidden');        modal?.classList.remove('show');

  // ---------- STATE ----------
  const AUTO_DELAY_MS  = 800;
  const DEFAULT_CAT    = 'Word in Context - Part 1';
  const STORAGE_NS     = 'quizProgress_v6';

  let bank = [];         // full bank
  let baseBank = [];     // base exam.json
  let currentSet = [];   // objects of current set
  let currentSetIdxs = [];
  let currentCatName = '';
  let idx = 0;
  let correctCount = 0;
  let locked = false;
  let answered = new Map();  // Map<idx, {choice, correct}>
  let reviewMode = false;

  // ---------- USER ----------
  let USER_ID  = localStorage.getItem('quizUserId') || '';
  let USER_KEY = (USER_ID || 'Khách').trim().toLowerCase();

  function setActiveUser(name){
    USER_ID  = name;
    USER_KEY = (name || 'Khách').trim().toLowerCase();
    localStorage.setItem('quizUserId', USER_ID);
    userChip && (userChip.textContent = `👤 ${USER_ID}`);
  }
  function ensureUser(){
    USER_ID  = localStorage.getItem('quizUserId') || USER_ID || '';
    USER_KEY = (USER_ID || 'Khách').trim().toLowerCase();
    if (!USER_ID){
      openUserModal('Khách', (name)=> setActiveUser(name));
    } else {
      userChip && (userChip.textContent = `👤 ${USER_ID}`);
    }
  }
  switchUserBtn?.addEventListener('click', ()=> openUserModal(USER_ID || 'Khách', (name)=> setActiveUser(name)));

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
    try { return JSON.parse(localStorage.getItem(catKey(catName)) || 'null'); } catch { return null; }
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

  function getExplanation(q, index){
  if (!q || !q.explanations) return '';
  const letters = ['A','B','C','D'];
  const k = letters[index] ?? '';
  return (q.explanations[k] || '').toString().trim();
}

function renderExplanation(q, chosenIndex, correctIndex, mode='do'){
  // reset box
if (typeof explainBox !== 'undefined') {
  explainBox.classList.add('hidden');
  explainBox.innerHTML = '';
}

  if (!q || typeof explainBox === 'undefined') return;

  const rightExp  = getExplanation(q, correctIndex);
  const letters   = ['A','B','C','D'];

  if (chosenIndex == null) {
    // chỉ show đáp án đúng (dùng cho review)
    if (rightExp) {
      explainBox.className = 'explain ok';
      explainBox.innerHTML = `
        <div class="title">Đáp án đúng: <b>${letters[correctIndex]}</b></div>
        <div class="right">${escapeHTML(rightExp)}</div>
      `;
      explainBox.classList.remove('hidden');
    }
    return;
  }

  // có lựa chọn của người dùng
  const chosenExp = getExplanation(q, chosenIndex);
  const isCorrect = (chosenIndex === correctIndex);

  if (isCorrect){
    explainBox.className = 'explain ok';
    explainBox.innerHTML = `
      <div class="title">Chính xác!</div>
      ${rightExp
        ? `<div class="right">${escapeHTML(rightExp)}</div>`
        : `<div class="muted">Đáp án đúng là <b>${letters[correctIndex]}</b>.</div>`}
    `;
  } else {
    explainBox.className = 'explain bad';
    explainBox.innerHTML = `
      <div class="title">Chưa đúng.</div>
      ${chosenExp ? `<div>- Vì sao sai: ${escapeHTML(chosenExp)}</div>` : ''}
      <div class="right">Đáp án đúng: <b>${letters[correctIndex]}</b>${rightExp ? ` — ${escapeHTML(rightExp)}` : ''}</div>
    `;
  }
  explainBox.classList.remove('hidden');
}



  // Search helpers
  const norm = (s='') => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const getHaystack = (q) => [ q.context || '', q.question || '', q.prompt || '', ...(q.options || []) ].join(' ');
  function highlight(text, terms){
    let out = escapeHTML(text);
    terms.forEach(t=>{
      if(!t) return;
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'ig');
      out = out.replace(re,'<mark>$1</mark>');
    });
    return out;
  }

  // ---------- NORMALIZE ----------
  function normalizeCorrect(correct, options = []) {
  if (typeof correct === 'number') return clamp((correct>=1 && correct<=4 ? correct-1 : correct), 0, 3);
  const s  = (correct == null) ? '' : String(correct).trim();
  const up = (typeof s === 'string' && s.toUpperCase) ? s.toUpperCase() : s;
  const map = { A:0, B:1, C:2, D:3 };
  if (up in map) return map[up];
  const i = options.findIndex(opt => String(opt).trim().toLowerCase() === s.toLowerCase());
  return i >= 0 ? i : 0;
}
  function normalizeRow(obj){
    if(!obj) return null;
    const q = String(obj.question || obj.Question || '').trim();
    const context = obj.context ?? obj.Context ?? '';
    const prompt  = obj.prompt  ?? obj.Prompt  ?? 'Which choice completes the text with the most logical and precise word or phrase?';

    const A = obj.A ?? obj.a ?? obj.options?.[0];
    const B = obj.B ?? obj.b ?? obj.options?.[1];
    const C = obj.C ?? obj.c ?? obj.options?.[2];
    const D = obj.D ?? obj.d ?? obj.options?.[3];
    const options = [A,B,C,D].map(v => v === undefined ? '' : String(v));
    if (options.filter(Boolean).length < 2) return null;

    const rawCorrect = obj.correct ?? obj.Correct ?? obj.answer ?? obj.Answer;
    const correct = normalizeCorrect(rawCorrect, options);
    // Gom giải thích: chấp nhận nhiều format
let explanations = obj.explanations || obj.Explanations || obj.explain || obj.Explain;

// Cho phép mảng [exA, exB, exC, exD]
if (Array.isArray(explanations)) {
  explanations = { A: explanations[0], B: explanations[1], C: explanations[2], D: explanations[3] };
}

// Cho phép từng trường exA/exB... hoặc expA/expB...
const exA = obj.exA ?? obj.expA ?? obj.ExA ?? obj.ExpA;
const exB = obj.exB ?? obj.expB ?? obj.ExB ?? obj.ExpB;
const exC = obj.exC ?? obj.expC ?? obj.ExC ?? obj.ExpC;
const exD = obj.exD ?? obj.expD ?? obj.ExD ?? obj.ExpD;
if (!explanations && (exA || exB || exC || exD)) {
  explanations = { A: exA, B: exB, C: exC, D: exD };
}
    return {
  question: q, context, prompt,
  options, correct,
  explanations,                         // <— thêm
  category: obj.category || obj.Category || DEFAULT_CAT
};
  }

  // ---------- RESUME MODAL ----------
  let __pendingCat = null, __pendingIdxs = null, __pendingSaved = null;
  function openResumeModal(catName, idxs, saved){
    __pendingCat = catName; __pendingIdxs = idxs; __pendingSaved = saved;
    modalTitle && (modalTitle.textContent = 'Tiếp tục danh mục?');
    modalDesc  && (modalDesc.textContent  = `Danh mục "${catName}" đã có tiến độ. Chọn một thao tác:`);
    modalOverlay.classList.remove('hidden'); modal.classList.remove('hidden');
    modalOverlay.classList.add('show');      modal.classList.add('show');
    setTimeout(()=> modalContinue?.focus(), 30);
  }
  function closeResumeModal(){
    modalOverlay.classList.remove('show'); modal.classList.remove('show');
    setTimeout(()=>{ modalOverlay.classList.add('hidden'); modal.classList.add('hidden'); }, 160);
  }
  modalContinue?.addEventListener('click', ()=>{ closeResumeModal(); if(__pendingCat) startSet(__pendingCat, __pendingIdxs, {mode:'continue', saved: __pendingSaved}); });
  modalReview  ?.addEventListener('click', ()=>{ closeResumeModal(); if(__pendingCat) startSet(__pendingCat, __pendingIdxs, {mode:'review',   saved: __pendingSaved}); });
  modalReset   ?.addEventListener('click', ()=>{ if(__pendingCat) clearCategoryProgress(__pendingCat); closeResumeModal(); if(__pendingCat) startSet(__pendingCat, __pendingIdxs, {mode:'fresh'}); });
  modalCancel  ?.addEventListener('click', closeResumeModal);
  modalClose   ?.addEventListener('click', closeResumeModal);
  modalOverlay ?.addEventListener('click', (e)=>{ if(e.target === modalOverlay) closeResumeModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !modal.classList.contains('hidden')) closeResumeModal(); });

  // ---------- RENDER CATEGORY ----------
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

    // Đọc tiến độ đã lưu của user hiện tại
    const saved = loadCategoryProgress(name);
    const total = indexes.length;

    let answeredCount = 0, pct = 0, completed = false;
    if (saved && Array.isArray(saved.answered)) {
      answeredCount = saved.answered.length;
      const correct = saved.correctCount || 0;
      pct = total ? Math.round((correct / total) * 100) : 0;
      completed = answeredCount >= total;
    }

    // Nội dung hiển thị bên phải
    const rightHtml = saved
      ? `<span class="meta">${answeredCount}/${total} câu</span><span class="meta">(${pct}%)</span>`
      : `<span class="count">${total} câu</span>`;

    btn.innerHTML = `
      <div class="cat-name">${escapeHTML(name)}</div>
      <div class="cat-meta">${rightHtml}</div>
    `;

    // Màu viền theo trạng thái
    if (saved) {
      if (completed) {
        btn.classList.add(pct >= 80 ? 'cat-done-good' : 'cat-done-bad');
      } else {
        btn.classList.add('cat-inprogress');
      }
    }

    // Click: có tiến độ thì mở modal resume
    btn.addEventListener('click', ()=>{
      if (saved && Array.isArray(saved.setIdxs) && saved.setIdxs.length){
        openResumeModal(name, indexes, saved);
      } else {
        startSet(name, indexes, {mode:'fresh'});
      }
    });

    categoryList.appendChild(btn);
  });
}

  // ---------- START/RENDER QUIZ ----------
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
      idx = 0; correctCount = s.correctCount || 0;
      answered = new Map(s.answered || []);
      reviewMode = true;
    }

    // nếu mở từ search → hiện nút đóng
    if (opts.fromSearch || /^Tìm kiếm:/i.test(catName)) closeInlineBtn?.classList.remove('hidden');
    else closeInlineBtn?.classList.add('hidden');

    if (opts.jumpTo != null) idx = clamp(opts.jumpTo, 0, Math.max(0, currentSet.length - 1));

    crumbs.textContent = `Danh mục: ${catName}${reviewMode ? ' • Review' : ''}`;
    show(quizCard); hide(categoryScreen); hide(resultCard);
    restartBtn.disabled = false;
    renderQuestion();
    saveCategoryProgress();
    adminSyncProgress('autosave');
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
    const explainBox = document.getElementById('explainBox');
if (explainBox) explainBox.innerHTML = '';
    const opts = (q.options || [q.A, q.B, q.C, q.D].filter(v=>v!==undefined)).slice(0,4);
    opts.forEach((opt, i)=>{
      const btn = document.createElement('button');
      btn.className = 'answer';
      btn.setAttribute('data-index', i);
      btn.setAttribute('aria-label', `Đáp án ${letterFromIndex(i)}`);
      btn.innerHTML = `<span class="pill">${letterFromIndex(i)}</span> <span>${escapeHTML(String(opt))}</span>`;
      if (!reviewMode) {
  btn.addEventListener('click', () => {
    const q = currentSet[idx];
    const correctIndex = (typeof q.correct === 'number')
      ? clamp(q.correct, 0, 3)
      : normalizeCorrect(q.correct, q.options || []);
    
    // Nếu CHƯA chấm câu này -> chấm điểm
    if (!answered.has(idx)) {
      handleAnswer(i, btn);
      return;
    }
    // ĐÃ chấm rồi -> chỉ preview giải thích cho lựa chọn đang bấm
    renderExplanation(q, i, correctIndex, 'preview');
  });
}
      answersWrap.appendChild(btn);
    });

    if (reviewMode){
  const correctIndex = (typeof q.correct === 'number')
    ? clamp(q.correct, 0, 3)
    : normalizeCorrect(q.correct, q.options || []);

  const prev = answered.get(idx); // có thể undefined
  const correctBtn = answersWrap.querySelector(`[data-index="${correctIndex}"]`);
  if (correctBtn) correctBtn.classList.add('correct');
  if (prev && prev.choice != null && prev.choice !== correctIndex) {
    const wrongBtn = answersWrap.querySelector(`[data-index="${prev.choice}"]`);
    if (wrongBtn) wrongBtn.classList.add('wrong');
  }
  // KHÔNG disable để còn bấm xem giải thích, chỉ đánh dấu "locked"
[...answersWrap.querySelectorAll('.answer')].forEach(b => {
  b.classList.add('locked');         // nếu muốn style riêng
  b.setAttribute('aria-disabled', 'true');
});

  // >>> hiển thị giải thích (an toàn, prev có thể rỗng)
  renderExplanation(q, prev?.choice ?? null, correctIndex, 'review');
}
 else {
  const prev = answered.get(idx);
  if (prev){
    const correctIndex = (typeof q.correct === 'number')
      ? clamp(q.correct,0,3)
      : normalizeCorrect(q.correct, q.options || []);
    const btn = answersWrap.querySelector(`[data-index="${prev.choice}"]`);
    if (btn){
      if (prev.choice === correctIndex) btn.classList.add('correct');
      else {
        btn.classList.add('wrong');
        const cBtn = answersWrap.querySelector(`[data-index="${correctIndex}"]`);
        if (cBtn) cBtn.classList.add('correct');
      }
      [...answersWrap.querySelectorAll('.answer')].forEach(b=> b.disabled = true);
    }
    // >>> show giải thích cho lựa chọn đã lưu
    renderExplanation(q, prev.choice, correctIndex, 'restore');
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
  if (reviewMode) return;

  const q = currentSet[idx];
  const correctIndex = (typeof q.correct === 'number')
    ? clamp(q.correct,0,3)
    : normalizeCorrect(q.correct, q.options || []);

  // 👉 Nếu câu đã chấm rồi: chỉ xem giải thích cho đáp án vừa click
  if (answered.has(idx)) {
    renderExplanation(q, choiceIndex, correctIndex, 'preview');
    return;
  }

  if (locked) return;
  locked = true;

  const buttons = [...answersWrap.querySelectorAll('.answer')];

    const ok = (choiceIndex === correctIndex);
    if(ok){ btn.classList.add('correct'); correctCount++; flash('ok', '✅ Chính xác!'); }
    else   { btn.classList.add('wrong'); const c = answersWrap.querySelector(`[data-index="${correctIndex}"]`); c && c.classList.add('correct'); flash('bad','❌ Chưa đúng'); }

    answered.set(idx, {choice: choiceIndex, correct: ok});
    // sau khi chấm đáp án:
renderExplanation(q, choiceIndex, correctIndex, 'do');
explainBox.classList.remove('hidden');
saveCategoryProgress();
setTimeout(()=>{ locked = false; }, AUTO_DELAY_MS/2);

    // Giải thích
const chosenExp = getExplanation(q, choiceIndex);
const rightExp  = getExplanation(q, correctIndex);
if (choiceIndex === correctIndex) {
  // Đúng
  explainBox.className = 'explain ok';
  explainBox.innerHTML = `
    <div class="title">Chính xác!</div>
    ${rightExp ? `<div class="right">${escapeHTML(rightExp)}</div>` : `<div class="muted">Đáp án đúng là <b>${['A','B','C','D'][correctIndex]}</b>.</div>`}
  `;
} else {
  // Sai
  explainBox.className = 'explain bad';
  explainBox.innerHTML = `
    <div class="title">Chưa đúng.</div>
    ${chosenExp ? `<div>- Vì sao sai: ${escapeHTML(chosenExp)}</div>` : ''}
    <div class="right">Đáp án đúng: <b>${['A','B','C','D'][correctIndex]}</b>${rightExp ? ` — ${escapeHTML(rightExp)}` : ''}</div>
  `;
}
explainBox.classList.remove('hidden');

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
  saveCategoryProgress();        // <— thêm để chốt tiến độ
  adminSyncProgress('finish');
  buildCategories();             // <— thêm để cập nhật ô danh mục
}

  // ---------- SEARCH ----------
  function performSearch(){
    if (searchContainer?.classList.contains('hidden')) searchContainer.classList.remove('hidden');
    const q = (searchInput?.value || '').trim();
    const box = searchResults; if(!box) return;
    if(!q){ box.classList.add('hidden'); box.innerHTML=''; return; }

    const terms = norm(q).split(/\s+/).filter(Boolean);
    const matches = [];
    bank.forEach((item, i)=>{ const hay = norm(getHaystack(item)); if(terms.every(t => hay.includes(t))) matches.push(i); });

    const total = matches.length;
    const headRight = total ? `<button id="searchStartAll" class="btn small primary">Làm tất cả (${total})</button>` : '';
    let html = `
      <div class="search-head">
        <div>Kết quả: <b>${total}</b></div>
        <div>${headRight}</div>
      </div>
      <div class="search-list">
    `;
    matches.slice(0,100).forEach((i)=>{
      const item = bank[i];
      const cat  = item.category || DEFAULT_CAT;
      const raw  = (item.context || item.question || '').trim().replace(/\s+/g,' ');
      const snip = raw.length > 180 ? raw.slice(0,180)+'…' : raw;
      html += `
        <div class="search-item" data-idx="${i}">
          <div>
            <div class="s-cat">${escapeHTML(cat)}</div>
            <div class="s-text">${highlight(snip, (searchInput.value||'').split(/\s+/).filter(Boolean))}</div>
          </div>
          <div class="s-actions">
            <button class="btn small openThis">Mở câu này</button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    box.innerHTML = html;
    box.classList.remove('hidden');

    // events
    document.getElementById('searchStartAll')?.addEventListener('click', ()=>{
      const name = `Tìm kiếm: "${q}"`;
      startSet(name, matches, { mode:'fresh', fromSearch:true });
    });
    [...box.querySelectorAll('.search-item .openThis')].forEach((btn)=>{
      btn.addEventListener('click', (e)=>{
        const wrap = e.currentTarget.closest('.search-item');
        const i = Number(wrap.dataset.idx);
        const jumpIndex = matches.indexOf(i);
        startSet(`Tìm kiếm: "${q}"`, matches, { mode:'fresh', jumpTo: jumpIndex, fromSearch:true });
      });
    });
  }

  // Toggle Search panel
  toggleSearchBtn?.addEventListener('click', ()=>{
    if (!searchContainer) return;
    const willShow = searchContainer.classList.contains('hidden');
    searchContainer.classList.toggle('hidden');
    if (willShow) setTimeout(()=> searchInput?.focus(), 20);
  });

  // ---------- NAV & SHORTCUTS ----------
  prevBtn?.addEventListener('click', ()=>{ idx = Math.max(0, idx-1); renderQuestion(); });
  nextBtn?.addEventListener('click', ()=>{ if(idx < currentSet.length - 1){ idx++; renderQuestion(); } else { showResult(); } });
  exitBtn?.addEventListener('click', ()=>{ saveCategoryProgress(); hide(quizCard); hide(resultCard); show(categoryScreen); buildCategories(); });
  homeBtn?.addEventListener('click', ()=>{ saveCategoryProgress(); hide(quizCard); hide(resultCard); show(categoryScreen); buildCategories(); });

  restartBtn?.addEventListener('click', ()=>{
    if(!quizCard.classList.contains('hidden') && currentCatName){
      if(confirm('Xóa toàn bộ tiến độ danh mục hiện tại và làm lại từ đầu?')){
        clearCategoryProgress(currentCatName);
        startSet(currentCatName, currentSetIdxs, {mode:'fresh'});
      }
    }else{
      alert('Chọn danh mục để bắt đầu.');
    }
  });

  // Search events
  searchBtn?.addEventListener('click', performSearch);
  searchInput?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') performSearch(); });
  searchClear?.addEventListener('click', ()=>{ searchInput.value = ''; searchResults.classList.add('hidden'); searchResults.innerHTML = ''; });

  // Close inline (khi mở từ Search)
  closeInlineBtn?.addEventListener('click', ()=>{
    hide(quizCard);
    hide(resultCard);
    show(categoryScreen);
    // giữ nguyên kết quả tìm kiếm nếu đang mở
    searchContainer && searchContainer.classList.remove('hidden');
  });

  // Shortcuts
  // Thay handler keydown cũ bằng đoạn này
document.addEventListener('keydown', (ev) => {
  // key có thể undefined/null ở một số trường hợp => guard
  const key = (typeof ev.key === 'string') ? ev.key : '';
  if (!key) return;

  const inQuiz = !quizCard.classList.contains('hidden');
  const upper  = (key.length === 1) ? key.toUpperCase() : key;

  // Chọn đáp án bằng phím A/B/C/D (chỉ khi đang làm, không phải review)
  if (inQuiz && !locked && !reviewMode && ['A','B','C','D'].includes(upper)) {
    const map = { A:0, B:1, C:2, D:3 };
    const i = map[upper];
    const btn = answersWrap.querySelector(`[data-index="${i}"]`);
    if (btn) btn.click();
    return;
  }

  // Điều hướng
  if (inQuiz && key === 'ArrowLeft')  { prevBtn?.click();  return; }
  if (inQuiz && key === 'ArrowRight') { nextBtn?.click();  return; }
  if (inQuiz && key === 'Escape')     { exitBtn?.click();  return; }
});


  // ---------- INIT ----------
  async function init(){
    try{
      const res = await fetch('./exam.json', { cache: 'no-store' });
      const base = res.ok ? await res.json() : [];
      baseBank = ensureCategory(base.map(normalizeRow).filter(Boolean));
      bank = baseBank.slice();
    }catch{ baseBank = []; bank = []; }

    // nếu trước đây có import thủ công đã lưu
    try{
      const extra = JSON.parse(localStorage.getItem('quizFixedBank') || '[]');
      if(Array.isArray(extra)) bank = bank.concat(ensureCategory(extra.map(normalizeRow).filter(Boolean)));
    }catch{}

    bank = dedupeBank(bank);
    buildCategories();
    show(categoryScreen); hide(quizCard); hide(resultCard);
  }

  // ===== USER MODAL (safe init, no redeclare) =====
  (function initUserModal() {
    if (window.__userModalReady) return;
    window.__userModalReady = true;

    const uOverlay = document.getElementById('userOverlay');
    const uModal   = document.getElementById('userModal');
    const uInput   = document.getElementById('userInput');
    const uSave    = document.getElementById('userSave');
    const uCancel  = document.getElementById('userCancel');
    const uClose   = document.getElementById('userClose');

    uOverlay?.classList.add('hidden'); uOverlay?.classList.remove('show');
    uModal  ?.classList.add('hidden'); uModal  ?.classList.remove('show');

    let __onUserDone = null;
    window.openUserModal = function(initialName = 'Khách', onDone){
      __onUserDone = onDone || null;
      if (uInput) uInput.value = initialName || '';
      uOverlay?.classList.remove('hidden'); uModal?.classList.remove('hidden');
      uOverlay?.classList.add('show');      uModal?.classList.add('show');
      setTimeout(()=> uInput?.focus(), 30);
    };
    window.closeUserModal = function(){
      uOverlay?.classList.remove('show'); uModal?.classList.remove('show');
      setTimeout(()=>{ uOverlay?.classList.add('hidden'); uModal?.classList.add('hidden'); }, 140);
    };

    uSave  ?.addEventListener('click', ()=>{ const name = (uInput?.value || '').trim(); if(!name){ uInput?.focus(); return; } window.closeUserModal(); __onUserDone && __onUserDone(name); });
    uCancel?.addEventListener('click', window.closeUserModal);
    uClose ?.addEventListener('click',  window.closeUserModal);
    uOverlay?.addEventListener('click', (e)=>{ if(e.target === uOverlay) window.closeUserModal(); });

    document.addEventListener('keydown', (e)=>{
      if (uModal?.classList.contains('hidden')) return;
      if (e.key === 'Enter') uSave?.click();
      if (e.key === 'Escape') window.closeUserModal();
    });
  })();

  // ===== Gate (password) modal =====
  const gateOverlay = document.getElementById('gateOverlay');
  const gateModal   = document.getElementById('gateModal');
  const gateInput   = document.getElementById('gateInput');
  const gateEnter   = document.getElementById('gateEnter');
  const gateCancel  = document.getElementById('gateCancel');
  const gateClose   = document.getElementById('gateClose');
  const gateError   = document.getElementById('gateError');
  const GATE_PASS   = 'roadto1550+';

  gateOverlay?.classList.add('hidden'); gateOverlay?.classList.remove('show');
  gateModal  ?.classList.add('hidden'); gateModal  ?.classList.remove('show');

  let __onGateOk = null;
  function openGateModal(onOk){
    __onGateOk = onOk || null;
    if (gateInput) gateInput.value = '';
    gateError?.classList.add('hidden');
    gateOverlay?.classList.remove('hidden'); gateModal?.classList.remove('hidden');
    gateOverlay?.classList.add('show');      gateModal?.classList.add('show');
    setTimeout(()=> gateInput?.focus(), 30);
  }
  function closeGateModal(){
    gateOverlay?.classList.remove('show'); gateModal?.classList.remove('show');
    setTimeout(()=>{ gateOverlay?.classList.add('hidden'); gateModal?.classList.add('hidden'); }, 140);
  }
  function tryEnterGate(){
    const val = (gateInput?.value || '').trim();
    if (val === GATE_PASS){ gateError?.classList.add('hidden'); closeGateModal(); __onGateOk && __onGateOk(true); }
    else { gateError?.classList.remove('hidden'); gateInput?.focus(); gateInput?.select?.(); }
  }
  gateEnter?.addEventListener('click', tryEnterGate);
  gateCancel?.addEventListener('click', closeGateModal);
  gateClose ?.addEventListener('click', closeGateModal);
  gateOverlay?.addEventListener('click', (e)=>{ if(e.target === gateOverlay) closeGateModal(); });
  document.addEventListener('keydown', (e)=>{ if (!gateModal || gateModal.classList.contains('hidden')) return; if (e.key === 'Enter') tryEnterGate(); if (e.key === 'Escape') closeGateModal(); });

  // Boot with Gate
  async function runApp(){ await init(); }
  (function startWithGate(){
    const ok = sessionStorage.getItem('quizGateOk') === '1';
    if (ok){ ensureUser(); runApp(); return; }
    openGateModal(()=>{ sessionStorage.setItem('quizGateOk','1'); ensureUser(); runApp(); });
  })();
})();

// ===== Admin Sync (Google Sheets) =====
const ADMIN_ENDPOINT = 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE'; // dán URL web app nếu dùng
const ADMIN_TOKEN    = 'roadto1550plus-admin';
const SESSION_ID     = Math.random().toString(36).slice(2);

// Các biến runtime (được closure trong IIFE trên) sẽ có sẵn khi gọi
async function adminSyncProgress(evt, extra = {}) {
  try {
    // nếu chưa init app thì bỏ qua
    if (typeof currentCatName === 'undefined') return;

    const payload = {
      token: ADMIN_TOKEN,
      event: evt,                         // "autosave" | "finish"
      userId: localStorage.getItem('quizUserId') || 'Khách',
      userKey: (localStorage.getItem('quizUserId') || 'Khách').toLowerCase(),
      category: (typeof currentCatName !== 'undefined') ? currentCatName : '',
      idx: (typeof idx !== 'undefined') ? idx : 0,
      correctCount: (typeof correctCount !== 'undefined') ? correctCount : 0,
      total: (typeof currentSet !== 'undefined' && currentSet) ? currentSet.length : 0,
      accuracy: (typeof currentSet !== 'undefined' && currentSet && currentSet.length)
        ? Math.round((correctCount / currentSet.length) * 100) : 0,
      answeredCount: (typeof answered !== 'undefined' && answered && answered.size) ? answered.size : 0,
      sessionId: SESSION_ID,
      extra
    };
    if (!ADMIN_ENDPOINT || ADMIN_ENDPOINT.includes('PASTE_APPS_SCRIPT_WEB_APP_URL_HERE')) return;
    await fetch(ADMIN_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {}
}
