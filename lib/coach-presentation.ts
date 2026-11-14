import {DailyRecord,getDiaryEntries} from './model';
/** A factual introduction from saved data; never presented as a generated AI answer. */
export function coachDayText(day:DailyRecord){
 const tasks=day.tasks.filter(t=>t.category==='Task'&&!t.done&&t.status!=='parked'&&t.status!=='waiting');
 const important=tasks.filter(t=>t.priority).slice(0,3),chosen=important.length?important:tasks.slice(0,1);
 const appointments=getDiaryEntries(day).filter(e=>e.appointmentId&&!e.done).sort((a,b)=>(a.startTime??'').localeCompare(b.startTime??''));
 const pieces:string[]=[];
 if(day.closed)pieces.push('Deze dag is afgesloten. Je plan en registraties zijn bewaard.');
 if(chosen.length)pieces.push(`In je dagplan staat: ${chosen.map(t=>t.shortTitle||t.title.replace(/[.]$/,'')).join(', ')}.`);
 if(appointments.length){const next=appointments[0];pieces.push(`${next.startTime?'Om '+next.startTime+' staat':'In je agenda staat'} ${next.text}${appointments.length>1?`, en nog ${appointments.length-1} ${appointments.length===2?'afspraak':'afspraken'}`:''}.`);}
 if(tasks.length>chosen.length)pieces.push(`De overige ${tasks.length-chosen.length} ${tasks.length-chosen.length===1?'taak blijft':'taken blijven'} in je dagoverzicht staan.`);
 if(!pieces.length)pieces.push(day.plan?'Je hebt nu geen open taken of afspraken in het opgeslagen plan.':'Er staat nog geen dagplan klaar. Vertel wat er speelt, dan bespreken we hoe je dag kan passen.');
 return pieces.join(' ');
}
/** Hide the proposal transport block while streaming; the validated preview is shown separately. */
export function coachVisibleText(text:string){const start=text.search(/```json(?:\s|$)|```\s*\{\s*"vdcoachProposal"/);return start>=0?text.slice(0,start).trimEnd():text;}
export function nextReveal(current:string,target:string){if(!target.startsWith(current))return target;const remaining=Array.from(target.slice(current.length));return current+remaining.slice(0,Math.max(2,Math.ceil(remaining.length/5))).join('');}
