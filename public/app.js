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
    let reply = await callAI(messages);
    typing.remove();

    // 检测结束标记（兼容全角/半角）
    const done = /【REPORT_READY】|\[REPORT_READY\]/;
    const ready = done.test(reply);
    if (ready) reply = reply.replace(/(【REPORT_READY】|\[REPORT_READY\])/g, '').trim();

    state.chat.push({ role: 'assistant', content: reply });
    state.currentChapter = detectChapter(reply, state.currentChapter);
    saveState();
    addMessage('assistant', reply);
    updateProgress();
    chapterName.textContent = CHAPTERS[state.currentChapter].name;
    reportProgress();
    showToast('海獭教练思考好啦 🌊');

    // 若探索全部完成，自动生成报告
    if (ready) {
      await generateReportAndNotify();
    }
  } catch (e) {
    typing.remove();
    addMessage('assistant', '🦦 哎呀，我这边有点小状况：\n' + e.message);
    showToast('连接有点问题，请重试');
  }
  sending = false;
  btnSend.disabled = false;
  input.focus();
}

// 生成报告并在对话中推送提醒
async function generateReportAndNotify() {
  // 对话中提示正在生成
  const genMsg = document.createElement('div');
  genMsg.className = 'msg msg-otter';
  genMsg.innerHTML = `<div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div><div class="msg-bubble gen-notice">🦦 正在为你生成专属《个人创造战略地图》…</div>`;
  chatInner.appendChild(genMsg);
  scrollToBottom();

  try {
    const messages = [
      { role: 'system', content: window.SYSTEM_PROMPT },
      ...state.chat,
      { role: 'user', content: '我们的探索已经全部完成。现在请根据我上面的全部回答，生成完整的《个人创造战略地图》，严格按第七章的结构输出，用 Markdown 分节，语气温暖具体。' },
    ];
    const report = await callAI(messages);
    localStorage.setItem(REPORT_KEY, report);
    genMsg.remove();

    // 报告同步保存到服务端（按用户ID的最新会话）
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getUserId(), report }),
      });
    } catch (e) { /* 保存失败不影响本地查看 */ }

    // 对话中推送可点击提醒
    const notice = document.createElement('div');
    notice.className = 'msg msg-otter';
    notice.innerHTML = `
      <div class="avatar"><img src="assets/avatar-o1.png" alt="海獭教练"></div>
      <div class="report-notice" id="report-notice">
        <img src="assets/report-otter.png" alt="报告" />
        <div class="rn-text">
          <div class="rn-title">🎉 你的《个人创造战略地图》完成啦！</div>
          <div class="rn-sub">点击查看完整报告</div>
        </div>
      </div>`;
    chatInner.appendChild(notice);
    scrollToBottom();
    notice.querySelector('.report-notice').addEventListener('click', viewReport);
  } catch (e) {
    genMsg.remove();
    addMessage('assistant', '🦦 报告生成遇到点问题：' + e.message);
  }
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
  // 滚动到底部 + 聚焦输入框，让用户直接接着答
  requestAnimationFrame(() => {
    chatScroll.scrollTop = chatScroll.scrollHeight;
    input.focus();
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