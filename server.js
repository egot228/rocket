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

const randomCrashPoint = () => {
  const r = Math.random();
  const point = 1.25 + (1 / (1 - r) - 1) * 0.85;
  return Math.min(Number(point.toFixed(2)), 22);
};

const createRound = () => ({
  id: `r-${Date.now()}`,
  prepMs: 7000,
  createdAt: Date.now(),
  startedAt: null,
  crashedAt: null,
  crashPoint: randomCrashPoint(),
  bets: new Map()
});

let round = createRound();

const getMultiplierByElapsed = (seconds) => {
  const value = 1 + seconds * 0.14 + seconds ** 2 * 0.075;
  return Number(value.toFixed(2));
};

const settleRoundState = () => {
  const now = Date.now();

  if (!round.startedAt && now - round.createdAt >= round.prepMs) {
    round.startedAt = round.createdAt + round.prepMs;
  }

  if (round.startedAt && !round.crashedAt) {
    const elapsed = (now - round.startedAt) / 1000;
    const multiplier = getMultiplierByElapsed(Math.max(elapsed, 0));
    if (multiplier >= round.crashPoint) round.crashedAt = now;
  }

  if (round.crashedAt && now - round.crashedAt >= 4500) {
    round = createRound();
  }
};

const getRoundSnapshot = () => {
  settleRoundState();
  const now = Date.now();

  if (!round.startedAt) {
    return {
      id: round.id,
      phase: 'betting',
      multiplier: 1,
      secondsToStart: Number(Math.max((round.prepMs - (now - round.createdAt)) / 1000, 0).toFixed(1))
    };
  }

  if (round.crashedAt) {
    return {
      id: round.id,
      phase: 'crashed',
      multiplier: round.crashPoint,
      crashPoint: round.crashPoint,
      secondsToNext: Number(Math.max((4500 - (now - round.crashedAt)) / 1000, 0).toFixed(1))
    };
  }

  const elapsed = Math.max((now - round.startedAt) / 1000, 0);
  return {
    id: round.id,
    phase: 'running',
    multiplier: getMultiplierByElapsed(elapsed)
  };
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
      ext === '.css' ? 'text/css; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8';
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

  if (req.method === 'GET' && url.pathname === '/api/game/round') {
    return sendJson(res, 200, getRoundSnapshot());
  }

  if (req.method === 'POST' && url.pathname === '/api/game/bet') {
    const { userId, stake, currency, roundId } = await readBody(req);
    settleRoundState();
    const user = ensureUser(userId);
    const bet = Number(stake);

    if (!user || !['ton', 'stars'].includes(currency) || !Number.isFinite(bet) || bet <= 0) {
      return sendJson(res, 400, { error: 'Некорректная ставка.' });
    }
    if (round.startedAt) return sendJson(res, 400, { error: 'Ставки на этот раунд уже закрыты.' });
    if (roundId && roundId !== round.id) return sendJson(res, 409, { error: 'Раунд уже сменился. Обновите экран.' });
    if (round.bets.has(userId)) return sendJson(res, 400, { error: 'Ставка на раунд уже сделана.' });
    if (user[currency] < bet) return sendJson(res, 400, { error: 'Недостаточно средств.' });

    user[currency] = Number((user[currency] - bet).toFixed(2));
    round.bets.set(userId, { stake: bet, currency, cashedOut: false, win: 0 });

    return sendJson(res, 200, { ok: true, roundId: round.id, balance: user });
  }

  if (req.method === 'POST' && url.pathname === '/api/game/cashout') {
    const { userId, roundId } = await readBody(req);
    settleRoundState();
    const user = ensureUser(userId);

    if (!user || !round.bets.has(userId)) return sendJson(res, 400, { error: 'Активная ставка не найдена.' });
    if (roundId && roundId !== round.id) return sendJson(res, 409, { error: 'Раунд уже завершён.' });
    if (!round.startedAt || round.crashedAt) return sendJson(res, 400, { error: 'Кэшаут недоступен в текущей фазе.' });

    const bet = round.bets.get(userId);
    if (bet.cashedOut) return sendJson(res, 400, { error: 'Ставка уже забрана.' });

    const multiplier = getMultiplierByElapsed(Math.max((Date.now() - round.startedAt) / 1000, 0));
    if (multiplier >= round.crashPoint) {
      round.crashedAt = Date.now();
      return sendJson(res, 400, { error: 'Слишком поздно, ракета уже взорвалась.' });
    }

    const win = Number((bet.stake * multiplier).toFixed(2));
    user[bet.currency] = Number((user[bet.currency] + win).toFixed(2));
    bet.cashedOut = true;
    bet.win = win;

    return sendJson(res, 200, { ok: true, win, multiplier, currency: bet.currency, balance: user });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/game/bet/')) {
    settleRoundState();
    const userId = decodeURIComponent(url.pathname.split('/').pop());
    const bet = round.bets.get(userId);
    if (!bet || bet.cashedOut) return sendJson(res, 200, { active: false, roundId: round.id });
    const snapshot = getRoundSnapshot();
    return sendJson(res, 200, {
      active: true,
      roundId: round.id,
      currency: bet.currency,
      stake: bet.stake,
      potentialWin: Number((bet.stake * snapshot.multiplier).toFixed(2))
    });
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return sendFile(res, path.join(publicDir, 'index.html'));
  if (req.method === 'GET' && (url.pathname === '/styles.css' || url.pathname === '/app.js')) return sendFile(res, path.join(publicDir, url.pathname.slice(1)));

  return sendFile(res, path.join(publicDir, 'index.html'));
});

const parsePort = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const requestedPort = parsePort(process.env.PORT, 3000);
const maxFallbackAttempts = 10;

const listenWithFallback = (port, attempt = 0) => {
  server
    .once('error', (err) => {
      if (err?.code === 'EADDRINUSE') {
        if (process.env.PORT) {
          console.error(`Port ${port} is already in use. Please choose another PORT.`);
          process.exit(1);
          return;
        }
        if (attempt >= maxFallbackAttempts) {
          console.error(`Could not find a free port in range ${requestedPort}-${requestedPort + maxFallbackAttempts}.`);
          process.exit(1);
          return;
        }
        const nextPort = port + 1;
        console.warn(`Port ${port} is busy, retrying on ${nextPort}...`);
        listenWithFallback(nextPort, attempt + 1);
        return;
      }
      console.error(err);
      process.exit(1);
    })
    .once('listening', () => console.log(`Mini app ready on http://localhost:${port}`))
    .listen(port);
};

listenWithFallback(requestedPort);
