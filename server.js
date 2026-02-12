import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const ADMIN_KEY = process.env.ADMIN_KEY || 'super-admin-key';

const users = new Map([
  ['demo-user', { id: 'demo-user', name: 'Player One', ton: 25.0, stars: 1500 }]
]);

const ensureUser = (id) => {
  if (!id) return null;
  if (!users.has(id)) users.set(id, { id, name: `Игрок ${id}`, ton: 0, stars: 0 });
  return users.get(id);
};

const roundCrashPoint = () => {
  const r = Math.random();
  const point = 1.05 + (1 / (1 - r) - 1) * 0.75;
  return Math.min(Number(point.toFixed(2)), 20);
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
};

const sendFile = async (res, filePath) => {
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType =
      ext === '.css'
        ? 'text/css; charset=utf-8'
        : ext === '.js'
          ? 'application/javascript; charset=utf-8'
          : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'Файл не найден' });
  }
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname.startsWith('/api/users/')) {
    const user = ensureUser(decodeURIComponent(url.pathname.split('/').pop()));
    if (!user) return sendJson(res, 400, { error: 'Некорректный user id' });
    return sendJson(res, 200, user);
  }

  if (req.method === 'POST' && url.pathname === '/api/topup') {
    const { userId, currency, amount } = await readBody(req);
    const user = ensureUser(userId);
    const value = Number(amount);
    if (!user || !['ton', 'stars'].includes(currency) || !Number.isFinite(value) || value <= 0) {
      return sendJson(res, 400, { error: 'Проверьте параметры пополнения.' });
    }
    user[currency] = Number((user[currency] + value).toFixed(2));
    return sendJson(res, 200, { ok: true, balance: user });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/grant') {
    const { adminKey, userId, ton = 0, stars = 0 } = await readBody(req);
    if (adminKey !== ADMIN_KEY) return sendJson(res, 403, { error: 'Неверный ключ администратора.' });
    const user = ensureUser(userId);
    const tonValue = Number(ton);
    const starsValue = Number(stars);
    if (!user || !Number.isFinite(tonValue) || !Number.isFinite(starsValue)) {
      return sendJson(res, 400, { error: 'Невалидные значения для выдачи.' });
    }
    user.ton = Number((user.ton + tonValue).toFixed(2));
    user.stars = Number((user.stars + starsValue).toFixed(2));
    return sendJson(res, 200, { ok: true, balance: user });
  }

  if (req.method === 'POST' && url.pathname === '/api/game/start') {
    const { userId, stake, currency } = await readBody(req);
    const user = ensureUser(userId);
    const bet = Number(stake);
    if (!user || !['ton', 'stars'].includes(currency) || !Number.isFinite(bet) || bet <= 0) {
      return sendJson(res, 400, { error: 'Некорректная ставка.' });
    }
    if (user[currency] < bet) return sendJson(res, 400, { error: 'Недостаточно средств.' });
    user[currency] = Number((user[currency] - bet).toFixed(2));
    return sendJson(res, 200, { ok: true, stake: bet, currency, crashPoint: roundCrashPoint(), balance: user });
  }

  if (req.method === 'POST' && url.pathname === '/api/game/cashout') {
    const { userId, currency, stake, multiplier, crashPoint } = await readBody(req);
    const user = ensureUser(userId);
    const m = Number(multiplier);
    const cp = Number(crashPoint);
    const s = Number(stake);
    if (!user || !Number.isFinite(m) || !Number.isFinite(cp) || !Number.isFinite(s)) {
      return sendJson(res, 400, { error: 'Некорректные параметры кэшаута.' });
    }
    if (m >= cp) return sendJson(res, 400, { error: 'Слишком поздно, ракета уже взорвалась.' });
    const win = Number((s * m).toFixed(2));
    user[currency] = Number((user[currency] + win).toFixed(2));
    return sendJson(res, 200, { ok: true, win, balance: user });
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return sendFile(res, path.join(publicDir, 'index.html'));
  }
  if (req.method === 'GET' && (url.pathname === '/styles.css' || url.pathname === '/app.js')) {
    return sendFile(res, path.join(publicDir, url.pathname.slice(1)));
  }

  return sendFile(res, path.join(publicDir, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Mini app ready on http://localhost:${port}`);
});
