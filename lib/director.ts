import {State,Task,DailyRecord,newDay,getDiaryEntries} from './model';
export const AREAS=['Werk','Thuis','Gezondheid','Voeding','Sociaal','Ontwikkeling'] as const;
export function taskStatus(t:Task,day?:DailyRecord){return t.done?'done':t.status==='parked'?'parked':t.status==='waiting'?'waiting':day&&getDiaryEntries(day).some(e=>e.taskId===t.id&&!e.done)?'planned':'todo';}
export function actionable(t:Task,date:string){return !t.done&&t.status!=='parked'&&(t.status!=='waiting'||!!t.waitingUntil&&t.waitingUntil<=date);}
export function firstStep(t:Task):string {return t.firstStep?.trim()||`Open wat je nodig hebt voor “${t.shortTitle||t.title}”. Schrijf één concrete vervolgstap op en begin daar vijf minuten mee.`;}
export type Decision={key:string;sourceDate:string;task:Task;reason:string};
export function decisionInbox(state:State,date:string):Decision[]{
 const current=state.days[date]??newDay(date),active=new Set([...Object.entries(state.days).filter(([d])=>d>=date).flatMap(([,v])=>v.tasks),...(state.backlogTasks??[])].map(t=>t.id)),seen=new Set<string>(),out:Decision[]=[];
 for(const [d,record] of Object.entries(state.days).sort(([a],[b])=>b.localeCompare(a))) {
  if(d>=date||!record.closed)continue;
  for(const removed of record.removedTaskIds??[])seen.add(removed);
  for(const t of record.tasks){if(seen.has(t.id))continue;seen.add(t.id);if(t.category!=='Task'||t.done||t.status==='parked'||active.has(t.id)||record.removedTaskIds?.includes(t.id))continue;seen.add(t.id);out.push({key:d+':'+t.id,sourceDate:d,task:t,reason:t.dueDate&&t.dueDate<=date?'Deadline vraagt aandacht':t.status==='waiting'?'Wachten: controleer of er nieuws is':t.rollovers>=3?'Al vaker uitgesteld':'Nog open uit '+d});}
 }
 return out;
}
// An explicit decision never rewrites the historical day. The same ID links both versions.
export function decideTask(state:State,sourceDate:string,taskId:string,date:string,target:'today'|'backlog'):State {
 const task=state.days[sourceDate]?.tasks.find(t=>t.id===taskId);if(!task||task.done||sourceDate>=date||state.days[date]?.closed)return state;
 const all=Object.entries(state.days).some(([d,v])=>d>sourceDate&&v.tasks.some(t=>t.id===taskId))||(state.backlogTasks??[]).some(t=>t.id===taskId);if(all)return state;
 const next={...task,done:false,priority:false,status:target==='backlog'?'parked' as const:'todo' as const,rollovers:task.rollovers+1,firstPlannedDate:task.firstPlannedDate??sourceDate};
 return target==='backlog'?{...state,backlogTasks:[...(state.backlogTasks??[]),next]}:{...state,days:{...state.days,[date]:{...(state.days[date]??newDay(date)),tasks:[...(state.days[date]??newDay(date)).tasks,next]}}};
}
export function dayFacts(state:State,date:string){const day=(state.days[date]??newDay(date)) as DailyRecord,tasks=day.tasks.filter(t=>t.category==='Task'),entries=getDiaryEntries(day),actual=entries.filter(e=>e.done),open=tasks.filter(t=>!t.done);return {done:tasks.filter(t=>t.done).length,open:open.length,waiting:open.filter(t=>t.status==='waiting').length,parked:open.filter(t=>t.status==='parked').length,focusMinutes:Math.round(actual.reduce((n,e)=>n+(e.focusSeconds??0),0)/60),activities:actual.length,habitsDone:day.tasks.filter(t=>t.category==='Habit'&&t.done).length,habits:day.tasks.filter(t=>t.category==='Habit').length};}
export function lifeSignals(state:State,date:string){const days=Object.entries(state.days).filter(([d])=>d<=date&&Date.parse(date)-Date.parse(d)<7*86400000);const facts=days.map(([d])=>dayFacts(state,d));return {days:days.length,completed: facts.reduce((n,f)=>n+f.done,0),focusMinutes:facts.reduce((n,f)=>n+f.focusMinutes,0),repeated:(state.days[date]?.tasks??[]).filter(t=>!t.done&&t.rollovers>=3).length};}
