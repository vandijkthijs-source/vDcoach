import {latestApplications,sortApplications} from './applications';
import {NativeModules,Platform} from 'react-native';
import {State,today,DailyRecord,getFoodEntries,getDiaryEntries} from './model';
import {loadServerConnection} from './server-connection';
import {WidgetAction} from './widget-model';
export async function widgetActions():Promise<WidgetAction[]>{if(Platform.OS!=='android'||!NativeModules.CoachWidgets)return [];return JSON.parse(await NativeModules.CoachWidgets.snapshot());}
export async function publishWidgets(state:State){
 if(Platform.OS!=='android'||!NativeModules.CoachWidgets)return;
 const date=today(),day=state.days[date] as DailyRecord|undefined;
 const overview=latestApplications(state);
 const lastUpdates=new Map((state.applicationJournal??[]).map(u=>[u.item.id,u]));
 const protectedApplicationIds=[...lastUpdates.values()].filter(u=>overview?.items.find(a=>a.id===u.item.id)?.acknowledgedUpdateId!==u.id).map(u=>u.item.id);
 const mirror={protectedApplicationIds,applications:overview?{...overview,items:sortApplications(overview.items)}:null,darkMode:state.darkMode??true,projects:state.projects??[],planningEnd:state.planningEnd??'22:00',days:Object.fromEntries(Object.entries(state.days).sort(([a],[b])=>a.localeCompare(b)).filter(([d])=>Math.abs(Date.parse(d)-Date.parse(date))<=14*86400000).map(([d,record])=>[d,{date:d,closed:record.closed,energy:record.energy,focusChoices:record.focusChoices,tasks:record.tasks.filter(t=>t.category!=='Appointment'),diaryEntries:getDiaryEntries(record as DailyRecord),removedDiaryIds:(record as DailyRecord).removedDiaryIds??[]}]))};
 const connection=await loadServerConnection();
 if(connection.url&&connection.token&&NativeModules.CoachWidgets.configureRefresh)await NativeModules.CoachWidgets.configureRefresh(connection.url,connection.token);
 await NativeModules.CoachWidgets.publish(JSON.stringify(mirror),state.widgetActionIds??[]);
}

export async function widgetScreen():Promise<string|null>{if(Platform.OS!=='android'||!NativeModules.CoachWidgets?.consumeScreen)return null;return NativeModules.CoachWidgets.consumeScreen();}
