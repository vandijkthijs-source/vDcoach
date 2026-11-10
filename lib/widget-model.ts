import {State,DailyRecord,newDay,getFoodEntries} from './model';
export type WidgetAction={id:string;date:string;kind:'food'|'task'|'task-add';text?:string;taskId?:string;done?:boolean};
export function importWidgetActions(state:State,actions:WidgetAction[]):State {
 let next=state;const seen=new Set(state.widgetActionIds??[]);
 for(const action of actions){
  if(!action||typeof action.id!=='string'||!action.id||seen.has(action.id)||typeof action.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(action.date)||!Number.isFinite(Date.parse(action.date+'T00:00:00Z'))||new Date(action.date+'T00:00:00Z').toISOString().slice(0,10)!==action.date)continue;
  if(action.kind!=='food'&&action.kind!=='task'&&action.kind!=='task-add')continue;
  if(action.kind==='food'&&(typeof action.text!=='string'||!action.text.trim()||action.text.length>2000))continue;
  if(action.kind==='task-add'&&(typeof action.text!=='string'||!action.text.trim()||action.text.length>300))continue;
  if(action.kind==='task'&&(typeof action.taskId!=='string'||typeof action.done!=='boolean'))continue;
  seen.add(action.id);let day=(next.days[action.date]??newDay(action.date)) as DailyRecord;
  { // Queued explicit input may arrive after midnight; retain it on the closed day.
   if(action.kind==='food'){const entries=getFoodEntries(day);day={...day,foodEntries:entries.some(e=>e.id==='widget-'+action.id)?entries:[...entries,{id:'widget-'+action.id,text:action.text!.trim()}]};}
   else if(action.kind==='task-add'){
    const taskId='widget-'+action.id;
    if(!day.tasks.some(t=>t.id===taskId))day={...day,tasks:[...day.tasks,{id:taskId,title:action.text!.trim(),category:'Task',done:false,priority:false,minutes:0,rollovers:0,firstPlannedDate:action.date}]};
   }
   else day={...day,tasks:day.tasks.map(t=>t.id===action.taskId?{...t,done:action.done!}:t)};
   next={...next,days:{...next.days,[action.date]:day}};
  }
  next={...next,widgetActionIds:Array.from(seen).slice(-2000)};
 }
 return next;
}
