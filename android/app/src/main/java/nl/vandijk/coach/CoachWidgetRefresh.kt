package nl.vandijk.coach

import android.app.job.*
import android.content.*
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.*
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Refresh and deliver durable native events. Only React acknowledges the local inbox. */
object CoachWidgetRefresh {
 private const val PERIODIC=22851
 private const val IMMEDIATE=22852
 private const val ALIAS="vdcoach-widget-connection"
 private val running=AtomicBoolean(false)
 private fun prefs(c:Context)=c.getSharedPreferences("coach_widget_refresh",Context.MODE_PRIVATE)
 private fun key():SecretKey {
  val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
  (store.getKey(ALIAS,null) as? SecretKey)?.let{return it}
  return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
   init(KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
  }.generateKey()
 }
 @Synchronized fun configure(c:Context,url:String,token:String){
  val parsed=URL(url);require(parsed.protocol in listOf("http","https")&&parsed.userInfo==null&&parsed.query==null&&parsed.ref==null&&(parsed.path==""||parsed.path=="/")&&token.length>=32)
  val p=prefs(c);var same=false
  runCatching{same=credentials(c)==Pair(url,token)}
  if(!same){val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());val data=cipher.doFinal(JSONObject().put("url",url).put("token",token).toString().toByteArray(Charsets.UTF_8));check(p.edit().putString("iv",Base64.encodeToString(cipher.iv,Base64.NO_WRAP)).putString("connection",Base64.encodeToString(data,Base64.NO_WRAP)).remove("baseline").remove("globalBaseline").commit())}
  schedule(c);if(!same)request(c)
 }
 private fun credentials(c:Context):Pair<String,String>{
  val p=prefs(c);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(p.getString("iv","")!!,Base64.NO_WRAP)))
  val body=JSONObject(String(cipher.doFinal(Base64.decode(p.getString("connection","")!!,Base64.NO_WRAP)),Charsets.UTF_8));return Pair(body.getString("url"),body.getString("token"))
 }
 fun schedule(c:Context){
  if(!prefs(c).contains("connection"))return
  val jobs=c.getSystemService(JobScheduler::class.java)
  if(jobs.getPendingJob(PERIODIC)==null)jobs.schedule(JobInfo.Builder(PERIODIC,ComponentName(c,CoachWidgetRefreshJob::class.java)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build())
 }
 fun request(c:Context){if(!prefs(c).contains("connection"))return;c.getSystemService(JobScheduler::class.java).schedule(JobInfo.Builder(IMMEDIATE,ComponentName(c,CoachWidgetRefreshJob::class.java)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setOverrideDeadline(15000).build())}
 private fun get(url:String,token:String,body:JSONObject?=null):JSONObject{
  val connection=URL(url).openConnection() as HttpURLConnection
  try{connection.connectTimeout=10000;connection.readTimeout=10000;connection.instanceFollowRedirects=false;connection.setRequestProperty("Authorization","Bearer $token");if(body!=null){connection.requestMethod="POST";connection.doOutput=true;connection.setRequestProperty("Content-Type","application/json");connection.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}};check(connection.responseCode==200);return connection.inputStream.bufferedReader().use{reader->val data=reader.readText();require(data.length<=8*1024*1024);JSONObject(data)}}finally{connection.disconnect()}
 }
 /** Compare JSON structurally; object key order must never turn a remote update into a conflict. */
 private fun same(a:Any?,b:Any?):Boolean{
  if(a is JSONObject&&b is JSONObject){val keys=a.keys().asSequence().toSet();return keys==b.keys().asSequence().toSet()&&keys.all{same(a.opt(it),b.opt(it))}}
  if(a is JSONArray&&b is JSONArray)return a.length()==b.length()&&(0 until a.length()).all{same(a.opt(it),b.opt(it))}
  return a==b
 }
 private fun merge(local:Any?,previous:Any?,remote:Any?):Any?{
  if(same(local,previous))return remote
  if(local is JSONObject&&remote is JSONObject){val result=JSONObject();val keys=local.keys().asSequence().toSet()+remote.keys().asSequence().toSet();for(k in keys){val v=merge(local.opt(k),(previous as? JSONObject)?.opt(k),remote.opt(k));if(v!=null)result.put(k,v)};return result}
  if(local is JSONArray&&remote is JSONArray){
   fun rows(a:JSONArray?)=(0 until (a?.length()?:0)).mapNotNull{a?.optJSONObject(it)}.associateBy{it.optString("id")}
   val l=rows(local);val r=rows(remote);val p=rows(previous as? JSONArray)
   if((l.keys+r.keys).any{it.isEmpty()})return local
   val result=JSONArray();for(id in r.keys+l.keys){val v=merge(l[id],p[id],r[id]);if(v!=null)result.put(v)};return result
  }
  return local
 }
 private fun agenda(day:JSONObject,date:String):JSONArray{
  val result=JSONArray((day.optJSONArray("diaryEntries")?:JSONArray()).toString());val removed=day.optJSONArray("removedDiaryIds")?:JSONArray();val excluded=(0 until removed.length()).map{removed.optString(it)}.toSet();val events=day.optJSONObject("plan")?.optJSONArray("appointments")?:JSONArray()
  val local=java.text.SimpleDateFormat("yyyy-MM-dd",java.util.Locale.ROOT).apply{timeZone=java.util.TimeZone.getTimeZone("Europe/Amsterdam")};val clock=java.text.SimpleDateFormat("HH:mm",java.util.Locale.ROOT).apply{timeZone=java.util.TimeZone.getTimeZone("Europe/Amsterdam")}
  fun parse(value:String):java.util.Date?{for(pattern in listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX","yyyy-MM-dd'T'HH:mm:ssXXX")){try{return java.text.SimpleDateFormat(pattern,java.util.Locale.ROOT).parse(value)}catch(_:Exception){}};return null}
  for(i in 0 until events.length()){val a=events.getJSONObject(i);val key="agenda-"+a.optString("id");if(key in excluded||(0 until result.length()).any{result.getJSONObject(it).optString("id")==key||result.getJSONObject(it).optString("appointmentId")==a.optString("id")})continue
   val start=parse(a.optString("start"));val end=parse(a.optString("end"));val all=a.optBoolean("allDay");result.put(JSONObject().put("id",key).put("appointmentId",a.optString("id")).put("text",a.optString("title")).put("done",false).put("allDay",all).put("startTime",if(start!=null&&local.format(start)==date)clock.format(start) else "06:00").put("endTime",if(end!=null&&local.format(end)==date)clock.format(end) else "24:00").put("note",a.optString("note")))}
  val visible=JSONArray();for(i in 0 until result.length())if(result.getJSONObject(i).optString("id") !in excluded)visible.put(result.getJSONObject(i));return visible
 }
 fun refresh(c:Context):Boolean{
  if(!running.compareAndSet(false,true))return true
  try{
   val (url,token)=credentials(c)
   val actions=CoachWidgetStore.actions(c);val timers=CoachTimerStore.snapshot(c).optJSONArray("completed")?:JSONArray()
   if(actions.length()>0||timers.length()>0)get(url+"/widget-events",token,JSONObject().put("actions",actions).put("timers",timers))
   val state=get(url+"/state",token).getJSONObject("state")
   val register=get(url+"/applications",token).getJSONArray("applications")
   synchronized(CoachWidgetStore){
    val current=CoachWidgetStore.state(c)
    val oldGlobals=JSONObject(prefs(c).getString("globalBaseline","{}")!!);val globals=JSONObject()
    for(field in listOf("projects","planningEnd")){if(state.has(field)){val value=merge(current.opt(field),oldGlobals.opt(field),state.opt(field));if(value!=null)current.put(field,value);globals.put(field,state.opt(field))}}
    val date=CoachWidgetStore.today();val remote=state.optJSONObject("days")?.optJSONObject(date)?:JSONObject().put("date",date).put("tasks",JSONArray()).put("foodEntries",JSONArray())
    val incoming=JSONObject().put("date",date).put("closed",remote.optBoolean("closed")).put("energy",remote.optString("energy","normal")).put("focusChoices",remote.optJSONArray("focusChoices")?:JSONArray()).put("tasks",remote.optJSONArray("tasks")?:JSONArray()).put("foodEntries",remote.optJSONArray("foodEntries")?:JSONArray()).put("diaryEntries",agenda(remote,date)).put("removedDiaryIds",remote.optJSONArray("removedDiaryIds")?:JSONArray())
    val before=JSONObject(prefs(c).getString("baseline","{}")!!);val old=current.optJSONObject("days")?.optJSONObject(date)?:JSONObject()
    val baseline=if(before.optString("date")==date)before else JSONObject()
    val merged=merge(old,baseline,incoming) as JSONObject
    val days=current.optJSONObject("days")?:JSONObject();days.put(date,merged)
    val serverDays=state.optJSONObject("days")?:JSONObject();for(d in serverDays.keys()){if(!days.has(d)){val other=serverDays.getJSONObject(d);other.put("diaryEntries",agenda(other,d));days.put(d,other)}}
    current.put("days",days)
    val protected=current.optJSONArray("protectedApplicationIds")?:JSONArray();val protectedIds=(0 until protected.length()).map{protected.optString(it)}.toSet()
    val existing=current.optJSONObject("applications")?.optJSONArray("items")?:JSONArray();val items=JSONArray()
    for(i in 0 until register.length()){val a=register.getJSONObject(i);if(a.getString("id") in protectedIds)continue
     val status=a.getString("status");val item=JSONObject().put("id",a.getString("id")).put("company",a.getString("company")).put("role",a.getString("role")).put("status",status).put("stage",if(Regex("afgewezen|afwijzing|afgesloten|ingetrokken|niet geselecteerd",RegexOption.IGNORE_CASE).containsMatchIn(status))"closed" else if(Regex("uitgenodigd|gesprek bevestigd",RegexOption.IGNORE_CASE).containsMatchIn(status))"interview" else "waiting").put("nextAction",a.optString("nextAction").ifEmpty{"Wacht op een nieuwe reactie."}).put("note",listOf(a.optString("notes"),a.optString("evidence")).filter{it.isNotEmpty()}.joinToString("\n").take(4000));if(a.optString("nextActionDate").isNotEmpty())item.put("actionDate",a.getString("nextActionDate"));items.put(item)}
    for(i in 0 until existing.length()){val a=existing.getJSONObject(i);if(a.optString("id") in protectedIds)items.put(a)}
    current.put("applications",JSONObject().put("updatedAt",java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.ROOT).apply{timeZone=java.util.TimeZone.getTimeZone("UTC")}.format(java.util.Date())).put("items",items))
    CoachWidgetStore.publish(c,current,emptySet());prefs(c).edit().putString("baseline",incoming.toString()).putString("globalBaseline",globals.toString()).putLong("lastSuccess",System.currentTimeMillis()).apply()
   }
   CoachWidgets.update(c);return true
  }catch(_:Exception){return false}finally{running.set(false)}
 }
}
class CoachWidgetRefreshJob:JobService(){
 override fun onStartJob(params:JobParameters):Boolean{Thread{val success=CoachWidgetRefresh.refresh(applicationContext);jobFinished(params,!success)}.start();return true}
 override fun onStopJob(params:JobParameters)=true
}
