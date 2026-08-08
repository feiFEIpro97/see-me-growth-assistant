/**
 * see-me 个人成长助手 —— 前端逻辑
 * 指引式向导 + 聊天记录 + 章节进度 + 战略地图报告
 */
'use strict';

// ---------- 常量 ----------
const CHAPTERS = [
  { name: '第一章 · 终极愿景', short: '终极愿景' },
  { name: '第二章 · 能量地图', short: '能量地图' },
  { name: '第三章 · 天赋资产', short: '天赋资产' },
  { name: '第四章 · 创造方向', short: '创造方向' },
  { name: '第五章 · 战略选择', short: '战略选择' },
  { name: '第六章 · 未来实验', short: '未来实验' },
  { name: '第七章 · 战略地图', short: '战略地图' },
];
const STORAGE_KEY = 'see-me-session-v1';
const REPORT_KEY = 'see-me-report-v1';
const USER_KEY = 'see-me-uid';

// 每章的题目顺序（与 questions.js 一致）
const CHAPTER_QUESTIONS = {
  1: ['Q1', 'Q2', 'Q3'],
  2: ['Q4', 'Q5'],
  3: ['Q6', 'Q7', 'Q8'],
  4: ['Q9', 'Q10', 'Q11', 'Q12'],
  5: ['Q13', 'Q14', 'Q15'],
  6: ['Q16', 'Q17'],
};

// 匿名用户 ID（存 localStorage，同一浏览器视为同一用户）
function getUserId() {
  // 优先用用户自定义 ID，否则用匿名 ID
  const custom = localStorage.getItem('see-me-custom-id');
  if (custom && custom.trim()) return custom.trim();
  let uid = localStorage.getItem(USER_KEY);
  if (!uid) {
    uid = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(USER_KEY, uid);
  }
  return uid;
}

// ---------- DOM ----------
const $ = (s) => document.querySelector(s);
const screens = { home: $('#screen-home'), chat: $('#screen-chat'), report: $('#screen-report'), history: $('#screen-history'), 'history-detail': $('#screen-history-detail') };
const chatInner = $('#chat-inner');
const chatScroll = $('#chat-scroll');
const input = $('#input');
const btnSend = $('#btn-send');
const suggestionRow = $('#suggestion-row');
const progressFill = $('#progress-fill');
const progressText = $('#progress-text');
const chapterName = $('#chapter-name');
const reportContent = $('#report-content');
const toast = $('#toast');

// ---------- 状态 ----------
let state = { chat: [], currentChapter: 0, report: '', currentQuestion: null, completedQuestions: {} };
let sending = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
      // 兼容旧数据（v1 无非交互字段）
      if (!state.currentQuestion) state.currentQuestion = null;
      if (!state.completedQuestions) state.completedQuestions = {};
    }
  } catch (e) { /* ignore */ }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// ---------- 工具 ----------
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}
function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// 简易 Markdown 渲染（标题/加粗/列表/换行）
function mdToHtml(md = '') {
  const lines = md.split(/\r?\n/);
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const esc = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
    if (/^#{1,4}\s/.test(line)) {
      closeList();
      const lvl = line.match(/^(#+)/)[1].length;
      const tag = lvl <= 2 ? 'h3' : 'h4';
      html += `<${tag}>${esc(line.replace(/^#+\s*/, ''))}</${tag}>`;
    } else if (/^[-*•]\s/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${esc(line.replace(/^[-*•]\s*/, ''))}</li>`;
    } else if (/^\d+[.、）)]\s/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${esc(line.replace(/^\d+[.、）)]\s*/, ''))}</li>`;
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html += `<p>${esc(line)}</p>`;
    }
  }
  closeList();
  return html;
}

// ---------- 渲染 ----------
function renderChapterCard() {
  const c = CHAPTERS[state.currentChapter] || CHAPTERS[0];
  const card = document.createElement('div');
  card.className = 'chapter-card';
  card.innerHTML = `<div class="cc-tag">第 ${state.currentChapter + 1} 章 / 共 7 章</div><div class="cc-title">${c.name}</div>`;
  chatInner.appendChild(card);
  chapterName.textContent = c.name;
}

function addMessage(role, content) {
  const wrap = document.createElement('div');
  if (role === 'user') {
    wrap.className = 'msg msg-user';
    wrap.innerHTML = `<div class="msg-bubble">${escapeHtml(content)}</div>`;
  } else {
    wrap.className = 'msg msg-otter';
    wrap.innerHTML = `<div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div><div class="msg-bubble">${mdToHtml(content)}</div>`;
  }
  chatInner.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-otter typing';
  wrap.innerHTML = `<div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div><div class="msg-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
  chatInner.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function scrollToBottom() {
  requestAnimationFrame(() => { chatScroll.scrollTop = chatScroll.scrollHeight; });
}

function updateProgress() {
  const pct = Math.round((state.currentChapter / CHAPTERS.length) * 100);
  progressFill.style.width = pct + '%';
  progressText.textContent = `${state.currentChapter}/${CHAPTERS.length}`;
}

function renderSuggestions(suggestions) {
  suggestionRow.innerHTML = '';
  (suggestions || []).forEach((s) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = s;
    chip.onclick = () => { input.value = s; send(); };
    suggestionRow.appendChild(chip);
  });
}

// ---------- 章节推进 ----------
function detectChapter(content, prevChapter) {
  // 由 AI 输出判断是否进入下一章
  if (prevChapter >= CHAPTERS.length - 1) return prevChapter;
  // 简单启发：若当前是第k章，且AI输出提到下一章标题关键词，则推进
  const nextNames = ['第二章','第三章','第四章','第五章','第六章','第七章'];
  for (let i = prevChapter + 1; i < CHAPTERS.length; i++) {
    if (content.includes(nextNames[i - 1])) { return i; }
  }
  return prevChapter;
}

// ---------- Deepseek 调用 ----------
async function callAI(messages, opts = {}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: 0.8,
      userId: getUserId(),
      chapter: state.currentChapter,
      question: opts.question || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败(${res.status})`);
  return data.content || '';
}

