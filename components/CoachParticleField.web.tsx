import React,{useEffect,useRef} from 'react';
import {CoachBoids} from '../lib/coach-boids';
import type {ParticleFieldProps} from './CoachParticleFallback';
export default function CoachParticleField(props:ParticleFieldProps){
 const canvas=useRef<HTMLCanvasElement>(null),field=useRef<CoachBoids|null>(null),latest=useRef(props),previousImpulse=useRef(props.impulse);latest.current=props;
 useEffect(()=>{const node=canvas.current,ctx=node?.getContext('2d');if(!node||!ctx)return;if(!field.current)field.current=new CoachBoids();const boids=field.current,ratio=Math.min(2,window.devicePixelRatio||1);node.width=300*ratio;node.height=220*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);let frame=0,last=0,alive=true;
  function draw(){ctx!.clearRect(0,0,300,220);for(let i=0;i<boids.count;i++){ctx!.fillStyle=latest.current.dark?'#c2dae4':'#577f94';ctx!.globalAlpha=.32+(i%7)/10;ctx!.beginPath();ctx!.arc(boids.x[i],boids.y[i],boids.radius[i],0,Math.PI*2);ctx!.fill();}ctx!.globalAlpha=1;}
  function tick(now:number){if(!alive||document.hidden)return;if(now-last>=32){if(!latest.current.paused){if(previousImpulse.current!==latest.current.impulse){boids.impulse();previousImpulse.current=latest.current.impulse;}boids.step(last?(now-last)/1000:1/30,latest.current.mode);}draw();last=now;}if(!latest.current.paused)frame=requestAnimationFrame(tick);}
  function resume(){cancelAnimationFrame(frame);last=0;draw();if(!document.hidden&&!latest.current.paused)frame=requestAnimationFrame(tick)}
  document.addEventListener('visibilitychange',resume);resume();return()=>{alive=false;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',resume)};
 },[props.paused,props.dark]);
 return React.createElement('canvas',{ref:canvas,'aria-hidden':true,style:{width:300,height:220,display:'block'}});
}
