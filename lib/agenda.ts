import {DiaryEntry,diaryTime} from './model';
export const GRID_START=360,GRID_END=1440,PIXELS_PER_MINUTE=1.2;
export const minuteLabel=(value:number)=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
export function slotRange(start:number){const from=Math.max(GRID_START,Math.min(GRID_END-60,Math.floor(start/30)*30));return {start:from,end:from+60};}
export function resizeRange(start:number,end:number,edge:'start'|'end',deltaMinutes:number){const value=Math.round(((edge==='start'?start:end)+deltaMinutes)/15)*15;return edge==='start'?{start:Math.max(GRID_START,Math.min(end-15,value)),end}:{start,end:Math.min(GRID_END,Math.max(start+15,value))};}
// Older timer records already contain their exact timestamps in the preserved note.
// Use those only while the visible clock fields still match the original timer.
function preciseRange(entry:DiaryEntry){
 const fallback={start:diaryTime(entry.startTime!),end:diaryTime(entry.endTime!)};
 if(!entry.id.startsWith('timer-'))return fallback;
 const match=entry.note?.match(/^Timer · [^·]+ · (\S+) – (\S+)$/);if(!match)return fallback;
 const start=Date.parse(match[1]),end=Date.parse(match[2]);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return fallback;
 const fields=(stamp:number)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));
 const a=fields(start),b=fields(end),first=Number(a.hour)*60+Number(a.minute)+Number(a.second)/60+(start%1000)/60000;
 const last=a.year!==b.year||a.month!==b.month||a.day!==b.day?1440:Number(b.hour)*60+Number(b.minute)+Number(b.second)/60+(end%1000)/60000;
 if(Math.floor(first)!==fallback.start||Math.min(1440,Math.max(fallback.start+1,Math.ceil(last)))!==fallback.end||last<=first)return fallback;
 return {start:first,end:last};
}
export function agendaBlocks(entries:DiaryEntry[]){
 const blocks=entries.filter(e=>!e.allDay&&e.time!=='Hele dag'&&e.startTime&&e.endTime).map(entry=>{const range=preciseRange(entry);return {entry,start:Math.max(GRID_START,range.start),end:Math.min(GRID_END,range.end),column:0,columns:1,displayTop:0};}).filter(e=>e.end>e.start).sort((a,b)=>a.start-b.start||a.end-b.end);
 let group:typeof blocks=[],ends:number[]=[],groupEnd=0;
 const finish=()=>{for(const b of group)b.columns=ends.length;};
 for(const block of blocks){if(block.start>=groupEnd){finish();group=[];ends=[];}let column=ends.findIndex(end=>end<=block.start);if(column<0)column=ends.length;ends[column]=block.end;block.column=column;group.push(block);groupEnd=Math.max(...ends);}
 finish();
 for(let i=0;i<blocks.length;i++){const block=blocks[i];block.displayTop=(block.start-GRID_START)*PIXELS_PER_MINUTE;
  for(let j=0;j<i;j++){const previous=blocks[j];const sameSpace=block.column/block.columns<(previous.column+1)/previous.columns&&previous.column/previous.columns<(block.column+1)/block.columns;
   if(sameSpace&&previous.end<=block.start)block.displayTop=Math.max(block.displayTop,previous.displayTop+Math.max(17,(previous.end-previous.start)*PIXELS_PER_MINUTE-2)+1);
  }
 }
 return blocks;
}
export function moveRange(start:number,end:number,deltaMinutes:number){
 const duration=end-start;
 if(duration<=0||duration>GRID_END-GRID_START)return {start,end};
 const next=Math.max(GRID_START,Math.min(GRID_END-duration,Math.round((start+deltaMinutes)/15)*15));
 return {start:next,end:next+duration};
}
