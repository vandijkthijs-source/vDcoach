package nl.vandijk.coach
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.annotations.ReactProp

class CoachBoidsView(private val reactContext:ThemedReactContext):View(reactContext),LifecycleEventListener{
 private val flock=CoachBoidField(480)
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
 private var paused=true;private var hostActive=true;private var mode=0;private var last=0L;private var scheduled=false;private var impulse=0;private var dark=true
 private val frame=object:Runnable{override fun run(){scheduled=false;if(!canRun())return;val now=System.nanoTime();if(last==0L||now-last>=32_000_000){flock.step(if(last==0L)1f/30 else ((now-last)/1e9).toFloat(),mode);last=now;invalidate()};schedule()}}
 init{reactContext.addLifecycleEventListener(this)}
 private fun canRun()=!paused&&hostActive&&isAttachedToWindow&&windowVisibility==VISIBLE&&visibility==VISIBLE
 private fun schedule(){if(!scheduled&&canRun()){scheduled=true;postOnAnimation(frame)}}
 private fun stop(){removeCallbacks(frame);scheduled=false;last=0}
 fun setPaused(value:Boolean){paused=value;if(value)stop() else schedule();invalidate()}
 fun setMode(value:Int){mode=value.coerceIn(0,3)}
 fun setDark(value:Boolean){dark=value;invalidate()}
 fun setImpulse(value:Int){if(impulse!=value){impulse=value;flock.impulse()}}
 override fun onAttachedToWindow(){super.onAttachedToWindow();schedule()}
 override fun onDetachedFromWindow(){stop();super.onDetachedFromWindow()}
 override fun onWindowVisibilityChanged(value:Int){super.onWindowVisibilityChanged(value);if(value==VISIBLE)schedule() else stop()}
 override fun onHostResume(){hostActive=true;schedule()}
 override fun onHostPause(){hostActive=false;stop()}
 override fun onHostDestroy(){stop()}
 fun dispose(){stop();reactContext.removeLifecycleEventListener(this)}
 override fun onDraw(canvas:Canvas){super.onDraw(canvas);val scale=minOf(width/300f,height/220f);if(scale<=0)return;canvas.save();canvas.translate((width-300*scale)/2,(height-220*scale)/2);canvas.scale(scale,scale);paint.color=if(dark)Color.rgb(194,218,228) else Color.rgb(87,127,148);for(i in 0 until flock.count){paint.alpha=(82+(i%7)*25).coerceAtMost(255);canvas.drawCircle(flock.x[i],flock.y[i],flock.radius[i],paint)};canvas.restore()}
}
class CoachBoidsManager:SimpleViewManager<CoachBoidsView>(){
 override fun getName()="CoachBoids"
 override fun createViewInstance(context:ThemedReactContext)=CoachBoidsView(context)
 @ReactProp(name="paused",defaultBoolean=true) fun paused(view:CoachBoidsView,value:Boolean)=view.setPaused(value)
 @ReactProp(name="dark",defaultBoolean=true) fun dark(view:CoachBoidsView,value:Boolean)=view.setDark(value)
 @ReactProp(name="mode",defaultInt=0) fun mode(view:CoachBoidsView,value:Int)=view.setMode(value)
 @ReactProp(name="impulse",defaultInt=0) fun impulse(view:CoachBoidsView,value:Int)=view.setImpulse(value)
 override fun onDropViewInstance(view:CoachBoidsView){view.dispose();super.onDropViewInstance(view)}
}
class CoachBoidsPackage:ReactPackage{
 override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = emptyList()
 override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = listOf(CoachBoidsManager())
}
