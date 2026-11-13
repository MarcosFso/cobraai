import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { config, getToken, powerState, siteIsUp, startVm } from '../api/_azure.js';
import status from '../api/status.js';
import wake from '../api/wake.js';

const ENV = {
  AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 's',
  AZURE_SUBSCRIPTION_ID: 'sub', AZURE_RESOURCE_GROUP: 'rg', AZURE_VM_NAME: 'vm', TARGET_URL: 'https://site.example/',
};

function res() {
  return {
    code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

/** A fake Azure: `power` is the VM's power state, `calls` records what was asked. */
function fakeAzure({ power, healthy = true, failLogin = false }) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push(`${init.method ?? 'GET'} ${u}`);
    if (u.includes('login.microsoftonline.com')) return failLogin ? new Response('no', { status: 401 }) : Response.json({ access_token: 'TOKEN' });
    if (u.endsWith('/health')) return new Response('{}', { status: healthy ? 200 : 502 });
    if (u.includes('/instanceView')) return Response.json({ statuses: [{ code: 'ProvisioningState/succeeded' }, { code: `PowerState/${power}` }] });
    if (u.includes('/start?')) { power = 'starting'; return new Response(null, { status: 202 }); }
    return new Response('?', { status: 404 });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

describe('wake page backend', () => {
  let saved;
  beforeEach(() => { saved = { ...process.env }; Object.assign(process.env, ENV); });
  afterEach(() => { process.env = saved; });

  it('refuses to run without its configuration, and says what is missing', () => {
    assert.throws(() => config({}), /AZURE_TENANT_ID/);
    assert.equal(config(ENV).target, 'https://site.example');
  });

  it('reads the power state from the VM instance view', async () => {
    const azure = fakeAzure({ power: 'deallocated' });
    try {
      const cfg = config(ENV);
      assert.equal(await powerState(cfg, await getToken(cfg)), 'deallocated');
      assert.ok(azure.calls.some((c) => c.includes('/virtualMachines/vm/instanceView')));
    } finally { azure.restore(); }
  });

  it('starts a stopped machine and does not touch a running one', async () => {
    let azure = fakeAzure({ power: 'deallocated' });
    try {
      let r = res();
      await wake({ method: 'POST' }, r);
      assert.deepEqual(r.body, { state: 'starting' });
      assert.ok(azure.calls.some((c) => c.startsWith('POST') && c.includes('/start?')));
    } finally { azure.restore(); }

    azure = fakeAzure({ power: 'running' });
    try {
      const r = res();
      await wake({ method: 'POST' }, r);
      assert.deepEqual(r.body, { state: 'running' });
      assert.ok(!azure.calls.some((c) => c.includes('/start?')), 'a running VM must not be started again');
    } finally { azure.restore(); }
  });

  it('only accepts POST to wake (a crawler following a link cannot start the machine)', async () => {
    const azure = fakeAzure({ power: 'deallocated' });
    try {
      const r = res();
      await wake({ method: 'GET' }, r);
      assert.equal(r.code, 405);
      assert.ok(!azure.calls.some((c) => c.includes('/start?')));
    } finally { azure.restore(); }
  });

  it('does not start a machine that is still shutting down', async () => {
    const azure = fakeAzure({ power: 'deallocating' });
    try {
      const r = res();
      await wake({ method: 'POST' }, r);
      assert.equal(r.body.state, 'deallocating');
      assert.ok(!azure.calls.some((c) => c.includes('/start?')));
    } finally { azure.restore(); }
  });

  it('status says ready only when the machine is on AND the site answers', async () => {
    let azure = fakeAzure({ power: 'running', healthy: true });
    try { const r = res(); await status({}, r); assert.equal(r.body.ready, true); assert.equal(r.body.url, 'https://site.example'); } finally { azure.restore(); }

    azure = fakeAzure({ power: 'running', healthy: false });
    try { const r = res(); await status({}, r); assert.equal(r.body.ready, false); } finally { azure.restore(); }

    azure = fakeAzure({ power: 'deallocated' });
    try { const r = res(); await status({}, r); assert.equal(r.body.ready, false); assert.equal(r.body.state, 'deallocated'); assert.ok(!azure.calls.some((c) => c.endsWith('/health'))); } finally { azure.restore(); }
  });

  it('reports a clear error instead of leaking details when Azure refuses the login', async () => {
    const azure = fakeAzure({ power: 'running', failLogin: true });
    try {
      const r = res();
      await status({}, r);
      assert.equal(r.code, 502);
      assert.ok(!JSON.stringify(r.body).includes('401'));
    } finally { azure.restore(); }
  });

  it('answers 503 when it was never configured', async () => {
    process.env = { ...saved };
    for (const k of Object.keys(ENV)) delete process.env[k];
    const r = res();
    await status({}, r);
    assert.equal(r.code, 503);
  });

  it('siteIsUp is false when the site does not answer', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('timeout'); };
    try { assert.equal(await siteIsUp(config(ENV)), false); } finally { globalThis.fetch = original; }
  });

  it('startVm rejects an unexpected answer', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response('forbidden', { status: 403 });
    try { await assert.rejects(startVm(config(ENV), 'T'), /start failed \(403\)/); } finally { globalThis.fetch = original; }
  });
});