// 上报章节进度
function reportProgress() {
  try {
    fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: getUserId(), chapter: state.currentChapter }),
    });
  } catch (e) { /* fire-and-forget */ }
}

// ---------- 发送（用户提交答案后，AI 只分析当前题，前端推进） ----------
async function send(text) {
  const userText = (text !== undefined ? text : input.value).trim();
  if (!userText || sending) return;
  input.value = '';
  input.style.height = 'auto';
  sending = true;
  btnSend.disabled = true;
  renderSuggestions([]);

  addMessage('user', userText);
  state.chat.push({ role: 'user', content: userText });
  // 移除当前题的交互卡片（Q1 等在主输入框提交的场景）
  const curCard = document.querySelector('.qcard');
  if (curCard) curCard.remove();
  saveState();

  const typing = addTyping();
  try {
    // 只把当前题答案发给 AI 分析（不带出题职责）
    const messages = [{ role: 'system', content: window.SYSTEM_PROMPT }];
    const lastUser = state.chat.filter((m) => m.role === 'user').pop();
    if (lastUser) messages.push({ role: 'user', content: lastUser.content });
    const reply = await callAI(messages);
    typing.remove();

    state.chat.push({ role: 'assistant', content: reply });
    saveState();
    addMessage('assistant', reply);
    showToast('海獭教练思考好啦 🌊');

    // 前端推进：标记当前题完成，渲染下一题或阶段小结
    advanceFlow();
  } catch (e) {
    typing.remove();
    addMessage('assistant', '🦦 哎呀，我这边有点小状况：\n' + e.message);
    showToast('连接有点问题，请重试');
  }
  sending = false;
  btnSend.disabled = false;
  if (!document.querySelector('.qcard')) input.focus();
}

// 前端状态机：标记当前题完成，推进到下一题或阶段小结
function advanceFlow() {
  const curQ = state.currentQuestion;
  if (curQ) {
    state.completedQuestions = state.completedQuestions || {};
    state.completedQuestions[curQ] = true;
  }
  const qs = CHAPTER_QUESTIONS[state.currentChapter + 1] || [];
  const doneAll = qs.every((q) => state.completedQuestions[q]);
  if (doneAll) {
    // 本章完成：触发阶段小结
    state.currentQuestion = null;
    saveState();
    generateStageSummary();
  } else {
    // 渲染本章下一道未完成的题
    const next = renderNextPendingQuestion();
    updateProgress();
    saveState();
  }
  chapterName.textContent = CHAPTERS[state.currentChapter].name;
  reportProgress();
}

// ---------- 交互渲染 ----------
// 渲染当前章节中第一道未完成的题（前端主导，不依赖 AI 标记）
function renderNextPendingQuestion() {
  const qs = CHAPTER_QUESTIONS[state.currentChapter + 1] || [];
  for (const q of qs) {
    if (!(state.completedQuestions && state.completedQuestions[q])) {
      state.currentQuestion = q;
      tryRenderQuestion(q);
      return q;
    }
  }
  // 本章全部完成，返回 null（等待阶段确认或进入下一章）
  state.currentQuestion = null;
  return null;
}

// 尝试渲染当前题目的交互组件（若未完成）
function tryRenderQuestion(qKey) {
  if (state.completedQuestions && state.completedQuestions[qKey]) return;
  const q = window.QUESTIONS && window.QUESTIONS[qKey];
  if (!q) return;
  // 若已有交互卡片则不再重复
  if (document.querySelector('[data-qk="' + qKey + '"]')) return;
  const wrap = document.createElement('div');
  wrap.className = 'qcard';
  wrap.dataset.qk = qKey;
  if (q.type === 'sort') wrap.innerHTML = buildSortCard(q, qKey);
  else if (q.type === 'slider') wrap.innerHTML = buildSliderCard(q);
  else if (q.type === 'keyword') wrap.innerHTML = buildKeywordCard(q);
  else if (q.type === 'free' && qKey === 'Q8') wrap.innerHTML = buildAiGenCard(q, qKey); // 仅 Q8 资产画像
  else if (q.type === 'free') wrap.innerHTML = buildFreeGuideCard(q); // Q4 等开放题：引导卡
  else wrap.innerHTML = buildSelectCard(q, qKey);
  chatInner.appendChild(wrap);
  bindQuestionCard(wrap);
  scrollToBottom();
}

