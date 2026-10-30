export type ClockStage='hour'|'minute';
export function clockSelection(x:number,y:number,stage:ClockStage):number|null {
 const dx=x-140,dy=y-140;
 // A touch very close to the pivot has no reliable direction.
 if(Math.hypot(dx,dy)<16)return null;
 const angle=(Math.atan2(dx,-dy)+Math.PI*2)%(Math.PI*2);
 if(stage==='minute')return Math.round(angle/(Math.PI/30))%60;
 const n=Math.round(angle/(Math.PI/6))%12;
 return Math.hypot(dx,dy)<83?(n===0?0:n+12):(n===0?12:n);
}
