const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
function compile(name,dependency){const module=new Module(name);if(dependency)module.require=()=>dependency;module._compile(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/'+name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,name+'.cjs');return module.exports;}
const model=compile('model'),{mergeProgress,SyncConflict}=compile('sync-model',model);
const initial=()=>({version:1,coachUrl:'https://chatgpt.com/',days:{'2026-11-10':model.newDay('2026-11-10')}});
const clone=v=>JSON.parse(JSON.stringify(v));
test('independent phone checks and remote diary entries merge without loss',()=>{const base=initial(),local=clone(base),remote=clone(base);local.days['2026-11-10'].tasks[0].done=true;remote.days['2026-11-10'].diaryEntries=[{id:'entry-1',text:'Walk',done:true}];const merged=mergeProgress(base,local,remote);assert.equal(merged.days['2026-11-10'].tasks[0].done,true);assert.equal(merged.days['2026-11-10'].diaryEntries[0].text,'Walk');});
test('different edits to same text conflict and preserve both inputs',()=>{const base=initial(),local=clone(base),remote=clone(base);local.days['2026-11-10'].notes='Phone';remote.days['2026-11-10'].notes='Dashboard';assert.throws(()=>mergeProgress(base,local,remote),SyncConflict);assert.equal(local.days['2026-11-10'].notes,'Phone');assert.equal(remote.days['2026-11-10'].notes,'Dashboard');});
test('first sync into empty server preserves phone data and local preferences',()=>{const local=initial();local.darkMode=true;const empty={version:1,coachUrl:'https://chatgpt.com/',days:{}};assert.deepEqual(mergeProgress(empty,local,empty),local);});
test('simultaneous independent additions are kept and deletion conflicts with editing',()=>{const base=initial();base.days['2026-11-10'].foodEntries=[{id:'old',text:'Breakfast'}];const local=clone(base),remote=clone(base);local.days['2026-11-10'].foodEntries.push({id:'local',text:'Lunch'});remote.days['2026-11-10'].foodEntries.push({id:'remote',text:'Dinner'});assert.equal(mergeProgress(base,local,remote).days['2026-11-10'].foodEntries.length,3);local.days['2026-11-10'].foodEntries=[];remote.days['2026-11-10'].foodEntries[0].text='Edited';assert.throws(()=>mergeProgress(base,local,remote),SyncConflict);});
test('remote edits arrive when local is unchanged; edits during flight are rebased',()=>{const base=initial(),remote=clone(base);remote.days['2026-11-10'].tasks[0].done=true;const current=clone(base);current.days['2026-11-10'].notes='Typed during request';const result=mergeProgress(base,current,remote);assert.equal(result.days['2026-11-10'].tasks[0].done,true);assert.equal(result.days['2026-11-10'].notes,'Typed during request');});
test('first server connection adopts coach plan while retaining phone diary and checked habits',()=>{
 const local=initial(),remote=initial();local.days['2026-11-10'].notes='From phone';
 remote.days['2026-11-10'].tasks.push({id:'coach-task',title:'Prepare interview',category:'Task',done:false,priority:true,minutes:30,rollovers:0});
 const {firstSyncBase}=compile('sync-model',model);
 const merged=mergeProgress(firstSyncBase(local,remote),local,remote);
 assert.equal(merged.days['2026-11-10'].notes,'From phone');
 assert.ok(merged.days['2026-11-10'].tasks.some(t=>t.id==='coach-task'));
});
test('new empty phone day adopts server tasks without resurrecting legacy habits',()=>{
 const local=initial(),remote=initial();local.days['2026-11-10'].tasks=[];remote.days['2026-11-10'].tasks=[];
 remote.days['2026-11-10'].notes='Coach';
 const {firstSyncBase}=compile('sync-model',model);
 const merged=mergeProgress(firstSyncBase(local,remote),local,remote);
 assert.equal(merged.days['2026-11-10'].notes,'Coach');assert.deepEqual(merged.days['2026-11-10'].tasks,[]);
});
test('server replaces legacy plan metadata while retaining phone task progress',()=>{
 const local=initial(),remote=initial();const plan={version:1,date:'2026-11-10',generatedAt:'2026-11-10T07:00:00+01:00',tasks:[],appointments:[],startId:null,weather:'',sourceChecks:[],warnings:[]};local.days['2026-11-10'].plan={...plan,generatedAt:'2026-11-10T06:00:00+01:00'};remote.days['2026-11-10'].plan=plan;local.days['2026-11-10'].tasks[0].done=true;
 const {firstSyncBase}=compile('sync-model',model);const result=mergeProgress(firstSyncBase(local,remote),local,remote);
 assert.equal(result.days['2026-11-10'].plan.generatedAt,'2026-11-10T07:00:00+01:00');assert.equal(result.days['2026-11-10'].tasks[0].done,true);
});

test('independent application journal entries merge and stay available to day processing',()=>{
 const base=initial(),local=clone(base),remote=clone(base);
 const item={id:'role',company:'Company',role:'Role',status:'Waiting',stage:'waiting',nextAction:'Wait'};
 local.applicationJournal=[{id:'phone-change',date:'2026-11-10',updatedAt:'2026-11-10T10:00:00+01:00',item}];
 remote.applicationJournal=[{id:'server-change',date:'2026-11-10',updatedAt:'2026-11-10T10:10:00+01:00',item:{...item,id:'second'}}];
 const {sharedState}=compile('sync-model',model);
 const merged=mergeProgress(base,local,remote);
 assert.deepEqual(new Set(sharedState(merged).applicationJournal.map(u=>u.id)),new Set(['phone-change','server-change']));
});
