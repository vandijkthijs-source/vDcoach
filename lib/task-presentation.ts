import {Task} from './model';
export function taskPresentation(task:Task){
 const full=task.title.trim();
 const first=full.split(/[:;\n]/,1)[0].trim();
 const candidate=first.length>=8?first:full;
 const shortened=candidate.length>58?candidate.slice(0,58).replace(/\s+\S*$/,'').trim():candidate;
 const title=task.shortTitle?.trim()||shortened||full;
 const details=title===full?'':full;
 const deadline=task.dueDate?new Date(task.dueDate+'T12:00:00Z').toLocaleDateString('nl-NL',{day:'numeric',month:'short',timeZone:'Europe/Amsterdam'}).replace('.',''):'';
 const metadata=[task.minutes?`±${task.minutes} min`:'',deadline?`deadline ${deadline}`:'',task.rollovers?`↻${task.rollovers}`:''].filter(Boolean).join(' · ');
 return {title,details,metadata};
}
