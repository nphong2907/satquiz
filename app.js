(function () {
  /* ========== DOM ========== */
  const fileInput = document.getElementById("fileInput");
  const categoryScreen = document.getElementById("categoryScreen");
  const categoryList = document.getElementById("categoryList");
  const homeBtn = document.getElementById("homeBtn");
  const restartBtn = document.getElementById("restartBtn");

  const quizCard = document.getElementById("quizCard");
  const crumbs = document.getElementById("crumbs");
  const qIndex = document.getElementById("qIndex");
  const contextBox = document.getElementById("contextBox");
  const promptBox = document.getElementById("promptBox");
  const answersWrap = document.getElementById("answers");
  const feedback = document.getElementById("feedback");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const exitBtn = document.getElementById("exitBtn");

  const pFill = document.getElementById("pFill");
  const pText = document.getElementById("pText");

  const resultCard = document.getElementById("resultCard");
  const statCorrect = document.getElementById("statCorrect");
  const statWrong = document.getElementById("statWrong");
  const statAccuracy = document.getElementById("statAccuracy");

  /* ========== STATE ========== */
  const AUTO_DELAY_MS = 900;
  const DEFAULT_CAT = "Word in Context - Part 1";

  let bank = [];                    // toàn bộ câu hỏi (bundle + import)
  let currentSet = [];              // mảng câu đang làm
  let currentSetIdxs = [];          // các chỉ số tương ứng trong bank
  let currentCatName = "";
  let idx = 0;
  let correctCount = 0;
  let locked = false;
  let answered = new Map();         // Map<idx, {choice, correct}>

  /* ========== HELPERS ========== */
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const letterFromIndex = (i) => ["A", "B", "C", "D"][i] || "";
  const show = (el) => el.classList.remove("hidden");
  const hide = (el) => el.classList.add("hidden");
  const escapeHTML = (str) =>
    String(str).replace(/[&<>\"']/g, (s) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[s]));

  function setProgress() {
    const total = currentSet.length;
    const done = clamp(idx + 1, 0, total);
    pText.textContent = `${done}/${total}`;
    pFill.style.width = (total ? (done / total) * 100 : 0) + "%";
    qIndex.textContent = `${done}/${total}`;
  }

  // Nếu dữ liệu kiểu cũ: question chứa cả đoạn văn + câu hỏi
  function splitQuestionText(qstr = "") {
    const marker = /Which choice completes the text with the most logical and precise word or phrase\?/i;
    const parts = String(qstr).split(marker);
    return {
      context: (parts[0] || "").trim(),
      prompt:
        "Which choice completes the text with the most logical and precise word or phrase?",
    };
  }

  const ensureCategory = (items) =>
    items
      .map((q) => (q ? { ...q, category: q.category || DEFAULT_CAT } : q))
      .filter(Boolean);

  /* ========== NORMALIZE DATA ========== */

  // Chuẩn hoá đáp án về index 0..3, hỗ trợ: 0–3, 1–4, 'A'..'D', hoặc chuỗi nội dung
  function normalizeCorrect(correct, options = []) {
    if (typeof correct === "number") {
      return clamp(correct >= 1 && correct <= 4 ? correct - 1 : correct, 0, 3);
    }
    const s = String(correct || "").trim();
    if (/^[0-3]$/.test(s)) return parseInt(s, 10);
    if (/^[1-4]$/.test(s)) return parseInt(s, 10) - 1;
    const map = { A: 0, B: 1, C: 2, D: 3 };
    if (map[s.toUpperCase()] !== undefined) return map[s.toUpperCase()];
    // chuỗi nội dung
    const i = options.findIndex((opt) => String(opt).trim() === s);
    return i >= 0 ? i : 0;
  }

  // Hỗ trợ cả format mới (context + prompt + options + answer: "fusion")
  // và format cũ (question + A/B/C/D + correct)
  function normalizeRow(obj) {
    if (!obj) return null;

    const q = String(obj.question || obj.Question || "").trim();
    const context = obj.context ?? obj.Context ?? "";
    const prompt =
      obj.prompt ??
      obj.Prompt ??
      "Which choice completes the text with the most logical and precise word or phrase?";

    const A = obj.A ?? obj.a ?? obj.options?.[0];
    const B = obj.B ?? obj.b ?? obj.options?.[1];
    const C = obj.C ?? obj.c ?? obj.options?.[2];
    const D = obj.D ?? obj.d ?? obj.options?.[3];
    const options = [A, B, C, D].map((v) => (v === undefined ? "" : String(v)));

    // Cần ít nhất 2 phương án có nội dung
    if (options.filter(Boolean).length < 2) return null;

    // Lấy đáp án đúng và đổi về index
    const rawCorrect = obj.correct ?? obj.Correct ?? obj.answer ?? obj.Answer;
    const correct = normalizeCorrect(rawCorrect, options);

    return {
      // giữ lại cho tương thích; có thể rỗng nếu dùng context/prompt
      question: q,
      context,
      prompt,
      options,
      correct,
      category: obj.category || obj.Category || DEFAULT_CAT,
    };
  }

  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;
    while (i <= text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
        if (ch === '"') { inQuotes = false; i++; continue; }
        if (ch === undefined) { row.push(field); rows.push(row); break; }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === "," || ch === ";") { row.push(field); field = ""; i++; continue; }
      if (ch === "\n" || ch === "\r" || ch === undefined) {
        row.push(field); field = "";
        if (row.some((c) => c !== "")) rows.push(row);
        row = []; i++; continue;
      }
      field += ch; i++;
    }
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim());
    const looksLikeHeader = /question/i.test(header[0] || "") || header.length >= 5;
    const start = looksLikeHeader ? 1 : 0;
    const data = rows
      .slice(start)
      .map((cols) => {
        const cells = cols.map((c) => c.trim());
        if (looksLikeHeader) {
          const obj = {};
          header.forEach((h, i) => (obj[h] = cells[i] ?? ""));
          return normalizeRow(obj);
        } else {
          const obj = {
            question: cells[0],
            A: cells[1],
            B: cells[2],
            C: cells[3],
            D: cells[4],
            correct: cells[5],
          };
          return normalizeRow(obj);
        }
      })
      .filter(Boolean);
    return data;
  }

  function loadFromJSON(text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(normalizeRow).filter(Boolean);
    } catch (e) {
      alert("Lỗi JSON: " + e.message);
    }
    return [];
  }

  /* ========== RENDERING ========== */

  function buildCategories() {
    const groups = new Map();
    bank.forEach((q, i) => {
      const cat = q.category || DEFAULT_CAT;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(i);
    });
    renderCategoryList(groups);
  }

  function renderCategoryList(groups) {
    categoryList.innerHTML = "";
    const arr = Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    arr.forEach(([name, indexes]) => {
      const div = document.createElement("button");
      div.className = "category btn";
      div.innerHTML = `<span>${escapeHTML(name)}</span><span class="count">${indexes.length} câu</span>`;
      div.addEventListener("click", () => startSet(name, indexes));
      categoryList.appendChild(div);
    });

    const allBtn = document.createElement("button");
    allBtn.className = "category btn";
    allBtn.innerHTML = `<span>Tất cả câu hỏi</span><span class="count">${bank.length} câu</span>`;
    allBtn.addEventListener("click", () =>
      startSet(
        "Tất cả",
        Array.from({ length: bank.length }, (_, i) => i)
      )
    );
    categoryList.prepend(allBtn);
  }

  function startSet(catName, idxs) {
    currentCatName = catName;
    currentSetIdxs = (idxs || []).slice();
    currentSet = currentSetIdxs.map((i) => bank[i]).filter(Boolean);
    idx = 0;
    correctCount = 0;
    answered = new Map();
    locked = false;
    crumbs.textContent = `Danh mục: ${catName}`;
    show(quizCard); hide(categoryScreen); hide(resultCard);
    restartBtn.disabled = false;
    renderQuestion();
    saveProgress();
  }

  function renderQuestion() {
    if (idx >= currentSet.length) return showResult();
    const q = currentSet[idx];

    // Ưu tiên dữ liệu tách context/prompt
    if (q.context || q.prompt) {
      contextBox.textContent = (q.context || "").trim();
      promptBox.textContent =
        (q.prompt ||
          "Which choice completes the text with the most logical and precise word or phrase?").trim();
    } else {
      // fallback dạng cũ
      const { context, prompt } = splitQuestionText(q.question || "");
      contextBox.textContent = context;
      promptBox.textContent = prompt;
    }

    // Đáp án
    answersWrap.innerHTML = "";
    const opts = q.options || [q.A, q.B, q.C, q.D].filter((v) => v !== undefined);
    opts.slice(0, 4).forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "answer";
      btn.setAttribute("data-index", i);
      btn.setAttribute("aria-label", `Đáp án ${letterFromIndex(i)}`);
      btn.innerHTML = `<span class="pill">${letterFromIndex(i)}</span> <span>${escapeHTML(
        String(opt)
      )}</span>`;
      btn.addEventListener("click", () => handleAnswer(i, btn));
      answersWrap.appendChild(btn);
    });

    // khôi phục nếu đã chọn
    const prev = answered.get(idx);
    if (prev) {
      const btn = answersWrap.querySelector(`[data-index="${prev.choice}"]`);
      if (btn) {
        btn.classList.add(prev.correct ? "correct" : "wrong");
        [...answersWrap.querySelectorAll(".answer")].forEach((b) => (b.disabled = true));
      }
    }

    setProgress();
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= currentSet.length - 1;
  }

  function flash(type, msg) {
    feedback.textContent = msg;
    feedback.className = `feedback show ${type}`;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => (feedback.className = "feedback"), 900);
  }

  function handleAnswer(choiceIndex, btn) {
    if (locked) return;
    locked = true;

    const q = currentSet[idx];
    const correctIndex =
      typeof q.correct === "number"
        ? clamp(q.correct, 0, 3)
        : normalizeCorrect(q.correct, q.options || []);

    const buttons = [...answersWrap.querySelectorAll(".answer")];
    buttons.forEach((b) => (b.disabled = true));

    const ok = choiceIndex === correctIndex;
    if (ok) {
      btn.classList.add("correct");
      correctCount++;
      flash("ok", "✅ Chính xác!");
    } else {
      btn.classList.add("wrong");
      const correctBtn = answersWrap.querySelector(`[data-index="${correctIndex}"]`);
      if (correctBtn) correctBtn.classList.add("correct");
      flash("bad", "❌ Chưa đúng");
    }

    answered.set(idx, { choice: choiceIndex, correct: ok });
    saveProgress();
    setTimeout(() => (locked = false), AUTO_DELAY_MS / 2);
  }

  function showResult() {
    hide(quizCard);
    show(resultCard);
    const total = currentSet.length;
    const wrong = total - correctCount;
    const acc = total ? Math.round((correctCount / total) * 100) : 0;
    statCorrect.textContent = correctCount;
    statWrong.textContent = wrong;
    statAccuracy.textContent = acc + "%";
  }

  /* ========== IMPORT ========== */
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const reader = new FileReader();
    reader.onload = () => {
      let data = [];
      if (ext === "json") data = loadFromJSON(reader.result);
      else data = parseCSV(reader.result);
      if (!data.length) {
        alert("Không đọc được dữ liệu. Kiểm tra lại định dạng.");
        return;
      }
      data = ensureCategory(data);
      bank = bank.concat(data);
      localStorage.setItem("quizFixedBank", JSON.stringify(bank));
      buildCategories();
      alert("Đã thêm câu hỏi mới vào ngân hàng cố định.");
    };
    reader.readAsText(file, "utf-8");
  });

  /* ========== NAVIGATION & SHORTCUTS ========== */
  prevBtn.addEventListener("click", () => {
    idx = Math.max(0, idx - 1);
    renderQuestion();
  });
  nextBtn.addEventListener("click", () => {
    if (idx < currentSet.length - 1) {
      idx++;
      renderQuestion();
    } else {
      showResult();
    }
  });

  document.addEventListener("keydown", (e) => {
    const key = e.key.toUpperCase();
    if (["A", "B", "C", "D"].includes(key) && !locked && !quizCard.classList.contains("hidden")) {
      const map = { A: 0, B: 1, C: 2, D: 3 };
      const i = map[key];
      const btn = answersWrap.querySelector(`[data-index="${i}"]`);
      if (btn) btn.click();
    }
    if (e.key === "ArrowLeft" && !quizCard.classList.contains("hidden")) prevBtn.click();
    if (e.key === "ArrowRight" && !quizCard.classList.contains("hidden")) nextBtn.click();
    if (e.key === "Escape" && !quizCard.classList.contains("hidden")) exitBtn.click();
  });

  homeBtn.addEventListener("click", () => {
    saveProgress();
    hide(quizCard); hide(resultCard); show(categoryScreen);
  });
  restartBtn.addEventListener("click", () => {
    if (currentSet.length) {
      idx = 0; correctCount = 0; answered = new Map();
      renderQuestion(); show(quizCard); hide(resultCard);
      saveProgress();
    }
  });
  exitBtn.addEventListener("click", () => {
    saveProgress();
    hide(quizCard); hide(resultCard); show(categoryScreen);
  });

  /* ========== AUTO‑SAVE THEO NGƯỜI DÙNG ========== */
  const STORAGE_NS = "quizProgress_v2";
  const keyForUser = (u) => `${STORAGE_NS}:${u}`;

  let USER_ID = localStorage.getItem("quizUserId") || "";

  function ensureUser() {
    if (!USER_ID) {
      USER_ID =
        (prompt("Nhập tên người dùng (ví dụ: Na, Huy, ...)", "Khách") || "Khách").trim();
      localStorage.setItem("quizUserId", USER_ID);
    }
  }

  function saveProgress() {
    if (!currentSetIdxs.length) return;
    const payload = {
      user: USER_ID,
      timestamp: Date.now(),
      catName: currentCatName,
      idx,
      correctCount,
      answered: Array.from(answered.entries()),
      setIdxs: currentSetIdxs,
    };
    try {
      localStorage.setItem(keyForUser(USER_ID), JSON.stringify(payload));
    } catch {}
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(keyForUser(USER_ID));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  window.addEventListener("beforeunload", () => saveProgress());

  /* ========== INIT ========== */
  async function init() {
    ensureUser();

    try {
      const res = await fetch("exam.json", { cache: "no-store" });
      const base = res.ok ? await res.json() : [];
      bank = ensureCategory(base.map(normalizeRow).filter(Boolean));
    } catch {
      bank = [];
    }
    // nối thêm những câu người dùng import trước đó
    try {
      const extra = JSON.parse(localStorage.getItem("quizFixedBank") || "[]");
      if (Array.isArray(extra))
        bank = bank.concat(ensureCategory(extra.map(normalizeRow).filter(Boolean)));
    } catch {}

    buildCategories();

    // Resume nếu có tiến độ đã lưu
    const saved = loadProgress();
    if (saved && Array.isArray(saved.setIdxs) && saved.setIdxs.length) {
      if (confirm(`Phát hiện phiên đang dở của "${saved.catName}". Tiếp tục?`)) {
        currentCatName = saved.catName || "Đã lưu";
        currentSetIdxs = saved.setIdxs.slice();
        currentSet = currentSetIdxs.map((i) => bank[i]).filter(Boolean);
        idx = clamp(saved.idx || 0, 0, Math.max(0, currentSet.length - 1));
        correctCount = saved.correctCount || 0;
        answered = new Map(saved.answered || []);
        crumbs.textContent = `Danh mục: ${currentCatName}`;
        show(quizCard); hide(categoryScreen); hide(resultCard);
        restartBtn.disabled = false;
        renderQuestion();
        return;
      }
    }

    show(categoryScreen); hide(quizCard); hide(resultCard);
  }

  init();
})();
