const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript'),Module=require('module');
function compile(file,resolve){const m=new Module(file);m.require=resolve;m._compile(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);return m.exports;}
function resolvePlanning(s){return s==='./model'?model:s==='./focus-planner'?compile('lib/focus-planner.ts',resolvePlanning):s==='./life-planning'?compile('lib/life-planning.ts',resolvePlanning):require(s);}
const model=compile('lib/model.ts',require),{importWidgetActions}=compile('lib/widget-model.ts',resolvePlanning);
const date='2026-11-01',base={version:1,coachUrl:'',days:{[date]:{...model.newDay(date),tasks:[{id:'task',title:'Cadeau',category:'Task',done:false,priority:true,minutes:20,rollovers:1}]}}};
test('offline food actions import once, retain date and survive backup/replay',()=>{const actions=[{id:'a',date,kind:'food',text:'4 eieren'},{id:'b',date,kind:'food',text:'500 g kwark'}];const s=importWidgetActions(base,actions);assert.equal(model.getFoodEntries(s.days[date]).length,2);assert.equal(importWidgetActions(s,actions),s);assert.deepEqual(importWidgetActions(model.validateBackup(JSON.stringify(s)),actions),s);});
test('task completion is an explicit value; old replay cannot undo later app edits',()=>{const action={id:'c',date,kind:'task',taskId:'task',done:true};const s=importWidgetActions(base,[action]);assert.equal(s.days[date].tasks[0].done,true);const edited={...s,days:{...s.days,[date]:{...s.days[date],tasks:[{...s.days[date].tasks[0],done:false}]}}};assert.equal(importWidgetActions(edited,[action]),edited);assert.equal(importWidgetActions(s,[{...action,id:'d',done:false}]).days[date].tasks[0].done,false);});
test('queued food survives closed days; missing task is not recreated; invalid input ignored',()=>{const closed={...base,days:{[date]:{...base.days[date],closed:true}}};const result=importWidgetActions(closed,[{id:'x',date,kind:'food',text:'4 eieren'}]);assert.equal(result.days[date].closed,true);assert.equal(result.days[date].foodEntries.at(-1).text,'4 eieren');assert.deepEqual(result.widgetActionIds,['x']);const s=importWidgetActions(base,[{id:'y',date,kind:'task',taskId:'gone',done:true}]);assert.equal(s.days[date].tasks.length,1);assert.equal(importWidgetActions(base,[{id:'z',date:'2026-02-30',kind:'food',text:'a'}]),base);});
test('new widget tasks appear once, can be completed offline and keep their creation date',()=>{
 const actions=[{id:'new-task',date,kind:'task-add',text:'  Bel de fietsenmaker  '},{id:'complete-new-task',date,kind:'task',taskId:'widget-new-task',done:true}];
 const s=importWidgetActions(base,actions),task=s.days[date].tasks.find(t=>t.id==='widget-new-task');
 assert.equal(task.title,'Bel de fietsenmaker');assert.equal(task.category,'Task');assert.equal(task.done,true);assert.equal(task.priority,false);assert.equal(task.firstPlannedDate,date);
 assert.equal(importWidgetActions(s,actions),s);assert.deepEqual(importWidgetActions(model.validateBackup(JSON.stringify(s)),actions),s);
 const edited={...s,days:{...s.days,[date]:{...s.days[date],tasks:s.days[date].tasks.filter(t=>t.id!==task.id)}}};
 assert.equal(importWidgetActions(edited,actions),edited);
});
test('widget task creation works before a day exists and preserves queued input on closed days',()=>{
 const action={id:'first',date,kind:'task-add',text:'Nieuwe taak'};
 const s=importWidgetActions({...base,days:{}},[action]);assert.equal(s.days[date].tasks.filter(t=>t.category==='Task').length,1);
 const closed={...base,days:{[date]:{...base.days[date],closed:true}}};const result=importWidgetActions(closed,[action]);assert.equal(result.days[date].closed,true);assert.ok(result.days[date].tasks.some(t=>t.id==='widget-first'));assert.deepEqual(result.widgetActionIds,['first']);
});
test('widget task titles reject empty or oversized input and accept the 300-character limit',()=>{
 for(const text of ['', '  ', 'x'.repeat(301), null])assert.equal(importWidgetActions(base,[{id:'bad',date,kind:'task-add',text}]),base);
 const s=importWidgetActions(base,[{id:'max',date,kind:'task-add',text:'x'.repeat(300)}]);assert.equal(s.days[date].tasks.at(-1).title.length,300);
});
