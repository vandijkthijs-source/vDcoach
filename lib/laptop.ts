import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { State, validateBackup } from './model';
const URL_KEY='vdcoach-laptop-url', TOKEN_KEY='vdcoach-laptop-token';
export async function loadLaptop() {
 return {url:await AsyncStorage.getItem(URL_KEY)??'',token:Platform.OS==='web'?'':await SecureStore.getItemAsync(TOKEN_KEY)??''};
}
export async function saveLaptop(url:string,token:string) {
 const u=new URL(url); if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw new Error('Gebruik alleen het laptopadres en de poort, bijvoorbeeld http://100.x.x.x:2285.');
 if(token.length<32)throw new Error('Plak het volledige verbindingstoken van je laptop.');
 if(Platform.OS==='web')throw new Error('Laptop backups are available in the Android app. Use file export in the browser preview.');
 await SecureStore.setItemAsync(TOKEN_KEY,token);await AsyncStorage.setItem(URL_KEY,u.origin);
}
export async function laptopBackup(state?:State):Promise<{savedAt:number;state?:State}> {
 const {url,token}=await loadLaptop();if(!url||!token)throw new Error('Sla eerst je laptopverbinding op.');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
 try{const r=await fetch(url+'/backup',{method:state?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(state?{'Content-Type':'application/json'}:{})},body:state?JSON.stringify(state):undefined,signal:abort.signal});if(!r.ok)throw new Error(r.status===401?'Laptop token was rejected.':r.status===404?'No laptop backup found.':'Laptop backup failed.');const data=await r.json();return {savedAt:data.savedAt,...(!state?{state:validateBackup(JSON.stringify(data.state))}:{})};}finally{clearTimeout(timer);}
}

export async function fetchMorningPlan(date:string) {
 const {url,token}=await loadLaptop();
 if(!url||!token)throw Error('Verbind je laptop via Instellingen.');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
 try {const response=await fetch(`${url}/plan?date=${encodeURIComponent(date)}`,{headers:{Authorization:`Bearer ${token}`},signal:abort.signal});
 if(response.status===404)throw Error('Verbonden met laptop · dagoverzicht nog niet aangemaakt.');
 if(!response.ok)throw Error(response.status===401?'Controleer je verbindingstoken.':'Laptop niet bereikbaar.');
 return (await import('./model')).validateMorningPlan(await response.json());
 }catch(e){if(e instanceof TypeError||(e instanceof Error&&e.name==='AbortError'))throw Error('Laptop niet bereikbaar. Controleer Tailscale en het laptopadres.');throw e;}finally{clearTimeout(timer);}
}
