import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';

let serverProcess;
let baseUrl;

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

before(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['server/dist/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), MONGODB_URI: '' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`API exited early with code ${serverProcess.exitCode}`);
    try { if ((await fetch(`${baseUrl}/health`)).ok) return; } catch { /* Wait for listener startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('API did not become ready within 10 seconds');
});

after(() => { if (serverProcess && serverProcess.exitCode === null) serverProcess.kill(); });

test('health and authentication report unavailable-database state honestly', async () => {
  const healthResponse = await fetch(`${baseUrl}/health`);
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(health.status, 'ok');
  assert.equal(health.services.mongodb, 'unavailable');

  const authStatusResponse = await fetch(`${baseUrl}/api/v1/auth/status`);
  const authStatus = await authStatusResponse.json();
  assert.equal(authStatusResponse.status, 200);
  assert.equal(authStatus.configured, false);
  assert.equal(authStatus.database, false);

  const projectsResponse = await fetch(`${baseUrl}/api/v1/projects`);
  assert.equal(projectsResponse.status, 503);
  assert.equal((await projectsResponse.json()).error.code, 'DATABASE_UNAVAILABLE');

  const createResponse = await fetch(`${baseUrl}/api/v1/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Should not persist' }),
  });
  assert.equal(createResponse.status, 503);
  assert.equal((await createResponse.json()).error.code, 'DATABASE_UNAVAILABLE');
});
