import {DailyRecord,DiaryEntry,State,Task,getDiaryEntries,id,newDay,today} from './model';
export type FocusSlot={id:string;taskId:string;title:string;startTime:string;endTime:string;minutes:number};
export type FocusChoice={id:string;until:number};
export type FocusPlan={date:string;generatedAt:number;focus?:{task:Task;reason:string;blockMinutes:number;remainingMinutes:number;estimated:boolean};next:(Task&{remainingMinutes:number})[];appointment?:DiaryEntry;busy?:DiaryEntry;availableMinutes:number;slots:FocusSlot[];overflow:number;message:string};
const minutes=(value?:string)=>/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(value??'')?Number(value!.slice(0,2))*60+Number(value!.slice(3,5)):undefined;
export const clock=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
export function focusPlan(state:State,date=today(),now=new Date()):FocusPlan{
 const day=(state.days[date]??newDay(date)) as DailyRecord;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const localDate=`${parts.year}-${parts.month}-${parts.day}`,start=localDate===date?Number(parts.hour)*60+Number(parts.minute):8*60,end=minutes(state.planningEnd??'22:00')??22*60;
 const entries=getDiaryEntries(day);const intervals=entries.filter(e=>!e.allDay&&!e.done&&minutes(e.startTime)!==undefined&&minutes(e.endTime)!==undefined).map(e=>({entry:e,start:minutes(e.startTime)!,end:minutes(e.endTime)!})).filter(e=>e.end>start&&e.end>e.start).sort((a,b)=>a.start-b.start);
 const appointment=intervals.find(i=>i.entry.appointmentId)?.entry,busy=intervals.find(i=>!i.entry.taskId&&i.start<=start&&i.end>start)?.entry;
 const owned=intervals.find(i=>i.entry.taskId&&i.start<=start&&i.end>start&&day.tasks.some(t=>t.id===i.entry.taskId&&!t.done));
 const fixed=intervals.filter(i=>!i.entry.id.startsWith('focus-plan-'));
 const gaps:{start:number;end:number}[]=[];let cursor=Math.max(6*60,start);
 for(const i of fixed){if(i.start>cursor)gaps.push({start:cursor,end:Math.min(i.start-5,end)});cursor=Math.max(cursor,i.end);if(cursor>=end)break;}
 if(cursor<end)gaps.push({start:cursor,end});const free=gaps.filter(g=>g.end-g.start>=10);
 const choices=(day as any).focusChoices as FocusChoice[]|undefined;
 const tasks=day.tasks.filter(t=>t.category==='Task'&&!t.done&&t.status!=='parked'&&(t.status!=='waiting'||!!t.waitingUntil&&t.waitingUntil<=date)&&!choices?.some(c=>c.id===t.id&&c.until>now.getTime()));
 const deadline=(t:Task)=>t.dueDate??state.projects?.find(p=>p.id===t.projectId)?.deadline;
 const tomorrow=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const rank=(t:Task)=>deadline(t)&&deadline(t)!<=date?0:deadline(t)===tomorrow?10:t.priority?20:30;
 const ranked=[...tasks].sort((a,b)=>rank(a)-rank(b)||(deadline(a)??'9999').localeCompare(deadline(b)??'9999')||b.rollovers-a.rollovers);
 const spent=(t:Task)=>entries.filter(e=>e.taskId===t.id&&e.done).reduce((sum,e)=>sum+(e.focusSeconds??0)/60,0);
 const remaining=(t:Task)=>Math.max(0,Math.ceil((t.minutes||25)-spent(t)));
 const target=(day as any).energy==='low'?25:(day as any).energy==='high'?60:45;
 const slots:FocusSlot[]=[];const windows=free.map(g=>({...g}));
 for(const task of ranked.slice(0,3)){const gap=windows.find(g=>g.end-g.start>=10);if(!gap)break;const block=Math.min(target,(remaining(task)>0?remaining(task):10),gap.end-gap.start);slots.push({id:'focus-plan-'+task.id+(entries.filter(e=>e.taskId===task.id&&e.done&&e.id.startsWith('focus-plan-')).length?'_'+entries.filter(e=>e.taskId===task.id&&e.done&&e.id.startsWith('focus-plan-')).length:''),taskId:task.id,title:task.shortTitle||task.title,startTime:clock(gap.start),endTime:clock(gap.start+block),minutes:block});gap.start+=block+5;}
 const selected=ranked.find(t=>t.id===owned?.entry.taskId)??ranked[0],first=free.find(g=>g.start===start||g.start<=start+1);const available=owned&&!busy&&ranked.some(t=>t.id===owned.entry.taskId)?owned.end-start:first?first.end-start:0;
 let focus:FocusPlan['focus'];
 if(selected&&!busy&&!day.closed&&available>=10&&localDate===date){const due=deadline(selected);focus={task:selected,reason:remaining(selected)===0?'Je hebt de geschatte tijd besteed. Controleer of de taak klaar is.':due&&due<=date?'Deadline vandaag of verstreken.':due===tomorrow?'Morgen belangrijk.':selected.priority?'Een van je prioriteiten vandaag.':selected.rollovers>=3?'Al vaker doorgeschoven. Kies bewust een stap.':'Een concrete volgende stap.',blockMinutes:Math.min(target,(remaining(selected)>0?remaining(selected):10),available),remainingMinutes:remaining(selected),estimated:!selected.minutes};}
 const total=ranked.reduce((sum,t)=>sum+remaining(t),0),capacity=free.reduce((sum,g)=>sum+g.end-g.start,0);
 const message=day.closed?'Dag afgesloten. Je voortgang is bewaard.':busy?'Er staat nu iets gepland.':!ranked.length?(day.tasks.some(t=>t.category==='Task'&&!t.done)?'Geen uitvoerbare taak klaar. Je open taken blijven onder Wachten, Later of tijdelijk opzijgezet bewaard.':day.tasks.some(t=>t.category==='Task')?'Taken afgerond. Ruimte voor de rest van je dag.':'Nog geen taken. Voeg bewust een volgende stap toe.'):start>=end?'De dag loopt af. Bekijk wat je wilt bewaren of verplaatsen.':available<10?'Nu geen rustig werkblok. Bekijk wat hierna past.':total>capacity?'Je open werk past niet helemaal in de resterende ruimte.':'Een haalbare volgende stap, met ruimte om bij te sturen.';
 return {date,generatedAt:now.getTime(),focus,next:ranked.filter(t=>t.id!==focus?.task.id).slice(0,2).map(t=>({...t,remainingMinutes:remaining(t)})),appointment,busy,availableMinutes:available,slots,overflow:Math.max(0,total-capacity),message};
}
export function acceptFocusPlan(state:State,date:string,slots:FocusSlot[],checkConflicts=true):State{
 const day=state.days[date] as DailyRecord|undefined;if(!day||day.closed)return state;
 const occupied=getDiaryEntries(day).filter(e=>!e.done&&!e.allDay&&!e.id.startsWith('focus-plan-')&&minutes(e.startTime)!==undefined&&minutes(e.endTime)!==undefined);
 const valid=slots.filter(s=>(!checkConflicts||!occupied.some(e=>minutes(s.startTime)!<minutes(e.endTime)!&&minutes(s.endTime)!>minutes(e.startTime)!))&&(!checkConflicts||day.tasks.some(t=>t.id===s.taskId&&!t.done))&&minutes(s.startTime)!==undefined&&minutes(s.endTime)!==undefined&&minutes(s.endTime)!>minutes(s.startTime)!);
 if(valid.length!==slots.length)throw Error('Je plan is veranderd. Maak een nieuw voorstel; je taken zijn behouden.');
 const existing=getDiaryEntries(day);const ids=new Set(valid.map(s=>s.id));
 const entries=[...existing.filter(e=>!ids.has(e.id)||e.done),...valid.filter(s=>!existing.some(e=>e.id===s.id&&e.done)).map(s=>({id:s.id,taskId:s.taskId,text:s.title,startTime:s.startTime,endTime:s.endTime,time:s.startTime+'–'+s.endTime,done:false,edited:true,note:'Door jou bevestigd focusblok; taak nog niet afgerond.'}))];
 const updated:DailyRecord={...day,diaryEntries:entries};return {...state,days:{...state.days,[date]:updated}};
}
