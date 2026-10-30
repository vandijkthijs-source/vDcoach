import {DailyRecord,State,taskHandoff} from './model';
export function deferredSummary(state:State,date:string):string {
 const day=state.days[date] as DailyRecord|undefined;
 if(!day)return '';
 const nextDate=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const tomorrow=state.days[nextDate] as DailyRecord|undefined;
 if(!tomorrow)return '';
 // Both markers are written by the move gesture; a deleted task alone is not a move.
 const tasks=tomorrow.tasks.filter(t=>t.category==='Task'&&day.removedTaskIds?.includes(t.id)&&tomorrow.taskOverrides?.includes(t.id));
 if(!tasks.length)return '';
 return `\n\nDoorgeschoven naar morgen (${nextDate}):\n${tasks.map(t=>`- ${taskHandoff(t)}${t.rollovers?` ↻${t.rollovers}`:''}`).join('\n')}\nDeze taken zijn verplaatst, niet afgerond. Behoud de genoemde plandatum en verhoog de doorschuifteller niet opnieuw bij dagverwerking.`;
}

export function deletedSummary(state:State,date:string):string {
 const tasks=(state.days[date] as DailyRecord|undefined)?.deletedTasks??[];
 if(!tasks.length)return '';
 return `\n\nVerwijderd uit de daglijst:\n${tasks.map(t=>`- ${taskHandoff(t)}${t.done?' (was al afgerond)':''}`).join('\n')}\nDeze taken zijn geschrapt uit de daglijst. Niet automatisch opnieuw plannen of als nieuwe afronding tellen.`;
}
