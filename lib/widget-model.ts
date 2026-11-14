import {moveTask} from './life-planning';
import {acceptFocusPlan,FocusSlot} from './focus-planner';
import {State,DailyRecord,newDay,getFoodEntries,getDiaryEntries} from './model';
export type WidgetAction={id:string;date:string;kind:'food'|'task'|'task-add'|'diary-done'|'focus-skip'|'check-in'|'plan-accept'|'task-move';target?:string;createdAt?:number;until?:number;energy?:'low'|'normal'|'high';slots?:FocusSlot[];text?:string;taskId?:string;done?:boolean};
export function importWidgetActions(state:State,actions:WidgetAction[]):State {
 let next=state;const seen=new Set(state.widgetActionIds??[]);
 for(const action of actions){
  if(!action||typeof action.id!=='string'||!action.id||seen.has(action.id)||typeof action.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(action.date)||!Number.isFinite(Date.parse(action.date+'T00:00:00Z'))||new Date(action.date+'T00:00:00Z').toISOString().slice(0,10)!==action.date)continue;
  if(!['food','task','task-add','diary-done','focus-skip','check-in','plan-accept','task-move'].includes(action.kind))continue;
  if(action.kind==='food'&&(typeof action.text!=='string'||!action.text.trim()||action.text.length>2000))continue;
  if(action.kind==='task-add'&&(typeof action.text!=='string'||!action.text.trim()||action.text.length>300))continue;
  if((action.kind==='task'||action.kind==='diary-done')&&(typeof action.taskId!=='string'||typeof action.done!=='boolean'))continue;
  if(action.kind==='focus-skip'&&(typeof action.taskId!=='string'||typeof action.until!=='number'||!Number.isFinite(action.until)))continue;
  if(action.kind==='check-in'&&!['low','normal','high'].includes(action.energy??''))continue;
  if(action.kind==='plan-accept'&&(!Array.isArray(action.slots)||action.slots.length>3||new Set(action.slots.map(s=>s.id)).size!==action.slots.length||action.slots.some(s=>!s||typeof s.id!=='string'||typeof s.taskId!=='string'||typeof s.title!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.startTime)||!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(s.endTime)||s.endTime<=s.startTime)))continue;
  if(action.kind==='task-move'&&(typeof action.taskId!=='string'||!(action.target==='tomorrow'||action.target==='backlog'||/^\d{4}-\d{2}-\d{2}$/.test(action.target??''))))continue;
  seen.add(action.id);let day=(next.days[action.date]??newDay(action.date)) as DailyRecord;
  { // Queued explicit input may arrive after midnight; retain it on the closed day.
   if(action.kind==='task-move'){try{const target=action.target==='tomorrow'?new Date(Date.parse(action.date+'T12:00:00Z')+86400000).toISOString().slice(0,10):action.target!;const closed=day.closed;const source=closed?{...next,days:{...next.days,[action.date]:{...day,closed:false}}}:next;next=moveTask(source,action.date,action.taskId!,target);day={...next.days[action.date],closed} as DailyRecord;}catch{/* Keep the original task if its destination is no longer available. */}}
   else if(action.kind==='plan-accept'){const closed=day.closed;next=acceptFocusPlan({...next,days:{...next.days,[action.date]:{...day,closed:false}}},action.date,action.slots!,false);day={...next.days[action.date],closed} as DailyRecord;}
   else if(action.kind==='check-in')day={...day,energy:action.energy};
   else if(action.kind==='focus-skip')day={...day,focusChoices:[...(day.focusChoices??[]).filter(c=>c.id!==action.taskId),{id:action.taskId!,until:action.until!}]};
   else if(action.kind==='food'){const entries=getFoodEntries(day);day={...day,foodEntries:entries.some(e=>e.id==='widget-'+action.id)?entries:[...entries,{id:'widget-'+action.id,text:action.text!.trim()}]};}
   else if(action.kind==='task-add'){
    const taskId='widget-'+action.id;
    if(!day.tasks.some(t=>t.id===taskId))day={...day,tasks:[...day.tasks,{id:taskId,title:action.text!.trim(),category:'Task',done:false,priority:false,minutes:0,rollovers:0,firstPlannedDate:action.date}]};
   }
   else if(action.kind==='diary-done')day={...day,diaryEntries:getDiaryEntries(day).map(e=>e.id===action.taskId?{...e,done:action.done!}:e)};
   else day={...day,tasks:day.tasks.map(t=>t.id===action.taskId?{...t,done:action.done!}:t)};
   next={...next,days:{...next.days,[action.date]:day}};
  }
  next={...next,widgetActionIds:Array.from(seen).slice(-2000)};
 }
 return next;
}
