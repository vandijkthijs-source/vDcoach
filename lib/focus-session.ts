import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules,PermissionsAndroid,Platform} from 'react-native';
import {Task,today} from './model';
import {startTimer,stopTimer,timerSnapshot} from './timer';
import {TimedActivity} from './timer-model';
export type FocusSession={id:string;taskId:string;date:string;title:string;minutes:number;elapsed:number;status:'running'|'paused'|'review';startedAt?:number};
export type FocusSnapshot={session:FocusSession|null;active:TimedActivity|null};
const KEY='vdcoach-focus-v1';
export async function focusSnapshot():Promise<FocusSnapshot>{if(Platform.OS==='android')return JSON.parse(await NativeModules.CoachWidgets.focusSnapshot());const session:FocusSession|null=JSON.parse(await AsyncStorage.getItem(KEY)??'null'),timer=await timerSnapshot();if(session?.status==='running'&&timer.active?.focusSessionId!==session.id){const last=timer.completed.find(t=>t.focusSessionId===session.id&&t.startedAt===session.startedAt);if(last?.stoppedAt)session.elapsed+=Math.max(0,last.stoppedAt-last.startedAt);session.status='review';await AsyncStorage.setItem(KEY,JSON.stringify(session));}return {session,active:timer.active};}
export async function focusAction(action:'start'|'pause'|'stop'|'done'|'later',task:Task|undefined,minutes=25):Promise<FocusSnapshot>{
 if(Platform.OS==='android'){if(!NativeModules.CoachWidgets?.focusAction)throw Error('Installeer een nieuwe build om focus te gebruiken.');if(action==='start'&&Number(Platform.Version)>=33){const result=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);if(result!==PermissionsAndroid.RESULTS.GRANTED)throw Error('Sta meldingen toe om focus buiten de app te zien.');}return JSON.parse(await NativeModules.CoachWidgets.focusAction(action,task?.id??'',minutes));}
 const snapshot=await focusSnapshot();let s=snapshot.session;
 if(action==='start'){if(!task)throw Error('Kies een taak.');if(s&&s.taskId!==task.id)throw Error('Rond eerst je vorige focussessie af.');s=(s?.status==='review'?null:s)??{id:'focus-'+Date.now(),taskId:task.id,date:today(),title:task.shortTitle||task.title,minutes,elapsed:0,status:'paused'};const timer=await startTimer(s.title,{taskId:s.taskId,focusSessionId:s.id,focusMinutes:s.minutes});s={...s,status:'running',startedAt:timer.active!.startedAt};}
 else if(s){if(snapshot.active?.focusSessionId===s.id){await stopTimer();s.elapsed+=Date.now()-snapshot.active.startedAt;}s.status=action==='pause'?'paused':'review';if(action==='done'||action==='later')s=null;}
 await AsyncStorage.setItem(KEY,JSON.stringify(s));return focusSnapshot();
}
