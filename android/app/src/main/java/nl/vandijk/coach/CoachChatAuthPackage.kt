package nl.vandijk.coach

import android.net.Uri
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.net.InetAddress
import java.net.ServerSocket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** One short-lived OAuth callback, bound only to this phone's loopback address. */
object CoachChatCallback {
 data class Attempt(val server:ServerSocket,val expires:Long,val ready:CountDownLatch=CountDownLatch(1),@Volatile var state:String="",@Volatile var result:String?=null,@Volatile var error:String?=null)
 private val attempts=ConcurrentHashMap<String,Attempt>()
 fun open(context:Context):String {
  attempts.keys.toList().forEach{cancel(it)}
  val server=ServerSocket(0,4,InetAddress.getByName("127.0.0.1"));server.soTimeout=1000
  val id=UUID.randomUUID().toString();val a=Attempt(server,System.currentTimeMillis()+600000);attempts[id]=a
  try{ContextCompat.startForegroundService(context,Intent(context,CoachChatAuthService::class.java))}catch(e:Exception){attempts.remove(id);server.close();throw e}
  Thread({
   try {
    while(System.currentTimeMillis()<a.expires&&a.result==null&&!server.isClosed){
     try{server.accept().use{socket->
      try{
      socket.soTimeout=3000
      val input=socket.getInputStream();val bytes=java.io.ByteArrayOutputStream()
      var end=0
      while(bytes.size()<16000&&end<4){val n=input.read();if(n<0)break;bytes.write(n);end=when{end==0&&n==13->1;end==1&&n==10->2;end==2&&n==13->3;end==3&&n==10->4;else->0}}
      val request=bytes.toString("UTF-8");val first=request.lineSequence().firstOrNull()?.split(" ")?:emptyList()
      val uri=if(first.size==3&&first[0]=="GET")Uri.parse("http://127.0.0.1"+first[1]) else null
      val host=request.lineSequence().find{it.startsWith("Host:",true)}?.substringAfter(':')?.trim()
      val valid=uri!=null&&uri.path=="/auth/callback"&&host=="127.0.0.1:${server.localPort}"&&a.state.isNotEmpty()&&uri.getQueryParameter("state")==a.state
      if(valid){
       val result=JSONObject().put("state",uri!!.getQueryParameter("state"))
       for((source,target) in listOf("code" to "code","client_id" to "clientId","error" to "error")){uri.getQueryParameter(source)?.let{result.put(target,it)}}
       a.result=result.toString();a.ready.countDown()
      }
      val html=if(valid)"<!doctype html><html lang=nl><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>vDcoach</title><h2>Aanmelding ontvangen</h2><p>Ga terug naar vDcoach om verder te gaan.</p><p><a href='vdcoach:///'>Terug naar vDcoach</a></p></html>" else "Ongeldige callback. Ga terug naar vDcoach."
      val body=html.toByteArray(Charsets.UTF_8);val headers="HTTP/1.1 ${if(valid)"200 OK" else "400 Bad Request"}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.size}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'\r\nConnection: close\r\n\r\n"
      socket.getOutputStream().apply{write(headers.toByteArray());write(body);flush()}
      }catch(_:Exception){/* A browser preconnect or disconnected probe must not stop the listener. */}
     }}catch(_:java.net.SocketTimeoutException){continue}
    }
   }catch(_:Exception){if(a.result==null)a.error="Aanmelding onderbroken. Probeer opnieuw."}
   finally{runCatching{server.close()};if(a.result==null&&a.error==null)a.error="Aanmelding verlopen. Probeer opnieuw.";a.ready.countDown()
   }
  },"vdcoach-oauth-loopback").apply{isDaemon=true;start()}
  return JSONObject().put("id",id).put("redirectUri","http://127.0.0.1:${server.localPort}/auth/callback").toString()
 }
 fun waitFor(id:String,state:String,p:Promise){
  val a=attempts[id];if(a==null){p.reject("CHAT_AUTH","Start de ChatGPT-aanmelding opnieuw.");return};a.state=state
  Thread({try{a.ready.await(610,TimeUnit.SECONDS);val result=a.result;if(result!=null)p.resolve(result) else p.reject("CHAT_AUTH",a.error?:"Aanmelding verlopen.")}finally{attempts.remove(id);runCatching{a.server.close()}}},"vdcoach-oauth-result").apply{isDaemon=true;start()}
 }
 fun cancelAll(){attempts.keys.toList().forEach{cancel(it)}}
 fun hasActiveListener()=attempts.values.any{!it.server.isClosed}
 fun cancel(id:String){attempts.remove(id)?.let{it.error="Aanmelding geannuleerd.";runCatching{it.server.close()};it.ready.countDown()}}
}
class CoachChatAuthModule(c:ReactApplicationContext):ReactContextBaseJavaModule(c){
 override fun getName()="CoachChatAuth"
 @ReactMethod fun openLoopback(p:Promise){try{p.resolve(CoachChatCallback.open(reactApplicationContext))}catch(_:Exception){p.reject("CHAT_AUTH","De lokale aanmelding kon niet worden gestart.")}}
 @ReactMethod fun waitForCallback(id:String,state:String,p:Promise){CoachChatCallback.waitFor(id,state,p)}
 @ReactMethod fun cancel(id:String){CoachChatCallback.cancel(id)}
}
class CoachChatAuthPackage:ReactPackage{
 override fun createNativeModules(c:ReactApplicationContext):List<NativeModule> = listOf(CoachChatAuthModule(c))
 override fun createViewManagers(c:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
