import {DailyRecord,DiaryEntry,State,getDiaryEntries,newDay} from './model';
export type TimedActivity={id:string;title:string;startedAt:number;stoppedAt?:number};
export type TimerSnapshot={active:TimedActivity|null;completed:TimedActivity[]};
const parts=(stamp:number)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));
const localDate=(stamp:number)=>{const p=parts(stamp);return `${p.year}-${p.month}-${p.day}`;};
export function elapsedLabel(milliseconds:number){const seconds=Math.max(0,Math.floor(milliseconds/1000));return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
const label=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export function timerEntries(activity:TimedActivity):{date:string;entry:DiaryEntry}[]{
 const {startedAt,stoppedAt}=activity;
 if(!activity.id||!activity.title?.trim()||!Number.isFinite(startedAt)||!Number.isFinite(stoppedAt)||stoppedAt!<=startedAt||stoppedAt!-startedAt>366*86400000)throw Error('Ongeldige timerregistratie.');
 const result:{date:string;entry:DiaryEntry}[]=[];let cursor=startedAt;
 while(cursor<stoppedAt!){const date=localDate(cursor);let end=stoppedAt!;
  if(localDate(end)!==date){let low=cursor,high=Math.min(end,cursor+27*3600000);while(high-low>1){const middle=Math.floor((low+high)/2);if(localDate(middle)===date)low=middle;else high=middle;}end=high;}
  const from=parts(cursor),to=parts(end);const startMinute=Number(from.hour)*60+Number(from.minute);const endMinute=localDate(end)!==date?1440:Math.min(1440,Math.max(startMinute+1,Number(to.hour)*60+Number(to.minute)+(Number(to.second)>0||end%1000>0?1:0)));
  result.push({date,entry:{id:`timer-${activity.id}-${date}`,text:activity.title.trim(),done:true,edited:true,startTime:label(startMinute),endTime:label(endMinute),time:`${label(startMinute)}–${label(endMinute)}`,note:`Timer · ${elapsedLabel(end-cursor)} · ${new Date(cursor).toISOString()} – ${new Date(end).toISOString()}`}});cursor=end;
 }
 return result;
}
export function importTimedActivities(state:State,activities:TimedActivity[]):State{
 let days:Record<string,DailyRecord>=state.days;let changed=false;
 for(const activity of activities)for(const {date,entry} of timerEntries(activity)){const day=(days[date]??newDay(date)) as DailyRecord;const entries=getDiaryEntries(day);if(entries.some(e=>e.id===entry.id)||day.removedDiaryIds?.includes(entry.id))continue;if(!changed){days={...days};changed=true;}days[date]={...day,diaryEntries:[...entries,entry]};}
 return changed?{...state,days}:state;
}
export function importedTimerIds(state:State,activities:TimedActivity[]):string[]{return activities.filter(a=>timerEntries(a).every(({date,entry})=>{const day=state.days[date] as DailyRecord|undefined;return day&&(getDiaryEntries(day).some(e=>e.id===entry.id)||day.removedDiaryIds?.includes(entry.id));})).map(a=>a.id);}
