/**
 * see-me 个人成长助手 —— 后端服务
 * 职责：
 *  1) 托管 public/ 静态文件（单页应用）
 *  2) POST /api/chat 代理 Deepseek API（保护 Key，规避 CORS）
 *  3) GET  /api/status 健康检查
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// --- 读取 .env（不依赖第三方库，手写极简解析） ---
function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1], val = m[2].replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 4380);
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 4 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// 静态文件服务
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // 防目录穿越
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      // SPA 回退到 index.html
      if (req.headers['accept'] && req.headers['accept'].includes('text/html')) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404); res.end('Not Found'); }
          else { res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(html); }
        });
      } else {
        res.writeHead(404); res.end('Not Found');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

// Deepseek 代理
async function handleChat(req, res) {
  if (!DEEPSEEK_API_KEY) {
    sendJson(res, 500, { error: '服务端未配置 DEEPSEEK_API_KEY，请在 .env 中填写后重启服务。' });
    return;
  }
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { sendJson(res, 400, { error: '请求体不是合法 JSON' }); return; }

  const { messages, temperature = 0.7 } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    sendJson(res, 400, { error: 'messages 不能为空' }); return;
  }

  const payload = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature,
    stream: false,
  };

  try {
    const upstream = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      sendJson(res, 502, { error: `Deepseek 返回错误 (${upstream.status}): ${text}` });
      return;
    }
    const data = JSON.parse(text);
    const content = data.choices?.[0]?.message?.content || '';
    sendJson(res, 200, { content, usage: data.usage || null });
  } catch (e) {
    sendJson(res, 502, { error: 'Deepseek 请求失败: ' + e.message });
  }
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET' && url === '/api/status') {
    return sendJson(res, 200, { ok: true, keyConfigured: !!DEEPSEEK_API_KEY, model: DEEPSEEK_MODEL });
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end('Method Not Allowed');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  🦦 see-me 个人成长助手');
  console.log('  slogan: 让创造发生 make creation happen');
  console.log(`  监听:   http://0.0.0.0:${PORT}`);
  console.log(`  API Key: ${DEEPSEEK_API_KEY ? '已配置 ✓ (model: ' + DEEPSEEK_MODEL + ')' : '未配置 ✗ 请在 .env 填写 DEEPSEEK_API_KEY'}`);
  console.log('==============================================');
});