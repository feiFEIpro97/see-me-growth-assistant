/**
 * see-me 后台管理 —— 查看所有用户的探索问答数据
 */
'use strict';

const $ = (s) => document.querySelector(s);
const toast = $('#toast');
let token = localStorage.getItem('see-me-admin-token') || '';

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token },
  });
  if (res.status === 401) {
    localStorage.removeItem('see-me-admin-token');
    showLoginView();
    throw new Error('未授权');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function showLoginView() {
  $('#login-view').style.display = 'block';
  $('#main-view').classList.add('hidden');
}
function showMainView() {
  $('#login-view').style.display = 'none';
  $('#main-view').classList.remove('hidden');
}

function esc(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}
function shortUid(uid) {
  return uid ? uid.replace('u_', '').slice(0, 12) : '-';
}

// 渲染统计
function renderStats(st) {
  const items = [
    ['👥', '总用户数', st.totalUsers],
    ['💬', '总消息数', st.totalMessages],
    ['✍️', '用户回答', st.totalUserMsgs],
    ['🤖', 'AI 回复', st.totalAiMsgs],
    ['📖', '平均章节', st.avgChapter + '/7'],
  ];
  $('#stats').innerHTML = items.map(([emoji, label, num]) =>
    `<div class="stat"><div class="num">${emoji} ${esc(num)}</div><div class="label">${esc(label)}</div></div>`
  ).join('');
}

// 渲染会话列表
function renderSessions(sessions) {
  const box = $('#sessions-box');
  if (!sessions.length) {
    box.innerHTML = '<div class="empty">暂无用户数据，快去邀请用户探索吧 🦦</div>';
    return;
  }
  let html = '<div class="sess-row head"><span>用户 ID</span><span>开始时间</span><span>最近活跃</span><span>章节</span><span>消息数</span><span></span></div>';
  sessions.forEach((s) => {
    html += `<div class="sess-row" data-id="${s.id}">
      <span class="uid" title="${esc(s.user_id)}">${esc(shortUid(s.user_id))}</span>
      <span class="time">${esc(fmtTime(s.started_at))}</span>
      <span class="time">${esc(fmtTime(s.last_active))}</span>
      <span><span class="chapter-badge">${s.chapter}/7</span></span>
      <span>${s.msg_count} (答 ${s.user_msg_count})</span>
      <span style="color:var(--blue-700)">查看 →</span>
    </div>`;
  });
  box.innerHTML = html;
  box.querySelectorAll('.sess-row[data-id]').forEach((row) => {
    row.addEventListener('click', () => openSession(row.dataset.id));
  });
}

// 打开某会话详情
async function openSession(id) {
  try {
    const msgs = await api('/api/admin/sessions/' + id);
    $('#list-view').classList.add('hidden');
    $('#detail-view').classList.remove('hidden');
    $('#detail-title').textContent = '会话 #' + id + ' · 完整问答';
    const thread = $('#thread');
    thread.innerHTML = msgs.map((m) => {
      const isAi = m.role === 'assistant';
      const body = isAi ? mdToHtml(m.content) : esc(m.content);
      const chap = m.chapter ? ` · 第${m.chapter}章` : '';
      const q = m.question ? `<div class="meta">对应：${esc(m.question)}</div>` : '';
      return `<div class="mt ${isAi ? 'ai' : 'user'}">
        <span class="who">${isAi ? 'AI' : '用户'}</span>
        <div class="body">${body}${q}<div class="meta">${esc(fmtTime(m.created_at))}${esc(chap)}</div></div>
      </div>`;
    }).join('');
    if (!msgs.length) thread.innerHTML = '<div class="empty">该会话暂无消息</div>';
  } catch (e) {
    showToast(e.message);
  }
}

// 简易 markdown 到 html（列表/标题/加粗）
function mdToHtml(md = '') {
  const lines = md.split(/\r?\n/);
  let html = '', inList = false;
  const close = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trim();
    const em = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (/^#{1,4}\s/.test(line)) { close(); html += `<h${Math.min(line.match(/^#+/)[0].length,4)}>${em(line.replace(/^#+\s*/,''))}</h${Math.min(line.match(/^#+/)[0].length,4)}>`; }
    else if (/^[-*•]\s/.test(line)) { if(!inList){html+='<ul>';inList=true;} html += `<li>${em(line.replace(/^[-*•]\s*/,''))}</li>`; }
    else if (/^\d+[.、）)]\s/.test(line)) { if(!inList){html+='<ul>';inList=true;} html += `<li>${em(line.replace(/^\d+[.、）)]\s*/,''))}</li>`; }
    else if (!line.trim()) close();
    else { close(); html += `<p>${em(line)}</p>`; }
  }
  close();
  return html;
}

function btnBack() {
  $('#list-view').classList.remove('hidden');
  $('#detail-view').classList.add('hidden');
}

async function loadAll() {
  try {
    const [stats, sessions] = await Promise.all([api('/api/admin/stats'), api('/api/admin/sessions?limit=100')]);
    renderStats(stats);
    renderSessions(sessions);
    $('#db-status').textContent = '✅ 数据库已连接';
  } catch (e) {
    $('#db-status').textContent = '⚠️ ' + e.message;
    showToast(e.message);
  }
}

// 登录
async function doLogin() {
  // 先用 token 试探
  const pwd = $('#pwd').value.trim();
  if (pwd) { token = pwd; localStorage.setItem('see-me-admin-token', pwd); }
  try {
    await api('/api/admin/stats');
    $('#login-err').textContent = '';
    showMainView();
    loadAll();
  } catch (e) {
    $('#login-err').textContent = '密码错误，请重试';
    token = '';
    localStorage.removeItem('see-me-admin-token');
  }
}

$('#btn-login').addEventListener('click', doLogin);
$('#pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('#btn-refresh').addEventListener('click', loadAll);
$('#btn-back').addEventListener('click', btnBack);

// 启动：有 token 则直接尝试进入
(async function init() {
  if (token) {
    try {
      await api('/api/admin/stats');
      showMainView();
      loadAll();
      return;
    } catch (e) { /* fall to login */ }
  }
  showLoginView();
})();