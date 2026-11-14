package nl.vandijk.coach

import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.os.*
import android.Manifest
import androidx.core.content.ContextCompat
import org.json.*
import java.text.SimpleDateFormat
import java.util.*

/** Deterministic, offline recommendations. Suggestions are never written to the calendar automatically. */
object CoachFocusEngine {
 private fun minute(value:String):Int? {if(!Regex("[0-2][0-9]:[0-5][0-9]").matches(value))return null;return value.take(2).toInt()*60+value.takeLast(2).toInt()}
 fun clock(n:Int)=String.format(Locale.ROOT,"%02d:%02d",n/60,n%60)
 fun plan(c:Context,date:String=CoachWidgetStore.today(),now:Long=System.currentTimeMillis()):JSONObject{
  val day=CoachPlanner.day(c,date);val calendar=Calendar.getInstance(TimeZone.getTimeZone("Europe/Amsterdam")).apply{timeInMillis=now};val start=calendar.get(Calendar.HOUR_OF_DAY)*60+calendar.get(Calendar.MINUTE);val end=minute(CoachWidgetStore.state(c).optString("planningEnd","22:00"))?:1320
  val rows=day.optJSONArray("tasks")?:JSONArray();val entries=day.optJSONArray("diaryEntries")?:JSONArray();val diary=(0 until entries.length()).map{entries.getJSONObject(it)}
  val projects=CoachWidgetStore.state(c).optJSONArray("projects")?:JSONArray()
  fun due(t:JSONObject):String{if(t.optString("dueDate").isNotEmpty())return t.optString("dueDate");return (0 until projects.length()).map{projects.getJSONObject(it)}.find{it.optString("id")==t.optString("projectId")}?.optString("deadline")?:""}
  val next=Calendar.getInstance().apply{time=SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).parse(date)!!;add(Calendar.DAY_OF_MONTH,1)};val tomorrow=SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(next.time)
  fun rank(t:JSONObject):Int{val d=due(t);return if(d.isNotEmpty()&&d<=date)0 else if(d==tomorrow)10 else if(t.optBoolean("priority"))20 else 30}
  val choices=day.optJSONArray("focusChoices")?:JSONArray();val snoozed=(0 until choices.length()).map{choices.getJSONObject(it)}.filter{it.optLong("until")>now}.map{it.optString("id")}.toSet()
  val tasks=(0 until rows.length()).map{rows.getJSONObject(it)}.filter{it.optString("category")=="Task"&&!it.optBoolean("done")&&it.optString("status")!="parked"&&(it.optString("status")!="waiting"||(it.optString("waitingUntil").isNotEmpty()&&it.optString("waitingUntil")<=date))&&it.optString("id") !in snoozed}.sortedWith(compareBy<JSONObject>{rank(it)}.thenBy{due(it).ifEmpty{"9999"}}.thenByDescending{it.optInt("rollovers")})
  data class Block(val entry:JSONObject,val start:Int,val end:Int)
  val intervals=diary.filter{!it.optBoolean("done")&&!it.optBoolean("allDay")}.mapNotNull{e->val a=minute(e.optString("startTime"));val b=minute(e.optString("endTime"));if(a!=null&&b!=null&&b>a&&b>start)Block(e,a,b) else null}.sortedBy{it.start}
  val busy=intervals.find{it.entry.optString("taskId").isEmpty()&&it.start<=start&&it.end>start};val owned=intervals.find{it.entry.optString("taskId").isNotEmpty()&&it.start<=start&&it.end>start&&tasks.any{t->t.optString("id")==it.entry.optString("taskId")}};val fixed=intervals.filter{!it.entry.optString("id").startsWith("focus-plan-")};val appointment=intervals.find{it.entry.optString("appointmentId").isNotEmpty()}
  val gaps=mutableListOf<Pair<Int,Int>>();var cursor=maxOf(360,start)
  for(b in fixed){if(b.start>cursor)gaps.add(cursor to minOf(end,b.start-5));cursor=maxOf(cursor,b.end);if(cursor>=end)break};if(cursor<end)gaps.add(cursor to end)
  val windows=gaps.filter{it.second-it.first>=10}.toMutableList();val current=windows.find{it.first<=start+1};val available=if(owned!=null&&busy==null)owned.end-start else if(current!=null)current.second-start else 0
  fun remaining(t:JSONObject):Int{val seconds=diary.filter{it.optString("taskId")==t.optString("id")&&it.optBoolean("done")}.sumOf{it.optDouble("focusSeconds",0.0)};return maxOf(0,kotlin.math.ceil((if(t.optInt("minutes")>0)t.optInt("minutes") else 25)-seconds/60).toInt())}
  val target=when(day.optString("energy")){"low"->25;"high"->60;else->45};val result=JSONObject().put("date",date).put("availableMinutes",available)
  if(busy!=null)result.put("busy",busy.entry);if(appointment!=null)result.put("appointment",appointment.entry)
  val focus=tasks.find{it.optString("id")==owned?.entry?.optString("taskId")}?:tasks.firstOrNull();if(focus!=null&&busy==null&&available>=10&&!day.optBoolean("closed")&&date==CoachWidgetStore.today()){
   val d=due(focus);result.put("focus",JSONObject().put("task",focus).put("reason",if(remaining(focus)==0)"Je hebt de geschatte tijd besteed. Controleer of de taak klaar is." else if(d.isNotEmpty()&&d<=date)"Deadline vandaag of verstreken." else if(d==tomorrow)"Morgen belangrijk." else if(focus.optBoolean("priority"))"Een van je prioriteiten vandaag." else if(focus.optInt("rollovers")>=3)"Al vaker doorgeschoven. Kies bewust een stap." else "Een concrete volgende stap.").put("blockMinutes",minOf(target,(if(remaining(focus)>0)remaining(focus) else 10),available)).put("remainingMinutes",remaining(focus)).put("estimated",focus.optInt("minutes")==0))
  }
  val nextTasks=JSONArray();tasks.filter{it.optString("id")!=result.optJSONObject("focus")?.optJSONObject("task")?.optString("id")}.take(2).forEach{nextTasks.put(JSONObject(it.toString()).put("remainingMinutes",remaining(it)))};result.put("next",nextTasks)
  val slots=JSONArray();for(t in tasks.take(3)){val gap=windows.indexOfFirst{it.second-it.first>=10};if(gap<0)break;val window=windows[gap];val amount=minOf(target,(if(remaining(t)>0)remaining(t) else 10),window.second-window.first);slots.put(JSONObject().put("id","focus-plan-"+t.optString("id")+diary.count{it.optString("taskId")==t.optString("id")&&it.optBoolean("done")&&it.optString("id").startsWith("focus-plan-")}.let{if(it>0)"_$it" else ""}).put("taskId",t.optString("id")).put("title",t.optString("shortTitle",t.optString("title"))).put("startTime",clock(window.first)).put("endTime",clock(window.first+amount)).put("minutes",amount));windows[gap]=(window.first+amount+5) to window.second};result.put("slots",slots)
  val capacity=gaps.filter{it.second-it.first>=10}.sumOf{it.second-it.first};val overflow=maxOf(0,tasks.sumOf{remaining(it)}-capacity);result.put("overflow",overflow)
  result.put("message",if(day.optBoolean("closed"))"Dag afgesloten. Je voortgang is bewaard." else if(busy!=null)"Er staat nu iets gepland." else if(tasks.isEmpty()){if((0 until rows.length()).any{rows.getJSONObject(it).optString("category")=="Task"&&!rows.getJSONObject(it).optBoolean("done")})"Geen uitvoerbare taak klaar. Je open taken blijven onder Wachten, Later of tijdelijk opzijgezet bewaard." else if((0 until rows.length()).any{rows.getJSONObject(it).optString("category")=="Task"})"Taken afgerond. Ruimte voor de rest van je dag." else "Nog geen taken. Voeg bewust een volgende stap toe."} else if(start>=end)"De dag loopt af. Bewaar wat telt en kies wat later kan." else if(available<10)"Nu geen rustig werkblok. Bekijk wat hierna past." else if(overflow>0)"Je open werk past niet helemaal in de resterende ruimte." else "Een haalbare volgende stap, met ruimte om bij te sturen.")
  return result
 }
}

