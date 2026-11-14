import {AppState,NativeModules,Platform,DeviceEventEmitter} from 'react-native';
import * as Linking from 'expo-linking';
import {loadServerConnection} from './server-connection';
export type ChatStatus={linked:boolean;connected:boolean;account:{email:string;name:string}|null;includedOnlyConfirmed:boolean;usageUrl:string;billing:string;apiKeyFallback:boolean};
export type ChatMessage={id:string;role:'user'|'assistant';text:string;status:'pending'|'streaming'|'complete'|'error';error?:string;createdAt:number;proposal?:{summary:string;changes:unknown[];preview:string[]};appliedRevision?:number|null};
export type ChatHistory={date:string;messages:ChatMessage[]};
export type ChatModel={id:string;name:string};
export async function chatRequest<T>(path:string,body?:unknown):Promise<T>{
 const {url,token}=await loadServerConnection();if(!url||!token)throw Error('Verbind eerst je vDcoach-server via Instellingen.');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),path==='/chat/auth/finish'?60000:30000);
 try{const response=await fetch(url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,redirect:'error'});const data=await response.json();if(!response.ok)throw Error(data.error||'De chatserver is niet bereikbaar.');return data;}
 catch(e){if(e instanceof TypeError||e instanceof Error&&e.name==='AbortError')throw Error('Server niet bereikbaar. Je gesprek en invoer blijven bewaard.');throw e;}finally{clearTimeout(timeout)}
}
let currentCallback:string|null=null;
export async function connectChatGPT(newAccount=false):Promise<ChatStatus>{
 if(Platform.OS!=='android'||!NativeModules.CoachChatAuth)throw Error('Meld je aan vanuit de nieuwe Android-build van vDcoach.');
 const callback=JSON.parse(await NativeModules.CoachChatAuth.openLoopback());currentCallback=callback.id;let attemptId:string|undefined;
 try{
  const attempt=await chatRequest<{attemptId:string;state:string;url:string}>('/chat/auth/start',{redirectUri:callback.redirectUri,newAccount});
  attemptId=attempt.attemptId;
  const authUrl=new URL(attempt.url);if(authUrl.origin!=='https://auth.openai.com'||authUrl.pathname!=='/api/accounts/authorize')throw Error('Ongeldige aanmeldbestemming.');
  // Register the expected state before opening the browser. A rejected pending
  // callback is handled even while the system browser is in front of the app.
  const result=NativeModules.CoachChatAuth.waitForCallback(callback.id,attempt.state).then((raw:string)=>({value:JSON.parse(raw)}),(error:unknown)=>({error}));
  await Linking.openURL(attempt.url);const response=await result;
  if('error' in response)throw response.error;
  const status=await chatRequest<ChatStatus>('/chat/auth/finish',{attemptId:attempt.attemptId,...response.value});DeviceEventEmitter.emit('vdcoach-chat-status');return status;
 }finally{if(attemptId)void chatRequest('/chat/auth/cancel',{attemptId}).catch(()=>{});NativeModules.CoachChatAuth.cancel(callback.id);if(currentCallback===callback.id)currentCallback=null;}
}
export function cancelChatGPTLogin(){if(currentCallback){NativeModules.CoachChatAuth?.cancel(currentCallback);currentCallback=null;}}
export function isChatActive(){return AppState.currentState==='active'||Platform.OS==='web';}
