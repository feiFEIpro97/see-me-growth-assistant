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

// ---------- DOM ----------
const $ = (s) => document.querySelector(s);
const screens = { home: $('#screen-home'), chat: $('#screen-chat'), report: $('#screen-report') };
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
let state = { chat: [], currentChapter: 0, report: '' };
let sending = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
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
    wrap.innerHTML = `<div class="avatar"><img src="assets/sea-otter.svg" alt="海獭教练"></div><div class="msg-bubble">${mdToHtml(content)}</div>`;
  }
  chatInner.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-otter typing';
  wrap.innerHTML = `<div class="avatar"><img src="assets/sea-otter.svg" alt="海獭教练"></div><div class="msg-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
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
async function callAI(messages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature: 0.8 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败(${res.status})`);
  return data.content || '';
}

// ---------- 发送 ----------
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
  saveState();

  const typing = addTyping();
  try {
    const messages = [{ role: 'system', content: window.SYSTEM_PROMPT }, ...state.chat];
    const reply = await callAI(messages);
    typing.remove();
    state.chat.push({ role: 'assistant', content: reply });
    state.currentChapter = detectChapter(reply, state.currentChapter);
    saveState();
    addMessage('assistant', reply);
    updateProgress();
    chapterName.textContent = CHAPTERS[state.currentChapter].name;
    showToast('海獭教练思考好啦 🌊');
  } catch (e) {
    typing.remove();
    addMessage('assistant', '🦦 哎呀，我这边有点小状况：\n' + e.message);
    showToast('连接有点问题，请重试');
  }
  sending = false;
  btnSend.disabled = false;
  input.focus();
}

// ---------- 重置 / 开始 ----------
function resetSession() {
  state = { chat: [], currentChapter: 0, report: '' };
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(REPORT_KEY);
  chatInner.innerHTML = '';
}

async function startNew() {
  resetSession();
  showScreen('chat');
  renderChapterCard();
  updateProgress();
  renderSuggestions(['开始我们的探索吧 🌟']);

  const typing = addTyping();
  try {
    const greeting = await callAI([
      { role: 'system', content: window.SYSTEM_PROMPT },
      { role: 'user', content: '（这是一段新探索的开始）海獭教练，请向我做一个简短温暖的自我介绍，说明你会陪我完成 7 个章节、约 20 分钟的自我探索，然后正式开始第一章的第一个问题。' },
    ]);
    typing.remove();
    state.chat.push({ role: 'assistant', content: greeting });
    saveState();
    addMessage('assistant', greeting);
  } catch (e) {
    typing.remove();
    addMessage('assistant', '🦦 你好呀！我是 see-me 海獭教练，很高兴陪你一起探索自己 🌊\n\n（注意：' + e.message + '）');
  }
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
      { role: 'user', content: '我们的探索已经全部完成。现在请根据我上面的全部回答，生成完整的《个人创造战略地图》，严格按第七章的结构输出（核心人生主题 / 个人身份组合 / 核心优势组合 / 潜在创造方向 / 五年路线图 / 个人操作系统 / 未来30天行动计划），用 Markdown 分节，语气温暖具体。' },
    ];
    const reply = await callAI(messages);
    localStorage.setItem(REPORT_KEY, reply);
    reportContent.innerHTML = mdToHtml(reply);
  } catch (e) {
    reportContent.innerHTML = `<p class="report-loading">🦦 生成失败：${escapeHtml(e.message)}</p>`;
  }
}

// ---------- 界面切换 ----------
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ---------- 事件绑定 ----------
$('#btn-start').addEventListener('click', startNew);
$('#btn-send').addEventListener('click', () => send());
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
async function init() {
  loadState();
  // 禁用按钮等待状态检查
  try {
    const res = await fetch('/api/status');
    const st = await res.json();
    if (!st.ok || !st.keyConfigured) {
      showToast('⚠️ 服务端未配置 Deepseek API Key，请在 .env 填写后重启');
    }
  } catch (e) { /* server not ready */ }

  // 恢复会话
  if (state.chat && state.chat.length > 0) {
    showScreen('chat');
    renderChapterCard();
    state.chat.forEach((m) => { if (m.role === 'assistant') addMessage('assistant', m.content); else addMessage('user', m.content); });
    updateProgress();
  }
}
init();