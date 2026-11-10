import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {Platform} from 'react-native';
import {validateBackup} from './model';
// Retain existing keys so installed apps keep their connection after upgrading.
const URL_KEY='vdcoach-laptop-url',TOKEN_KEY='vdcoach-laptop-token';
export async function loadServerConnection(){
 return {url:await AsyncStorage.getItem(URL_KEY)??'',token:Platform.OS==='web'?'':await SecureStore.getItemAsync(TOKEN_KEY)??''};
}
export async function saveServerConnection(url:string,token:string){
 const u=new URL(url);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Gebruik alleen het serveradres en de poort, bijvoorbeeld http://100.x.x.x:2285.');
 if(token.length<32)throw Error('Plak het volledige verbindingstoken van je server.');
 if(Platform.OS==='web')throw Error('Verbind vanuit de Android-app. Het token wordt daar beveiligd opgeslagen.');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(u.origin+'/state',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
  if(!response.ok)throw Error(response.status===401?'Het verbindingstoken is niet geldig.':'De server kon niet worden gecontroleerd.');
  const data=await response.json();validateBackup(JSON.stringify(data.state));
 }catch(error){if(error instanceof TypeError||(error instanceof Error&&error.name==='AbortError'))throw Error('Server niet bereikbaar. Controleer Tailscale en het serveradres.');throw error;}finally{clearTimeout(timeout);}
 await SecureStore.setItemAsync(TOKEN_KEY,token);await AsyncStorage.setItem(URL_KEY,u.origin);
}

export async function readServerState(){
 const {url,token}=await loadServerConnection();
 if(!url||!token)throw Error('Vul eerst je serveradres en verbindingstoken in.');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(url+'/state',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});if(!response.ok)throw Error('Servergegevens ophalen mislukt. Controleer je verbinding en token.');const data=await response.json();return {url,state:validateBackup(JSON.stringify(data.state))};}finally{clearTimeout(timeout);}
}
