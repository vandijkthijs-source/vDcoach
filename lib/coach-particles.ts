export type CoachParticle={x:number;y:number;size:number;opacity:number;dx:number;dy:number;tone:number};
/** Stable bounded particles: no random values or new animation drivers on each keystroke. */
export function coachParticles(count=72):CoachParticle[]{
 const n=Math.max(1,Math.min(120,Number.isFinite(count)?Math.floor(count):72));
 return Array.from({length:n},(_,i)=>{const angle=i*2.399963229728653,radius=Math.sqrt((i+.5)/n),depth=(Math.sin(i*1.73)+1)/2;return{x:140+Math.cos(angle)*91*radius,y:97+Math.sin(angle)*55*radius+Math.sin(i*.91)*7,size:1.6+depth*2.4,opacity:.28+depth*.6,dx:Math.cos(i*.7)*5,dy:Math.sin(i*1.1)*5,tone:i%3}});
}
export function latestCoachReply(messages:readonly {role:string;text:string}[]){for(let i=messages.length-1;i>=0;i--)if(messages[i].role==='assistant')return messages[i].text;return '';}
