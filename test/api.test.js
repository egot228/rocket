import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 3199;
const base = `http://127.0.0.1:${port}`;
let server;

const waitServer = () =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server start timeout')), 8000);
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Mini app ready')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

test.before(async () => {
  server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port) }
  });
  await waitServer();
});

test.after(() => {
  if (server) server.kill('SIGTERM');
});

test('topup and admin grant flows work', async () => {
  const topup = await fetch(`${base}/api/topup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'u-test', currency: 'ton', amount: 5 })
  });
  assert.equal(topup.status, 200);

  const grant = await fetch(`${base}/api/admin/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminKey: 'super-admin-key', userId: 'u-test', stars: 50 })
  });
  assert.equal(grant.status, 200);

  const user = await fetch(`${base}/api/users/u-test`);
  const data = await user.json();
  assert.equal(data.ton, 5);
  assert.equal(data.stars, 50);
});