// AI 生成类（Q8 资产画像）
function buildAiGenCard(q, qKey) {
  return `<div class="qcard-title">${escapeHtml(q.title)}</div>
    <div class="qcard-prompt">${escapeHtml(q.prompt)}</div>
    <div class="qcard-actions"><button class="qsend">让 AI 生成我的资产画像</button></div>`;
}

// 开放题引导卡（Q4 等）：提示用户在主输入框作答
function buildFreeGuideCard(q) {
  return `<div class="qcard-title">${escapeHtml(q.title)}</div>
    <div class="qcard-prompt">${escapeHtml(q.prompt)}</div>
    <div class="qcard-hint">✍️ 请在下方输入框写下你的回答，然后点 ➤ 发送。</div>`;
}

// 单选/多选卡片（若 q.scenes 存在则渲染为场景题）
function buildSelectCard(q, qKey) {
  const multi = q.type === 'multi';
  const max = q.maxSelect || 1;
  const min = q.minSelect || 1;
  let html = `<div class="qcard-title">${escapeHtml(q.title)}</div>`;
  html += `<div class="qcard-prompt">${escapeHtml(q.prompt)}</div>`;
  if (q.scenes && q.scenes.length) {
    // 场景题：每个场景一组选项
    q.scenes.forEach((scene, si) => {
      html += `<div class="qscene">
        <div class="qscene-ord">场景 ${si + 1}</div>
        <div class="qscene-text">${escapeHtml(scene)}</div>
        <div class="qcard-options">`;
      q.options.forEach((opt, oi) => {
        html += `<button class="qopt" data-label="${escapeHtml(opt)}" data-scene="${si}">${escapeHtml(opt)}</button>`;
      });
      html += `</div></div>`;
    });
  } else {
    html += `<div class="qcard-hint">${multi ? '可多选，需选 ' + min + '-' + max + ' 个' : '单选'}</div>`;
    html += `<div class="qcard-options">`;
    q.options.forEach((opt, i) => {
      html += `<button class="qopt" data-label="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`;
    });
    html += `</div>`;
  }
  html += `<div class="qcard-actions"><button class="qsend" disabled>提交选择</button></div>`;
  return html;
}

// 排序卡片（拖拽 + 触摸）
function buildSortCard(q, qKey) {
  const max = q.maxSelect || q.options.length;
  let html = `<div class="qcard-title">${escapeHtml(q.title)}</div>`;
  html += `<div class="qcard-prompt">${escapeHtml(q.prompt)}</div>`;
  html += `<div class="qcard-hint">拖动以排序，最多选 ${max} 个（第一个最像你）</div>`;
  html += `<div class="qcard-sortlist">`;
  q.options.forEach((opt, i) => {
    html += `<div class="qsort-item" data-label="${escapeHtml(opt)}" draggable="true">
      <span class="qs-handle">☰</span><span class="qs-num"></span><span class="qs-text">${escapeHtml(opt)}</span>
    </div>`;
  });
  html += `</div>`;
  html += `<div class="qcard-actions"><button class="qsend" disabled>提交排序</button></div>`;
  return html;
}

// 滑杆卡片
function buildSliderCard(q) {
  let html = `<div class="qcard-title">${escapeHtml(q.title)}</div>`;
  html += `<div class="qcard-prompt">${escapeHtml(q.prompt)}</div>`;
  q.sliders.forEach((s, i) => {
    html += `<div class="slider-row">
      <div class="slider-label">${escapeHtml(s.label)}</div>
      <div class="slider-track"><span class="slider-left">${escapeHtml(s.left)}</span>
        <input type="range" min="0" max="100" value="50" class="slider-input" data-idx="${i}" />
        <span class="slider-right">${escapeHtml(s.right)}</span></div>
    </div>`;
  });
  html += `<div class="qcard-actions"><button class="qsend">提交</button></div>`;
  return html;
}

// Q1 关键词辅助卡片
function buildKeywordCard(q) {
  let html = `<div class="qcard-title">${escapeHtml(q.title)}</div>`;
  html += `<div class="qcard-prompt">${escapeHtml(q.prompt)}</div>`;
  html += `<div class="qcard-hint">如果还没有画面，可以点选几个关键词帮助启动想象（不作为分类）：</div>`;
  html += `<div class="qcard-options qcard-keywords">`;
  q.keywords.forEach((k) => {
    html += `<button class="qopt qkw" data-label="${escapeHtml(k)}">${escapeHtml(k)}</button>`;
  });
  html += `</div>`;
  html += `<div class="qcard-actions"><button class="qsend">选好了，开始描述</button></div>`;
  return html;
}

