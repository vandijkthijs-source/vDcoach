package nl.vandijk.coach;
import java.util.Arrays;
/** Allocation-free spatial-grid flock, independent of Android so it can be tested on the JVM. */
public final class CoachBoidField {
 public final int count;public final float[] x,y,vx,vy,radius;private final float[] ax,ay;private final int[] head=new int[130],next;private float time=0,energy=0;private long seed=421;
 private float random(){seed=(seed*1664525+1013904223L)&0xffffffffL;return (float)(seed/4294967296.0);}
 public CoachBoidField(int requested){count=Math.max(1,Math.min(640,requested));x=new float[count];y=new float[count];vx=new float[count];vy=new float[count];radius=new float[count];ax=new float[count];ay=new float[count];next=new int[count];for(int i=0;i<count;i++){double a=random()*Math.PI*2,r=Math.sqrt(random());x[i]=150+(float)(Math.cos(a)*96*r);y[i]=108+(float)(Math.sin(a)*64*r);vx[i]=(float)Math.cos(a+1.2)*18;vy[i]=(float)Math.sin(a+1.2)*18;radius[i]=.65f+random()*.95f;}}
 public void impulse(){energy=1;}
 private int gx(float value){return Math.max(0,Math.min(12,(int)Math.floor(value/24)));}private int gy(float value){return Math.max(0,Math.min(9,(int)Math.floor(value/24)));}
 public void step(float delta,int mode){float dt=Float.isFinite(delta)?Math.max(0,Math.min(.05f,delta)):0;if(dt==0)return;time+=dt;energy=Math.max(0,energy-dt*.9f);Arrays.fill(head,-1);for(int i=0;i<count;i++){int cell=gy(y[i])*13+gx(x[i]);next[i]=head[cell];head[cell]=i;}
  float tx=150+(float)Math.sin(time*.4)*17,ty=108+(float)Math.cos(time*.53)*10,speed=mode>0?42:27;
  for(int i=0;i<count;i++){float xi=x[i],yi=y[i],sx=0,sy=0,avx=0,avy=0,px=0,py=0;int cx=gx(xi),cy=gy(yi),found=0;
   for(int ry=Math.max(0,cy-1);ry<=Math.min(9,cy+1)&&found<48;ry++)for(int rx=Math.max(0,cx-1);rx<=Math.min(12,cx+1)&&found<48;rx++)for(int j=head[ry*13+rx];j!=-1&&found<48;j=next[j]){if(j==i)continue;float dx=x[j]-xi,dy=y[j]-yi,d2=dx*dx+dy*dy;if(d2<576){found++;avx+=vx[j];avy+=vy[j];px+=x[j];py+=y[j];if(d2<64){sx-=dx/(d2+1);sy-=dy/(d2+1);}}}
   float fx=sx*46+(tx-xi)*.17f-(yi-ty)*.09f,fy=sy*46+(ty-yi)*.17f+(xi-tx)*.09f;
   if(found>0){fx+=(avx/found-vx[i])*.75f+(px/found-xi)*.12f;fy+=(avy/found-vy[i])*.75f+(py/found-yi)*.12f;}
   float ex=(xi-150)/116,ey=(yi-108)/81,edge=ex*ex+ey*ey;if(edge>1){fx+=(150-xi)*(edge-1)*.8f;fy+=(108-yi)*(edge-1)*.8f;}
   ax[i]=fx+(xi-150)*energy*.32f;ay[i]=fy+(yi-108)*energy*.32f;
  }
  for(int i=0;i<count;i++){float ux=vx[i]+ax[i]*dt,uy=vy[i]+ay[i]*dt,length=(float)Math.hypot(ux,uy),limit=speed+energy*20;if(length>limit){ux=ux/length*limit;uy=uy/length*limit;}float xx=x[i]+ux*dt,yy=y[i]+uy*dt;if(xx<7||xx>293){xx=Math.max(7,Math.min(293,xx));ux*=-.6f;}if(yy<7||yy>213){yy=Math.max(7,Math.min(213,yy));uy*=-.6f;}x[i]=xx;y[i]=yy;vx[i]=ux;vy[i]=uy;}
 }
}
