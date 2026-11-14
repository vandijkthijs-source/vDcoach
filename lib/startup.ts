import {State,migrateLegacyState,validateBackup,validateMorningPlan} from './model';
export const STATE_KEY='vdcoach-v1';
type Storage={getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>};
export async function readSavedState(storage:Storage):Promise<{state?:State;warning?:string}> {
 const raw=await storage.getItem(STATE_KEY);if(!raw)return {};
 const parsed=JSON.parse(raw);
 // Old cached plan metadata is replaceable from the server. Never discard
 // actual diary/task/food input to repair it, and archive bytes before repair.
 let repaired=false;
 if(parsed?.days&&typeof parsed.days==='object'&&!Array.isArray(parsed.days))for(const day of Object.values(parsed.days) as any[]){
  if(day&&day.plan!==undefined){try{validateMorningPlan(day.plan);}catch{delete day.plan;repaired=true;}}
 }
 const state=migrateLegacyState(validateBackup(JSON.stringify(parsed)));
 validateBackup(JSON.stringify(state));
 if(!await storage.getItem('vdcoach-before-v2'))await storage.setItem('vdcoach-before-v2',raw);
 if(repaired){await storage.setItem('vdcoach-recovery-'+Date.now(),raw);return {state,warning:'Een oud dagplan kon niet worden gelezen. Je invoer is behouden en de oorspronkelijke opslag is apart bewaard. Het plan wordt opnieuw van de server opgehaald.'};}
 return {state};
}

export async function restoreSavedState(storage:Storage,state:State){
 const valid=migrateLegacyState(validateBackup(JSON.stringify(state)));
 validateBackup(JSON.stringify(valid));
 const original=await storage.getItem(STATE_KEY);
 if(original!==null)await storage.setItem('vdcoach-recovery-'+Date.now(),original);
 await storage.setItem(STATE_KEY,JSON.stringify(valid));
 return valid;
}
