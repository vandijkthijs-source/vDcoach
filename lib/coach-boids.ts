/** Bounded spatial-grid flock. Each step reads one velocity snapshot before moving particles. */
export class CoachBoids{
 readonly width=300;readonly height=220;readonly count:number;
 readonly x:Float32Array;readonly y:Float32Array;readonly vx:Float32Array;readonly vy:Float32Array;readonly radius:Float32Array;
 private ax:Float32Array;private ay:Float32Array;private head=new Int32Array(130);private next:Int32Array;private time=0;private energy=0;
 constructor(count=480){this.count=Math.max(1,Math.min(640,Number.isFinite(count)?Math.floor(count):480));const n=this.count;this.x=new Float32Array(n);this.y=new Float32Array(n);this.vx=new Float32Array(n);this.vy=new Float32Array(n);this.radius=new Float32Array(n);this.ax=new Float32Array(n);this.ay=new Float32Array(n);this.next=new Int32Array(n);let seed=421;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};for(let i=0;i<n;i++){const a=random()*Math.PI*2,r=Math.sqrt(random());this.x[i]=150+Math.cos(a)*96*r;this.y[i]=108+Math.sin(a)*64*r;this.vx[i]=Math.cos(a+1.2)*18;this.vy[i]=Math.sin(a+1.2)*18;this.radius[i]=.65+random()*.95;}}
 impulse(){this.energy=1;}
 step(delta:number,mode=0){const dt=Math.max(0,Math.min(.05,Number.isFinite(delta)?delta:0));if(!dt)return;this.time+=dt;this.energy=Math.max(0,this.energy-dt*.9);this.head.fill(-1);const n=this.count;
  for(let i=0;i<n;i++){const cx=Math.max(0,Math.min(12,Math.floor(this.x[i]/24))),cy=Math.max(0,Math.min(9,Math.floor(this.y[i]/24))),cell=cy*13+cx;this.next[i]=this.head[cell];this.head[cell]=i;}
  const tx=150+Math.sin(this.time*.4)*17,ty=108+Math.cos(this.time*.53)*10,speed=mode?42:27;
  for(let i=0;i<n;i++){const x=this.x[i],y=this.y[i],cx=Math.max(0,Math.min(12,Math.floor(x/24))),cy=Math.max(0,Math.min(9,Math.floor(y/24)));let sx=0,sy=0,avx=0,avy=0,px=0,py=0,found=0;
   for(let gy=Math.max(0,cy-1);gy<=Math.min(9,cy+1)&&found<48;gy++)for(let gx=Math.max(0,cx-1);gx<=Math.min(12,cx+1)&&found<48;gx++)for(let j=this.head[gy*13+gx];j!==-1&&found<48;j=this.next[j]){if(j===i)continue;const dx=this.x[j]-x,dy=this.y[j]-y,d2=dx*dx+dy*dy;if(d2<576){found++;avx+=this.vx[j];avy+=this.vy[j];px+=this.x[j];py+=this.y[j];if(d2<64){sx-=dx/(d2+1);sy-=dy/(d2+1);}}}
   let ax=sx*46+(tx-x)*.17-(y-ty)*.09,ay=sy*46+(ty-y)*.17+(x-tx)*.09;
   if(found){ax+=(avx/found-this.vx[i])*.75+(px/found-x)*.12;ay+=(avy/found-this.vy[i])*.75+(py/found-y)*.12;}
   const edge=((x-150)/116)**2+((y-108)/81)**2;if(edge>1){ax+=(150-x)*(edge-1)*.8;ay+=(108-y)*(edge-1)*.8;}
   ax+=(x-150)*this.energy*.32;ay+=(y-108)*this.energy*.32;this.ax[i]=ax;this.ay[i]=ay;
  }
  for(let i=0;i<n;i++){let vx=this.vx[i]+this.ax[i]*dt,vy=this.vy[i]+this.ay[i]*dt;const length=Math.hypot(vx,vy),limit=speed+this.energy*20;if(length>limit){vx=vx/length*limit;vy=vy/length*limit;}let x=this.x[i]+vx*dt,y=this.y[i]+vy*dt;if(x<7||x>293){x=Math.max(7,Math.min(293,x));vx*=-.6;}if(y<7||y>213){y=Math.max(7,Math.min(213,y));vy*=-.6;}this.x[i]=x;this.y[i]=y;this.vx[i]=vx;this.vy[i]=vy;}
 }
}
