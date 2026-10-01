import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NinjaOneAPI } from './ninja-api.js';

test('managed requests retain each user token concurrently, including multipart writes', async () => {
  const previous = globalThis.fetch;
  const calls: Array<{ url: string; token: string }> = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), token: (options?.headers as Record<string, string>).Authorization! });
    await new Promise(resolve => setTimeout(resolve, 1));
    return new Response('{}', { status: 200 });
  };
  try {
    const a = new NinjaOneAPI({ accessToken: 'user-a', baseUrl: 'https://app.ninjarmm.com' });
    const b = new NinjaOneAPI({ accessToken: 'user-b', baseUrl: 'https://app.ninjarmm.com' });
    await Promise.all([a.getDevice(1), b.getDevice(2), a.addTicketComment(3, 'a'), b.addTicketComment(4, 'b')]);
    assert.deepEqual(calls.map(c => c.token), ['Bearer user-a', 'Bearer user-b', 'Bearer user-a', 'Bearer user-b']);
    assert.ok(calls.every(c => !c.url.includes('/oauth/')));
    assert.throws(() => a.setRegion('eu'), /cannot be changed/);
    globalThis.fetch = async () => new Response('secret upstream details', { status: 401 });
    await assert.rejects(a.getDevice(1), /^Error: Reconnect NinjaOne$/);
    await assert.rejects(a.addTicketComment(1, 'x'), /^Error: Reconnect NinjaOne$/);
    globalThis.fetch = async () => new Response('<html>unexpected response</html>', { status: 200 });
    await assert.rejects(a.getDevice(1), /upstream outcome unknown/);
    await assert.rejects(a.addTicketComment(1, 'x'), /upstream outcome unknown/);
  } finally { globalThis.fetch = previous; }
});

test('managed tokens cannot be sent to arbitrary hosts', () => {
  for (const baseUrl of ['http://app.ninjarmm.com', 'https://attacker.test', 'https://app.ninjarmm.com/x']) {
    assert.throws(() => new NinjaOneAPI({ accessToken: 'token', baseUrl }));
  }
});
