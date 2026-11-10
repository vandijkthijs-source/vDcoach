import {latestApplications,sortApplications} from './applications';
import {NativeModules,Platform} from 'react-native';
import {State,today,DailyRecord,getFoodEntries} from './model';
import {WidgetAction} from './widget-model';
export async function widgetActions():Promise<WidgetAction[]>{if(Platform.OS!=='android'||!NativeModules.CoachWidgets)return [];return JSON.parse(await NativeModules.CoachWidgets.snapshot());}
export async function publishWidgets(state:State){
 if(Platform.OS!=='android'||!NativeModules.CoachWidgets)return;
 const date=today(),day=state.days[date] as DailyRecord|undefined;
 const overview=latestApplications(state);
 const mirror={applications:overview?{...overview,items:sortApplications(overview.items)}:null,darkMode:state.darkMode??true,days:day?{[date]:{date,closed:day.closed,tasks:day.tasks.filter(t=>t.category==='Task'),foodEntries:getFoodEntries(day)}}:{}};
 await NativeModules.CoachWidgets.publish(JSON.stringify(mirror),state.widgetActionIds??[]);
}

export async function widgetScreen():Promise<string|null>{if(Platform.OS!=='android'||!NativeModules.CoachWidgets?.consumeScreen)return null;return NativeModules.CoachWidgets.consumeScreen();}
