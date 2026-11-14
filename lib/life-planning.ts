import {State,Task,DailyRecord,newDay,id} from './model';
export function moveTask(state:State,date:string,taskId:string,target:string|'backlog'):State{
 const source=state.days[date] as DailyRecord|undefined,task=source?.tasks.find(t=>t.id===taskId);
 if(!source||source.closed||!task||task.category!=='Task')return state;
 if(target!=='backlog'&&(!/^\d{4}-\d{2}-\d{2}$/.test(target)||new Date(target+'T12:00:00Z').toISOString().slice(0,10)!==target||target<=date))throw Error('Kies een datum na deze dag.');
 if(target!=='backlog'&&state.days[target]?.closed)throw Error('Die dag is afgesloten.');
 const moved={...task,status:target==='backlog'?'parked' as const:'todo' as const,priority:false,rollovers:task.rollovers+1,firstPlannedDate:task.firstPlannedDate??date};
 const day={...source,tasks:source.tasks.filter(t=>t.id!==taskId),removedTaskIds:[...new Set([...(source.removedTaskIds??[]),taskId])],deferredTasks:[...((source as any).deferredTasks??[]).filter((v:any)=>v.id!==taskId),{id:taskId,title:task.title,target}]};
 if(target==='backlog')return {...state,days:{...state.days,[date]:day},backlogTasks:[...(state.backlogTasks??[]).filter(t=>t.id!==taskId),moved]};
 const next=state.days[target]??newDay(target);return {...state,days:{...state.days,[date]:day,[target]:{...next,tasks:[...next.tasks.filter(t=>t.id!==taskId),moved],taskOverrides:[...new Set([...((next as DailyRecord).taskOverrides??[]),taskId])],removedTaskIds:((next as DailyRecord).removedTaskIds??[]).filter(v=>v!==taskId)}}};
}
export function activateBacklog(state:State,taskId:string,date:string):State{
 const task=state.backlogTasks?.find(t=>t.id===taskId);if(!task||state.days[date]?.closed)return state;
 const day=state.days[date]??newDay(date);return {...state,backlogTasks:state.backlogTasks?.filter(t=>t.id!==taskId),days:{...state.days,[date]:{...day,tasks:[...day.tasks.filter(t=>t.id!==taskId),{...task,status:'todo' as const}],removedTaskIds:((day as DailyRecord).removedTaskIds??[]).filter(v=>v!==taskId),taskOverrides:[...new Set([...((day as DailyRecord).taskOverrides??[]),taskId])]}}};
}
export function projectTask(state:State,projectId:string,date:string):State{
 const project=state.projects?.find(p=>p.id===projectId);if(!project||project.archived||!project.nextStep.trim()||state.days[date]?.closed)return state;
 const day=state.days[date]??newDay(date);if(day.tasks.some(t=>t.projectId===projectId&&!t.done))return state;
 const task:Task={id:id(),title:project.nextStep,projectId,...(project.area?{area:project.area}:{}),category:'Task',done:false,priority:false,minutes:0,rollovers:0};return {...state,days:{...state.days,[date]:{...day,tasks:[...day.tasks,task]}}};
}

// Explicit review choices can arrive after midnight; preserve the closed-day flag.
export function moveReviewedTask(state:State,sourceDate:string,taskId:string,target:string):State{
 const day=state.days[sourceDate];if(!day)return state;const closed=day.closed;const next=moveTask({...state,days:{...state.days,[sourceDate]:{...day,closed:false}}},sourceDate,taskId,target);return {...next,days:{...next.days,[sourceDate]:{...next.days[sourceDate],closed}}};
}
