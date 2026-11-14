package nl.vandijk.coach

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/** Protects the user-initiated, phone-local OAuth listener while Chrome is visible.
 * No credentials, public port, wake lock, sticky restart or startup at boot.
 */
class CoachChatAuthService:Service(){
 private val handler=Handler(Looper.getMainLooper())
 private val timeout=Runnable{CoachChatCallback.cancelAll();stopSelf()}
 private val monitor=object:Runnable{override fun run(){if(!CoachChatCallback.hasActiveListener())stopSelf() else handler.postDelayed(this,1000)}}
 override fun onCreate(){
  super.onCreate()
  val manager=getSystemService(NotificationManager::class.java)
  if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel(CHANNEL,"ChatGPT-aanmelding",NotificationManager.IMPORTANCE_LOW).apply{setShowBadge(false)})
  val back=PendingIntent.getActivity(this,14551,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val cancel=PendingIntent.getService(this,14552,Intent(this,CoachChatAuthService::class.java).setAction(CANCEL),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val notification=NotificationCompat.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_timer_notification).setContentTitle("ChatGPT koppelen").setContentText("Rond de aanmelding af in je browser").setContentIntent(back).setOngoing(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_SERVICE).addAction(0,"Annuleren",cancel).build()
  if(Build.VERSION.SDK_INT>=34)startForeground(NOTIFICATION,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(NOTIFICATION,notification)
  handler.postDelayed(monitor,1000)
 }
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  if(intent?.action==CANCEL){CoachChatCallback.cancelAll();stopSelf()}
  else if(!CoachChatCallback.hasActiveListener())stopSelf()
  else{handler.removeCallbacks(timeout);handler.postDelayed(timeout,600000)}
  return START_NOT_STICKY
 }
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onDestroy(){handler.removeCallbacksAndMessages(null);if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true);super.onDestroy()}
 companion object{private const val CHANNEL="vdcoach-chat-auth";private const val NOTIFICATION=14551;private const val CANCEL="nl.vandijk.coach.CANCEL_CHAT_AUTH"}
}
