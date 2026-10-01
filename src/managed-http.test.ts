import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {createManagedHttpServer} from './transport/managed-http.js';
import {NinjaOneMCPServer} from './index.js';
import {NinjaOneAPI} from './ninja-api.js';

test('Streamable HTTP uses a fresh principal for each request and denies unbound requests', async () => {
  const fetchClient=globalThis.fetch;
  const accounts:string[]=[];
  globalThis.fetch=async (_url,options)=>{
    const who=(options?.headers as Record<string,string>).Authorization;
    assert.ok(who); accounts.push(who); await new Promise(resolve=>setTimeout(resolve,5));
    return new Response(JSON.stringify([{id:1,name:who}]),{status:200});
  };
  const app=createManagedHttpServer(token=>new NinjaOneMCPServer(new NinjaOneAPI({accessToken:token,baseUrl:'https://app.ninjarmm.com'})));
  app.listen(0,'127.0.0.1'); await once(app,'listening');
  const port=(app.address() as {port:number}).port;
  const request=(token:string,method:string,params:object={})=>fetchClient(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','X-Ninja-Access-Token':token},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  try {
    assert.equal((await request('','tools/list')).status,401);
    const init=await request('user-a','initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}});
    assert.equal(init.status,200);
    const tools=await (await request('user-a','tools/list')).json() as any;
    assert.ok(tools.result.tools.length>10);
    assert.ok(!tools.result.tools.some((t:any)=>t.name==='set_region'));
    const results=await Promise.all(['user-a','user-b'].map(async token=>{
      const response=await request(token,'tools/call',{name:'get_organizations',arguments:{}});
      assert.equal(response.status,200);return response.text();
    }));
    assert.ok(results[0] && results[1]);
    assert.ok(results[0].includes('Bearer user-a')&&!results[0].includes('Bearer user-b'));
    assert.ok(results[1].includes('Bearer user-b')&&!results[1].includes('Bearer user-a'));
    assert.deepEqual(accounts.sort(),['Bearer user-a','Bearer user-b']);
  } finally { globalThis.fetch=fetchClient;app.closeAllConnections();await new Promise<void>(resolve=>app.close(()=>resolve())); }
});
