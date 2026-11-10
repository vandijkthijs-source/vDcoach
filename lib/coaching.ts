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