/** Focus sessions use the existing durable activity timer; stopping records time, never task completion. */
object CoachFocusStore {
 private fun prefs(c:Context)=c.getSharedPreferences("coach_focus",Context.MODE_PRIVATE)
 fun session(c:Context):JSONObject?=prefs(c).getString("session",null)?.let{JSONObject(it)}
 private fun save(c:Context,s:JSONObject?){prefs(c).edit().apply{if(s==null)remove("session") else putString("session",s.toString())}.commit()}
 fun snapshot(c:Context):JSONObject{val s=session(c);val active=CoachTimerStore.snapshot(c).optJSONObject("active");if(s!=null&&s.optString("status")=="running"&&(active==null||active.optString("focusSessionId")!=s.optString("id"))){val completed=CoachTimerStore.snapshot(c).optJSONArray("completed")?:JSONArray();val last=(0 until completed.length()).map{completed.getJSONObject(it)}.find{it.optString("focusSessionId")==s.optString("id")&&it.optLong("startedAt")==s.optLong("startedAt")};if(last!=null)s.put("elapsed",s.optLong("elapsed")+maxOf(0L,last.optLong("stoppedAt")-last.optLong("startedAt")));s.put("status","review");save(c,s)};return JSONObject().put("session",s?:JSONObject.NULL).put("active",active?:JSONObject.NULL)}
 fun start(c:Context,taskId:String,minutes:Int){
  check(ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED||Build.VERSION.SDK_INT<33){"Sta meldingen toe om focus buiten de app te zien"}
  check(androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled()){"Zet meldingen voor vDcoach aan"}
  val date=CoachWidgetStore.today();check(!CoachPlanner.day(c,date).optBoolean("closed")){"Deze dag is afgesloten"}
  val tasks=CoachPlanner.day(c,date).optJSONArray("tasks")?:JSONArray();val task=(0 until tasks.length()).map{tasks.getJSONObject(it)}.find{it.optString("id")==taskId&&!it.optBoolean("done")&&it.optString("status")!="parked"&&(it.optString("status")!="waiting"||(it.optString("waitingUntil").isNotEmpty()&&it.optString("waitingUntil")<=date))};check(task!=null){"Deze taak is niet meer open. Ververs het overzicht."}
  val advice=CoachFocusEngine.plan(c);check(advice.optJSONObject("busy")==null&&advice.optInt("availableMinutes")>=10){"Je beschikbare tijd is veranderd. Bekijk eerst je dag of herplan."}
  val old=session(c);check(old==null||old.optString("taskId")==taskId){"Rond eerst je vorige focussessie af"}
  val s=(if(old?.optString("status")=="review")null else old)?:JSONObject().put("id",UUID.randomUUID().toString()).put("taskId",taskId).put("date",date).put("title",task.optString("shortTitle",task.optString("title"))).put("minutes",minOf(minutes.coerceIn(1,120),advice.getInt("availableMinutes"))).put("elapsed",0L)
  val remainingBlock=s.optInt("minutes")-s.optLong("elapsed")/60000
  check(s.optString("status")!="paused"||remainingBlock<=advice.optInt("availableMinutes")){"Er past nu een korter blok. Kies Stop & bewaren en herplan."}
  check(s.optString("date")==date){"Rond eerst de focussessie van gisteren af"}
  val timer=CoachTimerStore.start(c,s.getString("title"),taskId,s.getInt("minutes"),s.getString("id"));val active=timer.getJSONObject("active")
  try{ContextCompat.startForegroundService(c,Intent(c,CoachTimerService::class.java))}catch(e:Exception){CoachTimerStore.rollback(c,active.getString("id"));throw e}
  s.put("status","running").put("startedAt",active.getLong("startedAt"));save(c,s);CoachWidgets.update(c)
 }
 fun pause(c:Context,review:Boolean=false){val s=session(c)?:return;val active=CoachTimerStore.snapshot(c).optJSONObject("active");if(active?.optString("focusSessionId")==s.optString("id")){CoachTimerStore.stop(c);c.stopService(Intent(c,CoachTimerService::class.java));s.put("elapsed",s.optLong("elapsed")+maxOf(0L,System.currentTimeMillis()-active.getLong("startedAt")))};s.put("status",if(review)"review" else "paused");save(c,s);CoachWidgets.update(c)}
 fun finish(c:Context,outcome:String){val s=session(c)?:return;pause(c,true);if(outcome=="done")CoachWidgetStore.enqueue(c,JSONObject().put("kind","task").put("date",s.getString("date")).put("taskId",s.getString("taskId")).put("done",true));save(c,null);CoachWidgets.update(c)}
 fun skip(c:Context,taskId:String){CoachWidgetStore.enqueue(c,JSONObject().put("kind","focus-skip").put("date",CoachWidgetStore.today()).put("taskId",taskId).put("until",System.currentTimeMillis()+60*60*1000));CoachWidgets.update(c)}
 fun energy(c:Context,value:String){require(value in listOf("low","normal","high"));CoachWidgetStore.enqueue(c,JSONObject().put("kind","check-in").put("date",CoachWidgetStore.today()).put("energy",value));CoachWidgets.update(c)}
 fun accept(c:Context,slots:JSONArray,date:String=CoachWidgetStore.today()){
  check(date==CoachWidgetStore.today()){ "De dag is veranderd. Maak een nieuw voorstel." };val day=CoachPlanner.day(c,date);check(!day.optBoolean("closed")){"Deze dag is afgesloten"}
  val entries=day.optJSONArray("diaryEntries")?:JSONArray();val tasks=day.optJSONArray("tasks")?:JSONArray();val cal=Calendar.getInstance(TimeZone.getTimeZone("Europe/Amsterdam"));val now=cal.get(Calendar.HOUR_OF_DAY)*60+cal.get(Calendar.MINUTE)
  fun time(value:String):Int{require(Regex("(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00").matches(value));return value.take(2).toInt()*60+value.takeLast(2).toInt()}
  for(i in 0 until slots.length()){val s=slots.getJSONObject(i);val start=time(s.getString("startTime"));val end=time(s.getString("endTime"));check(start>=now-5&&end>start&&end<=1440){"Dit voorstel is verouderd. Herplan opnieuw."};check((0 until tasks.length()).any{val t=tasks.getJSONObject(it);t.optString("id")==s.optString("taskId")&&!t.optBoolean("done")}){"Een taak is veranderd. Herplan opnieuw."}
   for(j in 0 until entries.length()){val e=entries.getJSONObject(j);if(e.optBoolean("done")||e.optBoolean("allDay")||e.optString("id").startsWith("focus-plan-")||e.optString("startTime").isEmpty()||e.optString("endTime").isEmpty())continue;check(start>=time(e.getString("endTime"))||end<=time(e.getString("startTime"))){"Een afspraak is veranderd. Herplan opnieuw."}}
  }
  CoachWidgetStore.enqueue(c,JSONObject().put("kind","plan-accept").put("date",date).put("slots",slots));CoachWidgets.update(c)
 }
}
