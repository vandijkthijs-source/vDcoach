export type Category = 'Task' | 'Habit' | 'Appointment';
export type Task = { id: string; title: string; category: Category; done: boolean; priority: boolean; minutes: number; rollovers: number };
export type Day = { date: string; tasks: Task[]; notes: string; startId: string | null; closed: boolean };
export type State = { version: 1; days: Record<string, Day>; coachUrl: string; darkMode?: boolean };
export const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
export function today() { return amsterdamToday(); }
export function newDay(date: string): Day { return { date, tasks: ['Vitamine · ochtend', 'Creatine · middag'].map((title,i) => ({ id: `habit-${i}`, title, category: 'Habit', done: false, priority: false, minutes: 0, rollovers: 0 })), notes: '', startId: null, closed: false }; }
export function getStart(day: Day) { return day.tasks.find(t => t.id === day.startId && !t.done) ?? day.tasks.find(t => t.priority && !t.done) ?? day.tasks.find(t => !t.done && t.category === 'Task'); }
export const PLAN_INSTRUCTIONS = `Return my plan as JSON in a code block using exactly this format:\n{"tasks":[{"title":"Concrete action with a clear finish","category":"Task","priority":true,"minutes":15}],"startIndex":0}\nCategories: Task, Habit, Appointment. Maximum three priorities. startIndex is the zero-based index of the next action. Include all tasks and habits, not just priorities. Do not mark anything completed unless I confirmed it. I will preview this plan in vDcoach before importing.`;
export function checkIn(day: Day, kind: 'Morning' | 'Help' | 'Evening') {
 return `${kind} check-in — ${day.date}\n\n${day.tasks.map(t => `${t.done ? '[x]' : '[ ]'} ${t.priority ? '★ ' : ''}${t.title}${t.minutes ? ` — ±${t.minutes} min` : ''} (${t.category})${t.rollovers ? ` ↻${t.rollovers}` : ''}`).join('\n')}\n\nSTART HIER: ${getStart(day)?.title ?? 'Choose the next action together.'}\n\nMy notes:\n${day.notes || '(none)'}\n\n${kind === 'Evening' ? 'Review my day and unfinished tasks. Do not update Drive until I explicitly ask to process the day. Never infer completion.\n\n' : kind === 'Help' ? 'Help me choose one concrete next action. If I am stuck, reduce it to five minutes.\n\n' : 'Help me plan today using my coaching agreements. Check the connected calendars if available; this app has not checked them.\n\n'}${PLAN_INSTRUCTIONS}`;
}
export function parsePlan(input: string): { tasks: Task[]; startId: string | null } {
 const cleaned = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
 const obj = JSON.parse(cleaned);
 if (!obj || !Array.isArray(obj.tasks) || obj.tasks.length > 100 || obj.tasks.length === 0) throw new Error('Use a JSON plan with 1–100 tasks.');
 const tasks: Task[] = obj.tasks.map((t: any) => {
  if (!t || typeof t.title !== 'string' || !t.title.trim() || t.title.length > 300) throw new Error('Each task needs a title of 1–300 characters.');
  if (!['Task','Habit','Appointment'].includes(t.category)) throw new Error('Category must be Task, Habit or Appointment.');
  if (t.priority !== undefined && typeof t.priority !== 'boolean') throw new Error('Priority must be true or false.');
  if (t.minutes !== undefined && (!Number.isInteger(t.minutes) || t.minutes < 0 || t.minutes > 1440)) throw new Error('Minutes must be a whole number from 0 to 1440.');
  return { id: id(), title: t.title.trim(), category: t.category, priority: t.priority === true, minutes: t.minutes ?? 0, done: false, rollovers: 0 };
 });
 if (tasks.filter(t=>t.priority).length > 3) throw new Error('Choose no more than three priorities.');
 if (obj.startIndex !== undefined && (!Number.isInteger(obj.startIndex) || obj.startIndex < 0 || obj.startIndex >= tasks.length)) throw new Error('startIndex must point to a task in this plan.');
 return { tasks, startId: tasks[obj.startIndex ?? 0].id };
}
export function validateBackup(raw: string): State {
 const s = JSON.parse(raw);
 if (s?.version !== 1 || !s.days || typeof s.days !== 'object' || Array.isArray(s.days) || typeof s.coachUrl !== 'string') throw new Error('This is not a vDcoach backup.');
 if(s.darkMode!==undefined&&typeof s.darkMode!=='boolean')throw new Error('Ongeldige weergavevoorkeur.');
 for (const [date,d] of Object.entries(s.days) as [string, any][]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || d.date !== date || !Array.isArray(d.tasks) || typeof d.notes !== 'string' || typeof d.closed !== 'boolean' || !(d.startId === null || typeof d.startId === 'string')) throw new Error('Invalid day in backup.');
  const ids = new Set();
  for (const t of d.tasks) {
   if (typeof t.id !== 'string' || ids.has(t.id) || typeof t.title !== 'string' || !t.title.trim() || !['Task','Habit','Appointment'].includes(t.category) || typeof t.done !== 'boolean' || typeof t.priority !== 'boolean' || !Number.isInteger(t.minutes) || t.minutes < 0 || !Number.isInteger(t.rollovers) || t.rollovers < 0) throw new Error('Invalid task in backup.');
   ids.add(t.id);
  }
  if(d.removedDiaryIds!==undefined&&(!Array.isArray(d.removedDiaryIds)||d.removedDiaryIds.some((id:unknown)=>typeof id!=='string')))throw new Error('Ongeldige verwijderde dagboekregels.');
  if(d.diaryEntries!==undefined){if(!Array.isArray(d.diaryEntries)||d.diaryEntries.some((e:DiaryEntry)=>typeof e.id!=='string'||typeof e.text!=='string'||!e.text.trim()||typeof e.done!=='boolean'||(e.appointmentId!==undefined&&typeof e.appointmentId!=='string')||(e.time!==undefined&&typeof e.time!=='string')||(e.note!==undefined&&typeof e.note!=='string'))||new Set(d.diaryEntries.map((e:DiaryEntry)=>e.id)).size!==d.diaryEntries.length)throw new Error('Ongeldig dagboek.');}
  if(d.foodEntries!==undefined){if(!Array.isArray(d.foodEntries)||d.foodEntries.some((e:FoodEntry)=>typeof e.id!=='string'||typeof e.text!=='string'||!e.text.trim())||new Set(d.foodEntries.map((e:FoodEntry)=>e.id)).size!==d.foodEntries.length)throw new Error('Ongeldige voedingslijst.');}
  if(d.foodNotes!==undefined&&typeof d.foodNotes!=='string')throw new Error('Ongeldige voedingsnotitie.');
  if(d.meals!==undefined){if(!Array.isArray(d.meals))throw new Error('Ongeldige voedingsgegevens.');for(const m of d.meals){if(typeof m.id!=='string'||typeof m.text!=='string'||typeof m.time!=='string'||typeof m.estimated!=='boolean'||['kcal','protein','carbs','fat'].some(k=>m[k]!==undefined&&(typeof m[k]!=='number'||!Number.isFinite(m[k])||m[k]<0)))throw new Error('Ongeldige voedingsgegevens.');}}
  if(d.plan!==undefined)validateMorningPlan(d.plan);
  if (d.tasks.filter((t: Task)=>t.priority).length > 3) throw new Error('Backup contains too many priorities.');
 }
 return s;
}

