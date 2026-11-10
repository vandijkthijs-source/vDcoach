import {closePastDays} from './day-lifecycle';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadServerConnection} from './server-connection';
import {State,validateBackup} from './model';
import {firstSyncBase,mergeProgress,sharedState,stable} from './sync-model';

const KEY='vdcoach-sync-base-v1';
export async function syncProgress(local:State):Promise<{state:State;sent:State;url:string}> {
 const {url,token}=await loadServerConnection();
 if(!url||!token)throw Error('Verbind je server via Instellingen.');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
 try{
  async function request(body?:unknown){const response=await fetch(url+'/state',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:abort.signal});if(!response.ok)throw Error(response.status===409?'Voortgang is net gewijzigd. Probeer opnieuw; je lokale gegevens zijn bewaard.':response.status===401?'Controleer je verbindingstoken.':'Synchroniseren mislukt. Je lokale gegevens zijn bewaard.');return response.json();}
  const raw=await AsyncStorage.getItem(KEY);
  const saved=raw?JSON.parse(raw):null;
  const remote=await request();
  validateBackup(JSON.stringify(remote.state));
  const base=saved?.url===url?validateBackup(JSON.stringify(saved.state)):firstSyncBase(local,remote.state);
  const merged=sharedState(closePastDays(mergeProgress(base,local,remote.state)));
  const result=stable(merged)===stable(remote.state)?remote:await request({revision:remote.revision,state:merged});
  const state=validateBackup(JSON.stringify(result.state));
  return {state:{...local,...state},sent:local,url};
 }finally{clearTimeout(timer);}
}
export async function acknowledgeSync(url:string,state:State){
 // Advance the merge base only after the caller has rebased edits made in flight.
 await AsyncStorage.setItem(KEY,JSON.stringify({url,state:sharedState(state)}));
}
