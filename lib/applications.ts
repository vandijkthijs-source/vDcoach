import type {State,DailyRecord} from './model';
export type Application={id:string;company:string;role:string;status:string;stage:'waiting'|'action'|'interview'|'closed';color?:'green'|'orange'|'red';note?:string;acknowledgedUpdateId?:string;nextAction:string;actionDate?:string;appointment?:string;url?:string};
export type ApplicationUpdate={operation?:'add'|'update'|'delete';id:string;updatedAt:string;date:string;item:Application};
export const applicationColor=(a:Application)=>a.color??(a.stage==='closed'?'red':a.stage==='interview'?'green':'orange');
export type ApplicationSnapshot={updatedAt:string;items:Application[]};
import {validateApplications} from './model';
export {validateApplications};
export function latestApplications(state:State):ApplicationSnapshot|undefined {
 const source=[...Object.values(state.serverApplicationSnapshots??{}),...Object.values(state.days).map(d=>(d as DailyRecord).plan?.applications)].filter((v):v is ApplicationSnapshot=>!!v).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))[0];
 if(!state.applicationJournal?.length)return source;
 const items=new Map((source?.items??[]).map(a=>[a.id,a]));let updatedAt=source?.updatedAt??'1970-01-01T00:00:00Z';
 const latest=new Map((state.applicationJournal??[]).map(u=>[u.item.id,u]));
 for(const update of latest.values()){if(update.operation==='delete'){items.delete(update.item.id);if(Date.parse(update.updatedAt)>Date.parse(updatedAt))updatedAt=update.updatedAt;continue;}const incoming=items.get(update.item.id);const confirmed=Object.values(state.days).some(d=>(d as DailyRecord).plan?.applications?.items.some(a=>a.id===update.item.id&&a.acknowledgedUpdateId===update.id));if(confirmed&&(incoming||update.item.stage!=='closed'))continue;items.set(update.item.id,{...update.item});if(Date.parse(update.updatedAt)>Date.parse(updatedAt))updatedAt=update.updatedAt;}
 return {updatedAt,items:Array.from(items.values())};
}
export function applicationsAt(state:State,date:string):ApplicationSnapshot|undefined {
 const localDate=(stamp:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp));
 const days=Object.fromEntries(Object.entries(state.days).filter(([key])=>key<=date).map(([key,value])=>{const day=value as DailyRecord;const snapshot=day.plan?.applications;return [key,snapshot&&localDate(snapshot.updatedAt)>date?{...day,plan:{...day.plan!,applications:undefined}}:day];}));
 return latestApplications({...state,days,serverApplicationSnapshots:Object.fromEntries(Object.entries(state.serverApplicationSnapshots??{}).filter(([key,snapshot])=>key<=date&&localDate(snapshot.updatedAt)<=date)),applicationJournal:state.applicationJournal?.filter(u=>u.date<=date&&localDate(u.updatedAt)<=date)});
}
export function updateApplication(state:State,item:Application,stamp=new Date().toISOString(),operation:ApplicationUpdate['operation']='update'):State {
 const record={operation,id:'application-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),updatedAt:stamp,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp)),item:{...item,acknowledgedUpdateId:undefined}};
 validateApplications({updatedAt:stamp,items:[record.item]});return {...state,applicationJournal:[...(state.applicationJournal??[]),record]};
}
export function removeApplication(state:State,item:Application,stamp=new Date().toISOString()):State {
 return updateApplication(state,item,stamp,'delete');
}
export function applicationHandoff(state:State,date:string):string {
 const overview=applicationsAt(state,date);const journal=(state.applicationJournal??[]).filter(u=>u.date===date);
 if(!overview&&!journal.length)return '';
 return `\n\nSollicitaties (opgeslagen stand t/m ${date}; geen externe wijziging bevestigd):\n`+(overview?.items??[]).map(a=>`- [${a.id}] ${a.company} — ${a.role}: ${a.status}; bolletje ${applicationColor(a)}; fase ${a.stage}. Volgende stap: ${a.nextAction}${a.actionDate?'; actiedatum '+a.actionDate:''}${a.appointment?'; gesprek '+a.appointment:''}${a.note?'; opmerking '+a.note:''}${a.url?'; bron '+a.url:''}`).join('\n')+'\n\nSollicitatiewijzigingen door mij op '+date+':\n'+(journal.map(u=>`- Update-ID ${u.id}; traject ${u.item.id}; handeling ${u.operation==='delete'?'VERWIJDERD UIT APPOVERZICHT (geen intrekking)':u.operation==='add'?'TOEGEVOEGD':'BIJGEWERKT'}; ${u.updatedAt}: ${u.item.company} — ${u.item.role}; status ${u.item.status}; fase ${u.item.stage}; bolletje ${applicationColor(u.item)}; volgende stap ${u.item.nextAction}${u.item.note?'; opmerking '+u.item.note:''}${u.item.actionDate?'; actiedatum '+u.item.actionDate:''}${u.item.appointment?'; gesprek '+u.item.appointment:''}${u.item.url?'; bron '+u.item.url:''}`).join('\n')||'Geen wijzigingen op deze dag.')+'\nNeem deze bevestigde wijzigingen mee bij expliciet gevraagde dagverwerking. Werk tracker/Drive alleen op mijn expliciete verzoek bij. Gebruik in een volgende appmomentopname acknowledgedUpdateId om een lokale wijziging te bevestigen; anders blijft mijn appwijziging leidend. Afgesloten is geen wachtend proces. Verwijderd uit de app betekent niet dat de sollicitatie is ingetrokken of afgewezen; geen sollicitatie of trackerhistorie verwijderen zonder expliciete opdracht.';
}
export function sortApplications(items:Application[]):Application[]{return [...items].sort((a,b)=>({action:0,interview:1,waiting:2,closed:3}[a.stage]-{action:0,interview:1,waiting:2,closed:3}[b.stage])||(a.actionDate??'9999').localeCompare(b.actionDate??'9999')||a.company.localeCompare(b.company));}