export type FoodEntry = {id:string;text:string};
export type Meal = {id:string; text:string; time:string; kcal?:number; protein?:number; carbs?:number; fat?:number; estimated:boolean};
export type MorningPlan = {version:1;date:string;generatedAt:string;tasks:Task[];startId:string|null;appointments:{id:string;title:string;start:string;end:string;note?:string}[];weather:string;sourceChecks:{name:string;ok:boolean;note?:string}[];warnings:string[]};
export type DailyRecord = Day & {plan?:MorningPlan;meals?:Meal[];foodNotes?:string;foodEntries?:FoodEntry[];diaryEntries?:DiaryEntry[];removedDiaryIds?:string[]};
export function amsterdamToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function validateMorningPlan(raw:unknown):MorningPlan {
 const p=raw as MorningPlan;
 if(!p||p.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.generatedAt))||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.generatedAt))!==p.date)throw Error('Ongeldige datum in dagplan.');
 if(!Array.isArray(p.tasks)||p.tasks.length>100||!Array.isArray(p.appointments)||!Array.isArray(p.sourceChecks)||!Array.isArray(p.warnings)||p.warnings.some(x=>typeof x!=='string')||typeof p.weather!=='string')throw Error('Onvolledig dagplan.');
 validateBackup(JSON.stringify({version:1,coachUrl:'',days:{[p.date]:{date:p.date,tasks:p.tasks,notes:'',startId:p.startId,closed:false}}}));
 if(p.startId!==null&&!p.tasks.some(t=>t.id===p.startId))throw Error('Starttaak ontbreekt.');
 for(const t of p.tasks)if(t.done)throw Error('Een ochtendplan mag niets automatisch afvinken.');
 for(const a of p.appointments)if(!a||typeof a.id!=='string'||typeof a.title!=='string'||!Number.isFinite(Date.parse(a.start))||!Number.isFinite(Date.parse(a.end))||Date.parse(a.end)<Date.parse(a.start)||(a.note!==undefined&&typeof a.note!=='string'))throw Error('Ongeldige afspraak.');
 for(const c of p.sourceChecks)if(!c||typeof c.name!=='string'||typeof c.ok!=='boolean'||(c.note!==undefined&&typeof c.note!=='string'))throw Error('Ongeldige broncontrole.');
 return p;
}
export function mergeMorningPlan(day:DailyRecord,plan:MorningPlan):DailyRecord {
 if(day.date!==plan.date)throw Error('Dagplan hoort bij een andere dag.');
 if(day.plan&&Date.parse(plan.generatedAt)<=Date.parse(day.plan.generatedAt))return day;
 const old=new Map(day.tasks.map(t=>[t.id,t]));
 const merged=plan.tasks.map(t=>({...t,done:old.get(t.id)?.done??false}));
 for(const t of day.tasks)if(!merged.some(v=>v.id===t.id)&&(!day.plan||!day.plan.tasks.some(v=>v.id===t.id)))merged.push({...t,priority:false});
 return {...day,tasks:merged,startId:plan.startId,plan};
}