// ---------- 阶段确认 ----------
function renderStageConfirm() {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-otter';
  wrap.innerHTML = `<div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div>
    <div class="summary-confirm">
      <div class="sc-title">《阶段人生镜像》小结符合你的感受吗？</div>
      <div class="sc-btns">
        <button class="chip sc-yes" data-choice="A">A 非常准确，这就是我的想法</button>
        <button class="chip sc-mid" data-choice="B">B 基本准确，但有部分需要调整</button>
        <button class="chip sc-no" data-choice="C">C 不准确，我需要补充</button>
      </div>
      <div class="sc-supply hidden"><textarea class="sc-textarea" placeholder="请补充或纠正你的想法…"></textarea><button class="chip sc-submit">提交补充</button></div>
    </div>`;
  chatInner.appendChild(wrap);
  bindStageConfirm(wrap);
  scrollToBottom();
}

function bindStageConfirm(wrap) {
  const supply = wrap.querySelector('.sc-supply');
  const textarea = wrap.querySelector('.sc-textarea');
  wrap.querySelectorAll('.sc-btns .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.choice;
      // 记录所选（B/C 用于提交补充时区分）
      wrap.querySelectorAll('.sc-btns .chip').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (choice === 'A') {
        finishStage(wrap, '阶段确认：A 非常准确');
      } else {
        supply.classList.remove('hidden');
        textarea.focus();
      }
    });
  });
  wrap.querySelector('.sc-submit').addEventListener('click', () => {
    const txt = textarea.value.trim();
    const choice = wrap.querySelector('.chip.selected') ? 'B' : 'C';
    const msg = txt ? '阶段确认：' + (choice === 'B' ? 'B 基本准确' : 'C 不准确') + '，补充：' + txt : (choice === 'B' ? '阶段确认：B 基本准确' : '阶段确认：C 不准确');
    finishStage(wrap, msg);
  });
}

// 完成阶段：记录确认，推进下一章（不调 send，直接渲染下一章第一题或生成报告）
function finishStage(wrap, confirmMsg) {
  wrap.remove();
  // 记录阶段确认消息
  addMessage('user', confirmMsg);
  state.chat.push({ role: 'user', content: confirmMsg });
  // 推进到下一章
  const nextChapter = state.currentChapter + 1;
  // 第七章（index 6）是"战略地图"输出章，无题目，直接生成报告
  if (nextChapter === CHAPTERS.length - 1) {
    state.currentChapter = nextChapter;
    saveState();
    chatInner.appendChild(createChapterCard(nextChapter));
    updateProgress();
    chapterName.textContent = CHAPTERS[nextChapter].name;
    reportProgress();
    generateReport();
    return;
  }
  if (nextChapter < CHAPTERS.length) {
    state.currentChapter = nextChapter;
    saveState();
    chatInner.appendChild(createChapterCard(nextChapter));
    updateProgress();
    chapterName.textContent = CHAPTERS[nextChapter].name;
    // 渲染下一章第一题
    renderNextPendingQuestion();
    reportProgress();
  } else {
    // 已完成全部，生成最终报告
    saveState();
    generateReport();
  }
}

// 本章完成后，让 AI 生成《阶段人生镜像》并请求确认
async function generateStageSummary() {
  const genMsg = document.createElement('div');
  genMsg.className = 'msg msg-otter';
  genMsg.innerHTML = `<div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div><div class="msg-bubble gen-notice">🦦 让我为你生成这章的《阶段人生镜像》…</div>`;
  chatInner.appendChild(genMsg);
  scrollToBottom();
  try {
    const messages = [
      { role: 'system', content: window.SYSTEM_PROMPT },
      ...state.chat,
      { role: 'user', content: '【STAGE_SUMMARY】请基于本章所有回答，生成《阶段人生镜像》。' },
    ];
    const reply = await callAI(messages);
    genMsg.remove();
    addMessage('assistant', reply);
    state.chat.push({ role: 'assistant', content: reply });
    saveState();
    renderStageConfirm();
  } catch (e) {
    genMsg.remove();
    addMessage('assistant', '🦦 生成阶段小结遇到点问题：' + e.message);
  }
}

// 最终报告
async function generateReport() {
  const genMsg = document.createElement('div');
  genMsg.className = 'msg msg-otter';
  genMsg.innerHTML = `<div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div><div class="msg-bubble gen-notice">
    🦦 恭喜你完成了全部探索！正在为你生成专属《个人创造战略地图》…<br/>
    预计需要 20-40 秒，你可以稍等片刻，也可以先切出去休息，稍后回来（右上角「报告」按钮）查看完整报告。</div>`;
  chatInner.appendChild(genMsg);
  scrollToBottom();
  try {
    const messages = [
      { role: 'system', content: window.SYSTEM_PROMPT },
      ...state.chat,
      { role: 'user', content: '【REPORT】请根据我所有的回答，生成我的《个人创造战略地图》，严格按 7 个模块输出。' },
    ];
    let reply = await callAI(messages);
    genMsg.remove();
    reply = reply.replace(/(【REPORT_READY】|\[REPORT_READY\])/g, '').trim();
    localStorage.setItem(REPORT_KEY, reply);
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getUserId(), report: reply }),
      });
    } catch (e) { /* ignore */ }
    addMessage('assistant', reply);
    state.chat.push({ role: 'assistant', content: reply });
    state.report = reply;
    saveState();
    // 对话中推送报告提醒
    const notice = document.createElement('div');
    notice.className = 'msg msg-otter';
    notice.innerHTML = `<div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div>
      <div class="report-notice" id="report-notice">
        <img src="assets/report-otter.png" alt="报告" />
        <div class="rn-text"><div class="rn-title">🎉 你的《个人创造战略地图》完成啦！</div><div class="rn-sub">点击查看完整报告</div></div>
      </div>`;
    chatInner.appendChild(notice);
    scrollToBottom();
    notice.querySelector('.report-notice').addEventListener('click', viewReport);
  } catch (e) {
    genMsg.remove();
    addMessage('assistant', '🦦 生成报告遇到点问题：' + e.message);
  }
}

