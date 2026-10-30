package nl.vandijk.coach

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** All native changes are committed before notifying React, including a stop with JS absent. */
object CoachTimerStore {
 private fun prefs(c: Context) = c.getSharedPreferences("coach_timer", Context.MODE_PRIVATE)
 @Synchronized fun snapshot(c: Context): JSONObject = JSONObject(prefs(c).getString("state", null) ?: "{\"active\":null,\"completed\":[]}")
 private fun save(c: Context, state: JSONObject) { check(prefs(c).edit().putString("state", state.toString()).commit()) { "Timer kon niet worden opgeslagen" } }
 @Synchronized fun start(c: Context, title: String): JSONObject {
  val state = snapshot(c)
  check(state.isNull("active")) { "Er loopt al een timer" }
  state.put("active", JSONObject().put("id", UUID.randomUUID().toString()).put("title", title.trim().take(300).ifEmpty { "Activiteit" }).put("startedAt", System.currentTimeMillis()))
  save(c, state); return state
 }
 @Synchronized fun rollback(c: Context, id: String) { val state = snapshot(c); if(state.optJSONObject("active")?.optString("id") == id) { state.put("active", JSONObject.NULL); save(c,state) } }
 @Synchronized fun stop(c: Context): JSONObject {
  val state = snapshot(c); val active = state.optJSONObject("active") ?: return state
  val completed = state.getJSONArray("completed")
  active.put("stoppedAt", maxOf(System.currentTimeMillis(), active.getLong("startedAt") + 1))
  completed.put(active); state.put("active", JSONObject.NULL); save(c,state); return state
 }
 @Synchronized fun acknowledge(c: Context, ids: Set<String>) {
  val state = snapshot(c); val old = state.getJSONArray("completed"); val keep = JSONArray()
  for (i in 0 until old.length()) { val row = old.getJSONObject(i); if(!ids.contains(row.getString("id"))) keep.put(row) }
  state.put("completed",keep); save(c,state)
 }
}

class CoachTimerService: Service() {
 companion object { const val STOP = "nl.vandijk.coach.STOP_TIMER"; const val CHANNEL = "activity_timer"; const val NOTIFICATION = 1401 }
 private val handler = Handler(Looper.getMainLooper())
 private var builder: NotificationCompat.Builder? = null
 private var startedAt = 0L
 private fun elapsedText(): String {
  val seconds = maxOf(0L,(System.currentTimeMillis()-startedAt)/1000)
  return String.format(java.util.Locale.ROOT,"%02d:%02d:%02d",seconds/3600,(seconds/60)%60,seconds%60)
 }
 private val tick = object: Runnable {
  override fun run() {
   builder?.let { getSystemService(NotificationManager::class.java).notify(NOTIFICATION,it.setContentText(elapsedText()).build()) }
   handler.postDelayed(this,1000)
  }
 }
 override fun onBind(intent: Intent?) = null
 override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
  if(intent?.action == STOP) { CoachTimerStore.stop(this); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY }
  val active = CoachTimerStore.snapshot(this).optJSONObject("active")
  if(active == null) { stopSelf(); return START_NOT_STICKY }
  val manager = getSystemService(NotificationManager::class.java)
  if(Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL,"Activiteitentimer",NotificationManager.IMPORTANCE_LOW).apply { description="Lopende activiteit met timer en stopknop"; setShowBadge(false) })
  val open = PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val stop = PendingIntent.getService(this,1,Intent(this,CoachTimerService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  startedAt=active.getLong("startedAt")
  builder = NotificationCompat.Builder(this,CHANNEL)
   .setSmallIcon(R.drawable.ic_timer_notification).setContentTitle(active.getString("title"))
   .setContentText(elapsedText())
   .setWhen(startedAt).setUsesChronometer(false).setShowWhen(false)
   .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
   .setOngoing(true).setOnlyAlertOnce(true).setCategory("stopwatch")
   .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setContentIntent(open)
   .addAction(android.R.drawable.ic_media_pause,"Stop en bewaar",stop)
   .addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing",true) })
  val notification=builder!!.build()
  if(Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(NOTIFICATION,notification)
  handler.removeCallbacks(tick); handler.postDelayed(tick,1000)
  return START_STICKY
 }
 override fun onDestroy() { handler.removeCallbacks(tick);builder=null;stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy() }
}

class CoachTimerModule(private val context: ReactApplicationContext): ReactContextBaseJavaModule(context) {
 override fun getName() = "CoachTimer"
 @ReactMethod fun snapshot(promise: Promise) { try { promise.resolve(CoachTimerStore.snapshot(context).toString()) } catch(e: Exception) { promise.reject("TIMER",e.message,e) } }
 @ReactMethod fun start(title: String, promise: Promise) {
  var activeId: String? = null
  try {
   if(Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) throw IllegalStateException("Sta meldingen toe om de timer buiten de app te zien")
   if(!androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()) throw IllegalStateException("Zet meldingen voor vDcoach aan in je telefooninstellingen")
   val state = CoachTimerStore.start(context,title); activeId=state.getJSONObject("active").getString("id")
   ContextCompat.startForegroundService(context,Intent(context,CoachTimerService::class.java))
   promise.resolve(state.toString())
  } catch(e: Exception) { activeId?.let { CoachTimerStore.rollback(context,it) }; promise.reject("TIMER",e.message,e) }
 }
 @ReactMethod fun stop(promise: Promise) { try { val state=CoachTimerStore.stop(context);context.stopService(Intent(context,CoachTimerService::class.java));promise.resolve(state.toString()) } catch(e: Exception) { promise.reject("TIMER",e.message,e) } }
 @ReactMethod fun acknowledge(ids: ReadableArray,promise: Promise) { try { CoachTimerStore.acknowledge(context,(0 until ids.size()).mapNotNull { ids.getString(it) }.toSet());promise.resolve(null) } catch(e: Exception) { promise.reject("TIMER",e.message,e) } }
}
class CoachTimerPackage: ReactPackage {
 override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(CoachTimerModule(context))
 override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
