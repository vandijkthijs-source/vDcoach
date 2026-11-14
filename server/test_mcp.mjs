import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP client discovers tools and persists changes through the actual Python backend',async()=>{
 const root=dirname(fileURLToPath(import.meta.url)),data=await mkdtemp(join(tmpdir(),'vdcoach-mcp-'));
 const backend=spawn('/usr/bin/python3',['-c',"import sys;sys.path.insert(0,sys.argv[1]);import server;from http.server import ThreadingHTTPServer;s=ThreadingHTTPServer(('127.0.0.1',0),server.Handler);print(s.server_port,flush=True);s.serve_forever()",root],{env:{...process.env,VDCOACH_DATA:data},stdio:['ignore','pipe','inherit']});
 let transport,client;
 try{
  const port=await new Promise((resolve,reject)=>{let value='';const timer=setTimeout(()=>reject(Error('Backend startup timed out')),10000);backend.stdout.on('data',chunk=>{value+=chunk;if(value.includes('\n')){clearTimeout(timer);resolve(Number(value.trim()));}});backend.once('exit',code=>{clearTimeout(timer);reject(Error('Backend exited '+code));});});
  transport=new StdioClientTransport({command:process.execPath,args:[join(root,'mcp.mjs')],env:{...process.env,VDCOACH_URL:`http://127.0.0.1:${port}`,VDCOACH_TOKEN_FILE:join(data,'token')},stderr:'inherit'});
  client=new Client({name:'vdcoach-test',version:'1.0.0'});
  await client.connect(transport);
  const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='get_day_reviews'));assert.ok(tools.tools.some(t=>t.name==='finish_day_review'));
  assert.equal(tools.tools.find(t=>t.name==='get_day').annotations.readOnlyHint,true);
  assert.equal(tools.tools.find(t=>t.name==='add_diary').annotations.readOnlyHint,false);
  await mkdir(join(data,'library','doc1'),{recursive:true});await writeFile(join(data,'library','doc1','metadata.json'),JSON.stringify({id:'doc1',title:'Test dossier',folder:'Werk',localFile:'original.txt'}));await writeFile(join(data,'library','doc1','content.txt'),'Original history');await writeFile(join(data,'library','doc1','original.txt'),'Original history');
  let doc=await client.callTool({name:'get_document',arguments:{id:'doc1'}});assert.equal(doc.structuredContent.text,'Original history');
  let changed=await client.callTool({name:'save_document',arguments:{id:'doc1',revision:doc.structuredContent.revision,text:'Original history\nConfirmed update'}});assert.equal(changed.structuredContent.text,'Original history\nConfirmed update');
  let conflict=await client.callTool({name:'save_document',arguments:{id:'doc1',revision:doc.structuredContent.revision,text:'Stale overwrite'}});assert.equal(conflict.isError,true);
  const found=await client.callTool({name:'list_documents',arguments:{query:'Confirmed'}});assert.equal(found.structuredContent.documents.length,1);
  let result=await client.callTool({name:'get_day',arguments:{date:'2026-11-10'}});assert.equal(result.structuredContent.day,null);
  result=await client.callTool({name:'add_diary',arguments:{date:'2026-11-10',revision:0,id:'walk-1',text:'Walked 40 minutes',done:true}});assert.equal(result.structuredContent.revision,1);
  result=await client.callTool({name:'add_food',arguments:{date:'2026-11-10',revision:0,id:'meal-1',text:'Yoghurt'}});assert.equal(result.isError,true);
  result=await client.callTool({name:'add_food',arguments:{date:'2026-11-10',revision:1,id:'meal-1',text:'Yoghurt'}});assert.equal(result.structuredContent.revision,2);
  result=await client.callTool({name:'add_food',arguments:{date:'2026-11-10',revision:2,id:'meal-1',text:'Yoghurt'}});assert.equal(result.structuredContent.revision,2);
  result=await client.callTool({name:'get_day',arguments:{date:'2026-11-10'}});assert.equal(result.structuredContent.day.diaryEntries[0].text,'Walked 40 minutes');assert.equal(result.structuredContent.day.foodEntries.length,1);
  const context=await client.callTool({name:'get_coach_context',arguments:{date:'2026-11-10'}});assert.equal(context.structuredContent.serverVersion,'2.0.0');assert.equal(context.structuredContent.director.engineVersion,'2.0.0');
  const queue=await client.callTool({name:'get_day_reviews',arguments:{}});assert.equal(queue.structuredContent.pending.length,1);const pending=queue.structuredContent.pending[0];
  const reviewArgs={date:pending.date,inputHash:pending.inputHash,summary:'Bevestigd: wandeling geregistreerd. Invoer behouden.'};
  const review=await client.callTool({name:'finish_day_review',arguments:reviewArgs});assert.equal(review.isError,undefined);
  const retry=await client.callTool({name:'finish_day_review',arguments:reviewArgs});assert.deepEqual(retry.structuredContent,review.structuredContent);
  const after=await client.callTool({name:'get_day_reviews',arguments:{}});assert.equal(after.structuredContent.pending.length,0);assert.equal(after.structuredContent.completed.length,1);
  const preserved=await client.callTool({name:'get_day',arguments:{date:'2026-11-10'}});assert.equal(preserved.structuredContent.day.foodEntries[0].text,'Yoghurt');assert.equal(preserved.structuredContent.day.diaryEntries[0].done,true);

 }finally{
  if(client)await client.close();else if(transport)await transport.close();
  backend.kill();await new Promise(resolve=>{if(backend.exitCode!==null)resolve();else backend.once('exit',resolve);});
  await rm(data,{recursive:true,force:true});
 }
});