function createChapterCard(chapterIdx) {
  const c = CHAPTERS[chapterIdx] || CHAPTERS[0];
  const card = document.createElement('div');
  card.className = 'chapter-card';
  card.innerHTML = `<div class="cc-tag">第 ${chapterIdx + 1} 章 / 共 7 章</div><div class="cc-title">${c.name}</div>`;
  return card;
}

// ---------- 交互绑定 ----------
function bindQuestionCard(container) {
  const qKey = container.dataset.qk;
  const q = window.QUESTIONS[qKey];
  const sendBtn = container.querySelector('.qsend');

  if (q.type === 'free' && qKey === 'Q8') {
    // Q8 资产画像：点击触发 AI 生成
    sendBtn.addEventListener('click', () => generateAiAssetPortrait(container, qKey));
    return;
  }
  if (q.type === 'free') {
    // 开放题引导卡（Q4 等）：聚焦输入框，提示用户作答
    input.focus();
    return;
  }
  if (q.type === 'sort') {
    bindSort(container, q, sendBtn);
  } else if (q.type === 'slider') {
    sendBtn.addEventListener('click', () => submitSlider(container, q));
  } else if (q.type === 'keyword') {
    container.querySelectorAll('.qkw').forEach((b) => {
      b.addEventListener('click', () => {
        b.classList.toggle('selected');
        // 把选中的关键词填入输入框，引导用户描述
        const sel = Array.from(container.querySelectorAll('.qkw.selected')).map((x) => x.dataset.label);
        input.value = '我参考了这些关键词：' + sel.join('、') + '。我的理想一天是：';
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        input.focus();
      });
    });
    // 用户在主输入框写好描述后，点发送按钮提交（走 send）
    // 卡片上的"选好了"按钮引导用户使用主输入框
    sendBtn.addEventListener('click', () => {
      // 若有关键词，直接引导到输入框，不自动提交
      showToast('请在下方输入框描述你的理想一天，然后点 ➤ 发送');
      input.focus();
    });
  } else {
    // 单选/多选
    const multi = q.type === 'multi';
    const max = q.maxSelect || 1;
    const min = q.minSelect || 1;
    const isScene = !multi && q.scenes && q.scenes.length > 0;
    const sceneCount = isScene ? q.scenes.length : 1;

    // 更新提交按钮状态
    function updateSceneBtn() {
      if (isScene) {
        // 每个场景都要选一个
        let done = 0;
        for (let si = 0; si < sceneCount; si++) {
          if (container.querySelectorAll('.qopt.selected[data-scene="' + si + '"]').length > 0) done++;
        }
        sendBtn.disabled = done < sceneCount;
      } else {
        const count = container.querySelectorAll('.qopt.selected').length;
        sendBtn.disabled = count < min;
      }
    }

    container.querySelectorAll('.qopt').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (isScene) {
          // 场景内单选互斥
          const scene = btn.dataset.scene;
          container.querySelectorAll('.qopt[data-scene="' + scene + '"]').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        } else if (!multi) {
          container.querySelectorAll('.qopt').forEach((b) => { if (b !== btn) b.classList.remove('selected'); });
          btn.classList.add('selected');
        } else {
          btn.classList.toggle('selected');
          const sel = container.querySelectorAll('.qopt.selected').length;
          if (sel > max) { btn.classList.remove('selected'); showToast('最多选 ' + max + ' 个'); }
        }
        updateSceneBtn();
      });
    });
    sendBtn.addEventListener('click', () => {
      if (isScene) {
        const answers = [];
        for (let si = 0; si < sceneCount; si++) {
          const sel = container.querySelector('.qopt.selected[data-scene="' + si + '"]');
          if (sel) answers.push('场景' + (si + 1) + '(' + q.scenes[si].slice(0, 12) + '…)→' + sel.dataset.label);
        }
        if (answers.length < sceneCount) { showToast('请完成所有场景的选择'); return; }
        submitAnswer(container, qKey, answers.join('；'));
      } else {
        const sel = Array.from(container.querySelectorAll('.qopt.selected')).map((b) => b.dataset.label);
        if (sel.length < (q.minSelect || 1)) { showToast('还需选择'); return; }
        submitAnswer(container, qKey, sel.join('、'));
      }
    });
    updateSceneBtn();
  }
}

