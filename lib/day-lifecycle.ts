import type {State} from './model';
/** Calendar midnight in Amsterdam, including DST; closing never implies completion. */
export function closePastDays(state:State,now=new Date()):State {
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 let next=state;
 for(const [key,day] of Object.entries(state.days))if(key<date&&!day.closed){
  if(next===state)next={...state,days:{...state.days}};
  next.days[key]={...day,closed:true};
 }
 return next;
}
