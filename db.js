/**
 * 数据库模块 —— 使用 Postgres（pg 驱动）
 * 记录所有用户的探索问答数据，供后台查看。
 * Render 通过 DATABASE_URL 环境变量注入 Postgres 连接串。
 */
'use strict';

const { Pool } = require('pg');

let pool = null;
let dbReady = false;

function isConfigured() {
  return !!process.env.DATABASE_URL;
}

async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('[db] 未配置 DATABASE_URL，数据记录功能不可用（后台不可用）。');
    return false;
  }
  try {
    pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 10000,
      ssl: url.includes('sslmode=require') || /serve|render|neon|supabase/i.test(url)
        ? { rejectUnauthorized: false }
        : undefined,
    });
    // 创建表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS see_me_sessions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        last_active TIMESTAMPTZ DEFAULT NOW(),
        chapter INT DEFAULT 0,
        report TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS see_me_messages (
        id SERIAL PRIMARY KEY,
        session_id INT REFERENCES see_me_sessions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        chapter INT,
        question TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_user ON see_me_sessions(user_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_session ON see_me_messages(session_id);');
    dbReady = true;
    console.log('[db] Postgres 已连接，数据表就绪 ✓');
    return true;
  } catch (e) {
    console.error('[db] 初始化失败：', e.message);
    return false;
  }
}

// 获取或创建会话
async function getOrCreateSession(userId) {
  if (!dbReady) return null;
  const r = await pool.query(
    'SELECT * FROM see_me_sessions WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (r.rows.length > 0) {
    await pool.query('UPDATE see_me_sessions SET last_active = NOW() WHERE id = $1', [r.rows[0].id]);
    return r.rows[0];
  }
  const ins = await pool.query(
    'INSERT INTO see_me_sessions(user_id) VALUES($1) RETURNING *',
    [userId]
  );
  return ins.rows[0];
}

// 记录一条消息
async function logMessage({ userId, role, content, chapter, question }) {
  if (!dbReady) return;
  try {
    const session = await getOrCreateSession(userId);
    if (!session) return;
    await pool.query(
      `INSERT INTO see_me_messages(session_id, user_id, role, content, chapter, question)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [session.id, userId, role, content, chapter || 0, question || null]
    );
    await pool.query('UPDATE see_me_sessions SET last_active = NOW() WHERE id = $1', [session.id]);
  } catch (e) {
    console.error('[db] logMessage 失败：', e.message);
  }
}

// 更新章节进度
async function updateChapter(userId, chapter) {
  if (!dbReady) return;
  try {
    const session = await getOrCreateSession(userId);
    if (session) await pool.query('UPDATE see_me_sessions SET chapter = $1 WHERE id = $2', [chapter, session.id]);
  } catch (e) { /* ignore */ }
}

// 后台：统计概览
async function getStats() {
  if (!dbReady) return null;
  const totalUsers = await pool.query('SELECT COUNT(DISTINCT user_id) AS c FROM see_me_sessions');
  const totalMessages = await pool.query('SELECT COUNT(*) AS c FROM see_me_messages');
  const totalUserMsgs = await pool.query("SELECT COUNT(*) AS c FROM see_me_messages WHERE role='user'");
  const totalAiMsgs = await pool.query("SELECT COUNT(*) AS c FROM see_me_messages WHERE role='assistant'");
  const avgChapter = await pool.query('SELECT ROUND(AVG(chapter)) AS c FROM see_me_sessions');
  return {
    totalUsers: totalUsers.rows[0].c,
    totalMessages: totalMessages.rows[0].c,
    totalUserMsgs: totalUserMsgs.rows[0].c,
    totalAiMsgs: totalAiMsgs.rows[0].c,
    avgChapter: avgChapter.rows[0].c || 0,
  };
}

// 后台：会话列表（含各会话消息数、最新时间）
async function listSessions(limit = 50) {
  if (!dbReady) return [];
  const r = await pool.query(`
    SELECT s.id, s.user_id, s.started_at, s.last_active, s.chapter,
           (SELECT COUNT(*) FROM see_me_messages m WHERE m.session_id = s.id) AS msg_count,
           (SELECT COUNT(*) FROM see_me_messages m WHERE m.session_id = s.id AND m.role='user') AS user_msg_count
    FROM see_me_sessions s
    ORDER BY s.last_active DESC
    LIMIT $1
  `, [limit]);
  return r.rows;
}

// 后台：某会话的完整消息
async function getSessionMessages(sessionId) {
  if (!dbReady) return [];
  const r = await pool.query(
    'SELECT role, content, chapter, question, created_at FROM see_me_messages WHERE session_id = $1 ORDER BY id ASC',
    [sessionId]
  );
  return r.rows;
}

// 用户端：按 user_id 查询该用户的历史会话列表
async function getHistoryByUser(userId, limit = 50) {
  if (!dbReady) return [];
  const r = await pool.query(`
    SELECT s.id, s.user_id, s.started_at, s.last_active, s.chapter,
           (s.report IS NOT NULL AND s.report <> '') AS has_report,
           (SELECT COUNT(*) FROM see_me_messages m WHERE m.session_id = s.id) AS msg_count,
           (SELECT COUNT(*) FROM see_me_messages m WHERE m.session_id = s.id AND m.role='user') AS user_msg_count
    FROM see_me_sessions s
    WHERE s.user_id = $1
    ORDER BY s.last_active DESC
    LIMIT $2
  `, [userId, limit]);
  return r.rows;
}

// 用户端：保存/更新某会话的报告
async function saveReport(sessionId, report) {
  if (!dbReady) return;
  try {
    await pool.query('UPDATE see_me_sessions SET report = $1 WHERE id = $2', [report, sessionId]);
  } catch (e) {
    console.error('[db] saveReport 失败：', e.message);
  }
}

// 用户端：读取某会话的报告
async function getReport(sessionId) {
  if (!dbReady) return null;
  const r = await pool.query('SELECT report FROM see_me_sessions WHERE id = $1', [sessionId]);
  return r.rows[0]?.report || null;
}

// 用户端：把报告保存到该用户最近一次会话
async function saveReportToLatest(userId, report) {
  if (!dbReady) return;
  try {
    await pool.query(
      'UPDATE see_me_sessions SET report = $1 WHERE id = (SELECT id FROM see_me_sessions WHERE user_id = $2 ORDER BY id DESC LIMIT 1)',
      [report, userId]
    );
  } catch (e) {
    console.error('[db] saveReportToLatest 失败：', e.message);
  }
}

module.exports = {
  isConfigured,
  initDb,
  logMessage,
  updateChapter,
  getStats,
  listSessions,
  getSessionMessages,
  getHistoryByUser,
  saveReport,
  getReport,
  saveReportToLatest,
};