// 排序交互（拖拽 + 触摸）
function bindSort(container, q, sendBtn) {
  const list = container.querySelector('.qcard-sortlist');
  const max = q.maxSelect || q.options.length;
  let dragged = null;

  function updateNums() {
    const items = list.querySelectorAll('.qsort-item');
    let n = 1;
    items.forEach((it) => {
      if (n <= max) { it.classList.add('selected'); it.querySelector('.qs-num').textContent = n; n++; }
      else { it.classList.remove('selected'); it.querySelector('.qs-num').textContent = ''; }
    });
    sendBtn.disabled = n === 1;
  }
  updateNums();

  // 拖拽开始
  function onDragStart(e) {
    dragged = e.target.closest('.qsort-item');
    if (!dragged) return;
    dragged.classList.add('dragging');
    e.dataTransfer && e.dataTransfer.effectAllowed && (e.dataTransfer.effectAllowed = 'move');
  }
  function onDragOver(e) {
    e.preventDefault();
    const target = e.target.closest('.qsort-item');
    if (!target || target === dragged) return;
    const rect = target.getBoundingClientRect();
    const after = (e.clientY > rect.top + rect.height / 2);
    if (after) target.after(dragged); else target.before(dragged);
    updateNums();
  }
  function onDragEnd() {
    if (dragged) { dragged.classList.remove('dragging'); dragged = null; }
  }
  // 触摸支持
  let touchMoved = false;
  function onTouchStart(e) {
    const it = e.target.closest('.qsort-item');
    if (!it) return;
    dragged = it; touchMoved = false;
    it.classList.add('dragging');
  }
  function onTouchMove(e) {
    if (!dragged) return;
    touchMoved = true;
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.qsort-item');
    if (target && target !== dragged) {
      const rect = target.getBoundingClientRect();
      if (touch.clientY > rect.top + rect.height / 2) target.after(dragged); else target.before(dragged);
      updateNums();
    }
  }
  function onTouchEnd() {
    if (dragged) { dragged.classList.remove('dragging'); dragged = null; }
  }

  list.addEventListener('dragstart', onDragStart);
  list.addEventListener('dragover', onDragOver);
  list.addEventListener('dragend', onDragEnd);
  list.addEventListener('touchstart', onTouchStart, { passive: false });
  list.addEventListener('touchmove', onTouchMove, { passive: false });
  list.addEventListener('touchend', onTouchEnd);

  sendBtn.addEventListener('click', () => {
    if (sendBtn.disabled) return;
    const order = Array.from(list.querySelectorAll('.qsort-item.selected')).map((it) => it.dataset.label);
    if (!order.length) { showToast('请先排序'); return; }
    submitAnswer(container, container.dataset.qk, order.join(' > '));
  });
}

// 滑杆提交
function submitSlider(container, q) {
  const vals = Array.from(container.querySelectorAll('.slider-input')).map((inp) => {
    const idx = inp.dataset.idx;
    return q.sliders[idx].label + ':' + inp.value;
  });
  submitAnswer(container, container.dataset.qk, vals.join('；'));
}

// 提交答案：记录到 chat + 后端，发送给 AI（推进由 send->advanceFlow 统一负责）
function submitAnswer(container, qKey, answerText) {
  container.remove();
  // 设置当前题，供 advanceFlow 标记完成
  state.currentQuestion = qKey;
  const tagged = '【' + qKey + '】' + answerText;
  addMessage('user', tagged);
  state.chat.push({ role: 'user', content: tagged });
  saveState();
  send(tagged);
}

// Q8 资产画像：AI 基于前面回答生成
async function generateAiAssetPortrait(container, qKey) {
  container.remove();
  addMessage('assistant', '🦦 让我根据你前面所有的回答，为你生成《你的个人资产初步画像》…');
  try {
    const messages = [
      { role: 'system', content: window.SYSTEM_PROMPT },
      ...state.chat,
      { role: 'user', content: '请根据我前面所有的回答，生成《你的个人资产初步画像》，包含：能力资产（可能包括）/经历资产（可能包括）/性格资产（可能包括）/资源资产（可能包括）。用 Markdown 结构输出，语气温暖。' },
    ];
    const reply = await callAI(messages);
    addMessage('assistant', reply);
    state.chat.push({ role: 'assistant', content: reply });
    // 渲染确认卡片
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-otter';
    wrap.innerHTML = `<div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div>
      <div class="summary-confirm">
        <div class="sc-title">这份资产画像准确吗？</div>
        <div class="sc-btns">
          <button class="chip sc-yes">✓ 准确</button>
          <button class="chip sc-no">✎ 需要修改</button>
        </div>
        <div class="sc-supply hidden"><textarea class="sc-textarea" placeholder="哪些准确？哪些需要修改？"></textarea><button class="chip sc-submit">提交</button></div>
      </div>`;
    chatInner.appendChild(wrap);
    const supply = wrap.querySelector('.sc-supply');
    const textarea = wrap.querySelector('.sc-textarea');
    wrap.querySelector('.sc-yes').addEventListener('click', () => {
      wrap.remove();
      finishQuestionAfterConfirm(qKey, '资产画像确认：准确');
    });
    wrap.querySelector('.sc-no').addEventListener('click', () => {
      supply.classList.remove('hidden'); textarea.focus();
    });
    wrap.querySelector('.sc-submit').addEventListener('click', () => {
      const txt = textarea.value.trim();
      wrap.remove();
      finishQuestionAfterConfirm(qKey, '资产画像确认，修改：' + (txt || '无补充'));
    });
    scrollToBottom();
  } catch (e) {
    addMessage('assistant', '🦦 生成资产画像遇到点问题：' + e.message);
  }
}

