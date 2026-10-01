/** Private runner transport. Credentials are supplied by the authenticated gateway. */
import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

type Backend = { connect(transport: Transport): Promise<void>; close(): Promise<void> };

export function createManagedHttpServer(factory: (token: string) => Backend) {
  return createServer({ maxHeaderSize: 32768, requestTimeout: 60000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"healthy":true}');
      return;
    }
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    const token = req.headers['x-ninja-access-token'];
    if (typeof token !== 'string' || token.length > 16384 || !token || /[\s\x00-\x1f]/.test(token)) {
      res.writeHead(401).end();
      return;
    }
    let backend: Backend | undefined;
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) { res.writeHead(413).end(); return; }
        chunks.push(Buffer.from(chunk));
      }
      let payload: unknown;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { res.writeHead(400).end(); return; }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { res.writeHead(400).end(); return; }
      backend = factory(token);
      res.on('close', () => { void transport.close(); void backend?.close(); });
      await backend.connect(transport as unknown as Transport);
      await transport.handleRequest(req, res, payload);
    } catch {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }).end('{"error":"NinjaOne request unavailable"}');
      else res.end();
      await transport.close();
      await backend?.close();
    }
  });
}
