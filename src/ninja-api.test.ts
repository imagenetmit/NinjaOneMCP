import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { NinjaOneAPI } from './ninja-api.js';

type FetchCall = { url: string; options: RequestInit };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubClient(): { client: NinjaOneAPI; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: string | URL | Request, options: RequestInit = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true }),
      status: 200,
      statusText: 'OK'
    } as Response;
  }) as typeof fetch;

  const client = new NinjaOneAPI();
  (client as any).getBearerToken = async () => 'test-token';
  (client as any).baseUrl = 'https://api.example.com';
  (client as any).baseUrlExplicit = true;
  return { client, calls };
}

test('queryVolumes forwards include=bl with encoded df and pageSize', async () => {
  const { client, calls } = stubClient();
  await client.queryVolumes('id in (1,2)', undefined, 50, 'bl');

  assert.equal(calls.length, 1);
  const includeCall = calls[0];
  assert.ok(includeCall);
  const requested = new URL(includeCall.url);
  assert.equal(requested.origin + requested.pathname, 'https://api.example.com/v2/queries/volumes');
  assert.equal(requested.searchParams.get('df'), 'id in (1,2)');
  assert.equal(requested.searchParams.get('pageSize'), '50');
  assert.equal(requested.searchParams.get('include'), 'bl');
  assert.equal(requested.searchParams.has('cursor'), false);
});

test('queryVolumes omits include when it is not provided', async () => {
  const { client, calls } = stubClient();
  await client.queryVolumes('id in (1,2)', undefined, 50);

  assert.equal(calls.length, 1);
  const omittedCall = calls[0];
  assert.ok(omittedCall);
  const requested = new URL(omittedCall.url);
  assert.equal(requested.origin + requested.pathname, 'https://api.example.com/v2/queries/volumes');
  assert.equal(requested.searchParams.get('df'), 'id in (1,2)');
  assert.equal(requested.searchParams.get('pageSize'), '50');
  assert.equal(requested.searchParams.has('include'), false);
});

test('queryVolumes rejects unsupported include values', async () => {
  const { client, calls } = stubClient();
  await assert.rejects(
    () => client.queryVolumes(undefined, undefined, 50, 'recovery-keys'),
    /include supports only "bl"/
  );
  assert.equal(calls.length, 0);
});