// Q8 确认后完成该题，进入下一题
function finishQuestionAfterConfirm(qKey, confirmMsg) {
  state.completedQuestions = state.completedQuestions || {};
  state.completedQuestions[qKey] = true;
  addMessage('user', confirmMsg);
  state.chat.push({ role: 'user', content: confirmMsg });
  saveState();
  send('（已确认' + qKey + '，继续下一题）');
}

// 生成报告并在对话中推送提醒
// ---------- 重置 / 开始 ----------
function resetSession() {
  state = { chat: [], currentChapter: 0, report: '', currentQuestion: null, completedQuestions: {} };
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(REPORT_KEY);
  chatInner.innerHTML = '';
}

async function startNew() {
  resetSession();
  showScreen('chat');
  renderChapterCard();
  updateProgress();
  chapterName.textContent = CHAPTERS[0].name;

  // 固定欢迎语（不依赖 AI）
  const greeting = '🦦 你好呀！我是你的海獭人生教练 see-me。接下来我会陪你用 7 个章节、约 20 分钟，完成一次深度的自我探索。\n\n我们按顺序来，一步一题，界面会引导你作答。\n\n💾 不用担心一次做完——你的进度会自动保存，随时可以关掉休息，回来继续。就从第一章的第一个问题开始吧（请看下方的卡片）。';
  addMessage('assistant', greeting);
  state.chat.push({ role: 'assistant', content: greeting });
  saveState();

  // 渲染第一章第一题
  state.currentQuestion = null;
  renderNextPendingQuestion();
  input.placeholder = '自由输入你的想法，或按界面卡片作答';
  input.focus();
}

// ---------- 报告 ----------
async function viewReport() {
  showScreen('report');
  const cached = localStorage.getItem(REPORT_KEY);
  if (cached && cached.trim()) {
    reportContent.innerHTML = mdToHtml(cached);
    return;
  }
  // 若对话未完成到第七章，提示用户
  if (state.currentChapter < CHAPTERS.length - 1 || state.chat.length < 4) {
    reportContent.innerHTML = `<p class="report-loading">🦦 战略地图需要在探索接近尾声时生成。<br/><br/>你目前完成了第 ${Math.min(state.currentChapter + 1, 7)} 章，<br/>继续回答，海獭教练会帮你把答案织成地图哦 🌊</p>`;
    return;
  }
  reportContent.innerHTML = '<p class="report-loading">🦦 正在把你的 17 个答案织成战略地图…</p>';
  try {
    const messages = [
      { role: 'system', content: window.SYSTEM_PROMPT },
      ...state.chat,
      { role: 'user', content: '我们的探索已经全部完成。现在请根据我上面的全部回答，生成完整的《个人创造战略地图》，严格按第七章的结构输出（核心人生主题 / 个人身份组合 / 核心优势组合 / 潜在创造方向 / 五年路线图 / 个人操作系统 / 未来30天行动计划），用 Markdown 分节，语气温暖具体。' },
    ];
    const reply = await callAI(messages);
    localStorage.setItem(REPORT_KEY, reply);
    // 同步保存到服务端
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getUserId(), report: reply }),
      });
    } catch (e) { /* ignore */ }
    reportContent.innerHTML = mdToHtml(reply);
  } catch (e) {
    reportContent.innerHTML = `<p class="report-loading">🦦 生成失败：${escapeHtml(e.message)}</p>`;
  }
}

// ---------- 用户 ID 与历史记录 ----------
function initAccountUI() {
  const custom = localStorage.getItem('see-me-custom-id');
  $('#my-id-input').value = custom || '';
  $('#account-tip').textContent = custom ? '当前 ID：' + custom : '使用匿名 ID：' + getUserId();
}

function saveCustomId() {
  const v = $('#my-id-input').value.trim();
  if (!v) { showToast('请输入一个 ID'); return; }
  localStorage.setItem('see-me-custom-id', v);
  $('#account-tip').textContent = '已保存 ID：' + v;
  showToast('ID 已保存，换设备用同一 ID 可找回历史 🎉');
}

