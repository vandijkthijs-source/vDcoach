import {DailyRecord,State,getFoodEntries} from './model';
export const foodKey=(text:string)=>text.trim().toLocaleLowerCase('nl-NL').replace(/\s+/g,' ');
export function recentFood(state:State,date:string):string[]{const seen=new Set<string>(state.hiddenFoodHistory??[]),result:string[]=[];for(const day of Object.keys(state.days).filter(d=>d<=date).sort().reverse())for(const entry of [...getFoodEntries(state.days[day] as DailyRecord)].reverse()){const text=entry.text.trim(),key=foodKey(text);if(text&&!seen.has(key)){seen.add(key);result.push(text);}}return result;}
