import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NinjaOneMCPServer, TOOLS } from './index.js';

test('query_volumes schema exposes optional include enum bl only', () => {
  const tool = TOOLS.find((entry) => entry.name === 'query_volumes');
  assert.ok(tool, 'query_volumes must remain a registered MCP tool');
  const include = tool.inputSchema.properties.include;
  assert.deepEqual(include, {
    type: 'string',
    enum: ['bl'],
    description: 'Include BitLocker status.'
  });
  assert.equal(Array.isArray(tool.inputSchema.required), false);
});

test('query_volumes dispatch forwards include to queryVolumes', async () => {
  const server = new NinjaOneMCPServer();
  const calls: unknown[][] = [];
  (server as any).api.queryVolumes = async (...args: unknown[]) => {
    calls.push(args);
    return { results: [] };
  };

  await (server as any).routeToolCall('query_volumes', {
    df: 'id in (1,2)',
    pageSize: 25,
    include: 'bl'
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['id in (1,2)', undefined, 25, 'bl']);
});

test('query_volumes dispatch omits include when the argument is absent', async () => {
  const server = new NinjaOneMCPServer();
  const calls: unknown[][] = [];
  (server as any).api.queryVolumes = async (...args: unknown[]) => {
    calls.push(args);
    return { results: [] };
  };

  await (server as any).routeToolCall('query_volumes', { df: 'id in (3)' });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['id in (3)', undefined, 50, undefined]);
});