export function migrateLegacyState(state:State):State {
 return {...state,days:Object.fromEntries(Object.entries(state.days).map(([key,day])=>{const remap=new Map<string,string>();const tasks=day.tasks.map(t=>{const n=t.category==='Habit'&&['Morning vitamins','Vitamine · ochtend'].includes(t.title)?0:t.category==='Habit'&&['Creatine','Creatine · middag'].includes(t.title)?1:-1;if(n<0)return t;remap.set(t.id,`habit-${n}`);return {...t,id:`habit-${n}`,title:n===0?'Vitamine · ochtend':'Creatine · middag'};});return [key,{...day,tasks,startId:remap.get(day.startId??'')??day.startId}];}))};
}

export function isFoodReminder(task:Task):boolean {
 return ['voeding-registreren','log-meals'].includes(task.id)||/^(log meals|voeding bijhouden|maaltijden (en hoeveelheden )?(loggen|bijhouden|vastleggen)( in voeding)?)[.!]?$/i.test(task.title.trim());
}

export function getFoodEntries(day:DailyRecord):FoodEntry[] {
 if(day.foodEntries!==undefined)return day.foodEntries;
 // Preserve previously saved free text and old meal records without duplicating them.
 const text=day.foodNotes ?? (day.meals??[]).map(m=>`${m.time} ${m.text}${m.kcal!==undefined?` · ${m.estimated?'±':''}${m.kcal} kcal`:''}${m.protein!==undefined?` · eiwit ${m.protein} g`:''}${m.carbs!==undefined?` · koolhydraten ${m.carbs} g`:''}${m.fat!==undefined?` · vet ${m.fat} g`:''}`).join('\n');
 return text.split(/\r?\n/).map(t=>t.trim()).filter(Boolean).map((text,i)=>({id:`legacy-food-${i}`,text}));
}
export function foodText(day:DailyRecord):string {
 return getFoodEntries(day).map(e=>e.text).join('\n');
}

export type DiaryEntry={id:string;text:string;done:boolean;appointmentId?:string;time?:string;note?:string};
export function getDiaryEntries(day:DailyRecord):DiaryEntry[]{
 const removed=new Set(day.removedDiaryIds??[]);
 const entries=[...(day.diaryEntries??(day.notes.trim()?[{id:'legacy-notes',text:day.notes,done:false}]:[]))].filter(e=>!removed.has(e.id));
 const clock=(s:string)=>new Date(s).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'});
 for(const a of day.plan?.appointments??[]){
  const id=`agenda-${a.id}`;if(removed.has(id))continue;const index=entries.findIndex(e=>e.id===id||e.appointmentId===a.id);
  const details={id,text:a.title,appointmentId:a.id,time:a.note?.toLowerCase().includes('hele dag')?'Hele dag':`${clock(a.start)}–${clock(a.end)}`,note:a.note};
  if(index<0)entries.push({...details,done:day.tasks.find(t=>t.id===a.id&&t.category==='Appointment')?.done??false});
  else entries[index]={...entries[index],...details};
 }
 for(const t of day.tasks.filter(t=>t.category==='Appointment'&&!day.plan?.appointments.some(a=>a.id===t.id))){
  const id=`agenda-${t.id}`;if(removed.has(id))continue;if(!entries.some(e=>e.id===id))entries.push({id,text:t.title,done:t.done,appointmentId:t.id});
 }
 return entries;
}
export function moveDiaryEntry(entries:DiaryEntry[],id:string,to:number):DiaryEntry[]{
 const from=entries.findIndex(e=>e.id===id);if(from<0)return entries;
 const result=[...entries],item=result.splice(from,1)[0];result.splice(Math.max(0,Math.min(result.length,to)),0,item);return result;
}

export function removeDiaryEntry(day:DailyRecord,entryId:string):DailyRecord {
 return {...day,diaryEntries:getDiaryEntries(day).filter(e=>e.id!==entryId),removedDiaryIds:Array.from(new Set([...(day.removedDiaryIds??[]),entryId]))};
}
