import {State,validateBackup,newDay} from './model';

export function sharedState(state:State):State {
 return {version:1,coachUrl:state.coachUrl,days:state.days,...(state.planningEnd?{planningEnd:state.planningEnd}:{}),...(state.projects?{projects:state.projects}:{}),...(state.backlogTasks?{backlogTasks:state.backlogTasks}:{}),...(state.applicationJournal?{applicationJournal:state.applicationJournal}:{})};
}
export function stable(value:any):string {
 if(value===undefined)return 'undefined';
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
const same=(a:any,b:any)=>stable(a)===stable(b);
export class SyncConflict extends Error {
 constructor(path:string){super(`Synchronisatieconflict bij ${path}. Je lokale invoer blijft bewaard. Exporteer je back-up om beide versies te vergelijken.`);}
}
function merge(base:any,local:any,remote:any,path:string):any {
 // Plans are published only by the server; phone edits live in tasks/diary.
 if(/^voortgang\.days\.[^.]+\.(plan|planSources)$/.test(path))return remote;
 if(same(local,remote)||same(remote,base))return local;
 if(same(local,base))return remote;
 const objects=[base,local,remote].every(v=>v===undefined||(v!==null&&typeof v==='object'&&!Array.isArray(v)));
 if(objects&&local!==undefined&&remote!==undefined){
  const result:Record<string,any>={};
  for(const key of new Set([...Object.keys(base??{}),...Object.keys(local),...Object.keys(remote)])){
   const value=merge(base?.[key],local[key],remote[key],path+'.'+key);if(value!==undefined)result[key]=value;
  }
  return result;
 }
 if([base??[],local,remote].every(v=>Array.isArray(v)&&v.every((e:any)=>e&&typeof e.id==='string'))){
  const b=base??[],l=local as any[],r=remote as any[];
  const baseIds=new Set(b.map((e:any)=>e.id));
  const order=(items:any[])=>items.map(e=>e.id).filter(id=>baseIds.has(id)&&l.some(e=>e.id===id)&&r.some(e=>e.id===id));
  const bo=order(b),lo=order(l),ro=order(r);
  if(!same(lo,bo)&&!same(ro,bo)&&!same(lo,ro))throw new SyncConflict(path+' (volgorde)');
  const ids=[...new Set([...(same(lo,bo)?r:l).map(e=>e.id),...l.map(e=>e.id),...r.map(e=>e.id)])];
  return ids.map(id=>merge(b.find((e:any)=>e.id===id),l.find(e=>e.id===id),r.find(e=>e.id===id),path+'.'+id)).filter(e=>e!==undefined);
 }
 throw new SyncConflict(path);
}
export function mergeProgress(base:State,local:State,remote:State):State {
 const result=merge(sharedState(base),sharedState(local),sharedState(remote),'voortgang');
 return {...local,...validateBackup(JSON.stringify(result))};
}

// The old app created these untouched defaults without any user input. Treat
// them as the common ancestor during first connection, preserving actual edits.
export function firstSyncBase(local:State,remote:State):State {
 const days:State['days']={};
 for(const date of Object.keys(local.days))if(remote.days[date])days[date]={...newDay(date),startId:local.days[date].startId,...(local.days[date].tasks.length===0?{tasks:[]}:{})};
 return {version:1,coachUrl:'https://chatgpt.com/',days};
}