// 打开历史记录列表
async function openHistory() {
  showScreen('history');
  const listBox = $('#history-list');
  listBox.innerHTML = '<p class="history-empty">加载中…</p>';
  try {
    const sessions = await (await fetch('/api/history?uid=' + encodeURIComponent(getUserId()))).json();
    if (!sessions.length) {
      listBox.innerHTML = '<p class="history-empty">还没有历史记录。开始探索后，这里会保存你的对话 🌊</p>';
      return;
    }
    listBox.innerHTML = '';
    sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const done = s.chapter >= CHAPTERS.length ? '已完成' : `第 ${s.chapter + 1} 章`;
      item.innerHTML = `
        <div class="hi-top">
          <span class="hi-report">${done}</span>
          <span class="hi-time">${new Date(s.last_active).toLocaleString('zh-CN', { hour12: false })}</span>
        </div>
        <div class="hi-meta">
          <span class="hi-chapter">${s.msg_count} 条消息</span>
          <span class="hi-msgs">用户回答 ${s.user_msg_count} 次</span>
          ${s.has_report ? '<span class="hi-report">已有报告 📄</span>' : ''}
        </div>`;
      item.addEventListener('click', () => openHistoryDetail(s.id));
      listBox.appendChild(item);
    });
  } catch (e) {
    listBox.innerHTML = `<p class="history-empty">加载失败：${escapeHtml(e.message)}</p>`;
  }
}

// 打开某历史会话详情
async function openHistoryDetail(sessionId) {
  showScreen('history-detail');
  $('#hdetail-title').textContent = '历史对话 #' + sessionId;
  const thread = $('#hdetail-thread');
  thread.innerHTML = '<p class="history-empty">加载中…</p>';
  $('#hdetail-report-wrap').classList.add('hidden');
  try {
    const msgs = await (await fetch('/api/history/' + sessionId + '/messages')).json();
    thread.innerHTML = msgs.map((m) => {
      const isAi = m.role === 'assistant';
      return `<div class="ht-row ${isAi ? 'ai' : 'user'}">
        <span class="ht-who">${isAi ? 'AI' : '用户'}</span>
        <div class="ht-body">${isAi ? mdToHtml(m.content) : escapeHtml(m.content)}
          <div class="ht-meta">${new Date(m.created_at).toLocaleString('zh-CN', { hour12: false })}${m.chapter ? ' · 第' + m.chapter + '章' : ''}</div>
        </div>
      </div>`;
    }).join('');
    if (!msgs.length) thread.innerHTML = '<p class="history-empty">该会话暂无消息</p>';

    // 加载报告
    const rep = await (await fetch('/api/history/' + sessionId + '/report')).json();
    if (rep.report) {
      $('#hdetail-report').innerHTML = mdToHtml(rep.report);
      $('#hdetail-report-wrap').classList.remove('hidden');
    }
  } catch (e) {
    thread.innerHTML = `<p class="history-empty">加载失败：${escapeHtml(e.message)}</p>`;
  }
}

// ---------- 界面切换 ----------
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ---------- 事件绑定 ----------
$('#btn-start').addEventListener('click', () => { if (!resumeSession()) startNew(); });
$('#btn-send').addEventListener('click', () => send());
$('#btn-home').addEventListener('click', () => { showScreen('home'); updateHomeButton(); initAccountUI(); });
$('#btn-save-id').addEventListener('click', saveCustomId);
$('#btn-history').addEventListener('click', openHistory);
$('#btn-history-back').addEventListener('click', () => showScreen('home'));
$('#btn-hdetail-back').addEventListener('click', openHistory);
$('#btn-restart').addEventListener('click', () => {
  if (confirm('确定重新开始吗？将清空当前探索进度。')) startNew();
});
$('#btn-report').addEventListener('click', viewReport);
$('#btn-back-chat').addEventListener('click', () => showScreen('chat'));
$('#btn-copy').addEventListener('click', () => {
  const txt = localStorage.getItem(REPORT_KEY);
  if (!txt) { showToast('还没有可复制的地图'); return; }
  navigator.clipboard.writeText(txt).then(() => showToast('已复制 🎉')).catch(() => showToast('复制失败，请手动选择'));
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

// ---------- 启动 ----------
function resumeSession() {
  if (!state.chat || state.chat.length === 0) return false;
  showScreen('chat');
  // 章节卡片只在 chatInner 为空时才渲染（避免重复）
  if (!chatInner.querySelector('.chapter-card')) {
    renderChapterCard();
  }
  // 只渲染 DOM 中还没有的消息（避免重复渲染）
  if (chatInner.querySelectorAll('.msg').length === 0) {
    state.chat.forEach((m) => { if (m.role === 'assistant') addMessage('assistant', m.content); else addMessage('user', m.content); });
  }
  updateProgress();
  // 恢复后，渲染当前章节第一道未完成题（前端主导）
  requestAnimationFrame(() => {
    renderNextPendingQuestion();
    chatScroll.scrollTop = chatScroll.scrollHeight;
    if (!document.querySelector('.qcard')) input.focus();
  });
  return true;
}

function updateHomeButton() {
  const hasSession = state.chat && state.chat.length > 0;
  $('#btn-start').textContent = hasSession ? '继续探索 🦦' : '开始探索 🦦';
}

async function init() {
  loadState();
  initAccountUI();
  updateHomeButton();
  // 禁用按钮等待状态检查
  try {
    const res = await fetch('/api/status');
    const st = await res.json();
    if (!st.ok || !st.keyConfigured) {
      showToast('⚠️ 服务端未配置 Deepseek API Key，请在 .env 填写后重启');
    }
  } catch (e) { /* server not ready */ }

  // 恢复会话
  resumeSession();
}
init();