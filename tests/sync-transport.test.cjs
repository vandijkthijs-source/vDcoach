const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
function compile(name,deps={}){const m=new Module(name);m.require=k=>{if(k in deps)return deps[k];return require(k);};m._compile(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/'+name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,name+'.cjs');return m.exports;}
const model=compile('model'),merging=compile('sync-model',{'./model':model});
const empty=()=>({version:1,coachUrl:'https://chatgpt.com/',days:{}});
function harness(){const saved=new Map();const storage={getItem:async k=>saved.get(k)||null,setItem:async(k,v)=>saved.set(k,v)};const sync=compile('sync',{'@react-native-async-storage/async-storage':{default:storage},'./server-connection':{loadServerConnection:async()=>({url:'http://server:2285',token:'test'})},'./model':model,'./day-lifecycle':{closePastDays:s=>s},'./sync-model':merging});return {sync,saved};}
test('server plan arrives without separate plan fetch and edits round-trip with revision',async()=>{
 const {sync}=harness(),remote=empty();remote.days['2026-11-10']={...model.newDay('2026-11-10'),tasks:[],notes:'Server plan'};
 const original=global.fetch,calls=[];
 try{global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({revision:4,state:options.body?JSON.parse(options.body).state:remote})};};
 const first=await sync.syncProgress(empty());assert.deepEqual(first.state,remote);assert.equal(calls.length,1);await sync.acknowledgeSync(first.url,first.state);
 const local=structuredClone(first.state);local.days['2026-11-10'].diaryEntries=[{id:'walk',text:'Walked',done:true}];
 const result=await sync.syncProgress(local);assert.equal(result.state.days['2026-11-10'].diaryEntries[0].text,'Walked');
 assert.equal(JSON.parse(calls[2].options.body).revision,4);assert.ok(calls.every(c=>c.url.endsWith('/state')));
 }finally{global.fetch=original;}
});
test('rejected write retains unacknowledged local data and merge base',async()=>{
 const {sync,saved}=harness(),original=global.fetch,local=empty();local.days['2026-11-10']=model.newDay('2026-11-10');
 try{global.fetch=async(_url,options)=>options.body?{ok:false,status:409}:{ok:true,json:async()=>({revision:3,state:empty()})};
 await assert.rejects(sync.syncProgress(local),/net gewijzigd/);assert.equal(saved.size,0);assert.ok(local.days['2026-11-10']);
 }finally{global.fetch=original;}
});
