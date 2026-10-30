import {NativeModules,PermissionsAndroid,Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {TimerSnapshot} from './timer-model';
const KEY='vdcoach-timer-v1';
let queue:Promise<unknown>=Promise.resolve();
function serial<T>(fn:()=>Promise<T>):Promise<T>{const result=queue.then(fn);queue=result.catch(()=>{});return result;}
const native=()=>Platform.OS==='android'?NativeModules.CoachTimer:undefined;
const read=async():Promise<TimerSnapshot>=>JSON.parse(await AsyncStorage.getItem(KEY)??'{"active":null,"completed":[]}');
const write=async(s:TimerSnapshot)=>{await AsyncStorage.setItem(KEY,JSON.stringify(s));return s;};
export async function timerSnapshot():Promise<TimerSnapshot>{const module=native();if(Platform.OS==='android'&&!module)throw Error('Installeer een nieuwe build voor de achtergrondtimer.');return module?JSON.parse(await module.snapshot()):read();}
export async function startTimer(title:string):Promise<TimerSnapshot>{const module=native();if(Platform.OS==='android'){if(!module)throw Error('Installeer een nieuwe build voor de achtergrondtimer.');if(Number(Platform.Version)>=33){const result=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);if(result!==PermissionsAndroid.RESULTS.GRANTED)throw Error('Sta meldingen toe om de timer buiten de app te zien.');}return JSON.parse(await module.start(title));}return serial(async()=>{const s=await read();if(s.active)throw Error('Er loopt al een timer.');return write({...s,active:{id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,title:title.trim()||'Activiteit',startedAt:Date.now()}});});}
export async function stopTimer():Promise<TimerSnapshot>{const module=native();if(module)return JSON.parse(await module.stop());if(Platform.OS==='android')throw Error('Installeer een nieuwe build voor de achtergrondtimer.');return serial(async()=>{const s=await read();if(!s.active)return s;return write({active:null,completed:[...s.completed,{...s.active,stoppedAt:Math.max(Date.now(),s.active.startedAt+1)}]});});}
export async function acknowledgeTimers(ids:string[]){if(!ids.length)return;const module=native();if(module)await module.acknowledge(ids);else if(Platform.OS!=='android'){await serial(async()=>{const s=await read();await write({...s,completed:s.completed.filter(a=>!ids.includes(a.id))});});}}
