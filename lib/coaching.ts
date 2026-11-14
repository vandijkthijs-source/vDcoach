import type {ApplicationSnapshot} from './applications';
import {loadServerConnection} from './server-connection';

export type ApplicationRecord={id:string;company:string;role:string;status:string;asOfDate:string;evidence:string;nextActionDate?:string;nextAction?:string;notes?:string;updatedAt:number};
export async function fetchApplications():Promise<ApplicationRecord[]> {
 const {url,token}=await loadServerConnection();
 if(!url||!token)throw Error('Verbind je server via Instellingen.');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
 try{
  const response=await fetch(url+'/applications',{headers:{Authorization:'Bearer '+token},signal:abort.signal});
  if(!response.ok)throw Error('Sollicitaties niet bereikbaar. Opgeslagen overzicht blijft zichtbaar.');
  const data=await response.json();
  if(!Array.isArray(data.applications)||data.applications.some((a:ApplicationRecord)=>!a||['id','company','role','status','asOfDate','evidence'].some(k=>typeof (a as any)[k]!=='string')))throw Error('Ongeldig sollicitatieoverzicht ontvangen.');
  return data.applications;
 }finally{clearTimeout(timer);}
}

// Bridge the new server register to the existing compact screens and widgets.
export function applicationSnapshot(items:ApplicationRecord[],stamp=new Date().toISOString()):ApplicationSnapshot {
 return {updatedAt:stamp,items:items.map(a=>({id:a.id,company:a.company,role:a.role,status:a.status,stage:/afgewezen|afwijzing|afgesloten|ingetrokken|niet geselecteerd/i.test(a.status)?'closed':/uitgenodigd|gesprek bevestigd/i.test(a.status)?'interview':'waiting',nextAction:a.nextAction||'Wacht op een nieuwe reactie.',...(a.nextActionDate?{actionDate:a.nextActionDate}:{}),note:[a.notes,a.evidence].filter(Boolean).join('\n').slice(0,4000)}))};
}

export type DayReview={date:string;inputHash:string;reviewedAt:number;summary:string;nutrition?:{kcal?:number;protein?:number;carbs?:number;fat?:number}};
export async function fetchDayReviews():Promise<DayReview[]> {
 const {url,token}=await loadServerConnection();
 if(!url||!token)throw Error('Verbind je server via Instellingen.');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
 try{
  const response=await fetch(url+'/day-reviews',{headers:{Authorization:'Bearer '+token},signal:abort.signal});
  if(!response.ok)throw Error('Dagverwerking nog niet beschikbaar op de server.');
  const data=await response.json();
  if(!Array.isArray(data.completed)||data.completed.some((v:DayReview)=>!v||typeof v.date!=='string'||typeof v.summary!=='string'))throw Error('Ongeldige dagverwerking ontvangen.');
  return data.completed;
 }finally{clearTimeout(timer);}
}
