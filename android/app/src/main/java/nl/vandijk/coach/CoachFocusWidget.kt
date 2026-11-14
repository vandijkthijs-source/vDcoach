package nl.vandijk.coach

import android.app.*
import android.appwidget.*
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.Manifest
import android.net.Uri
import android.os.*
import android.view.View
import android.widget.*
import org.json.*
import java.text.SimpleDateFormat
import java.util.*

object CoachFocusWidget {
 fun action(c:Context,operation:String,taskId:String="",minutes:Int=25)=PendingIntent.getActivity(c,operation.hashCode()+taskId.hashCode(),Intent(c,CoachFocusActionActivity::class.java).putExtra("operation",operation).putExtra("taskId",taskId).putExtra("minutes",minutes).setData(Uri.parse("vdcoach-focus://$operation/${Uri.encode(taskId)}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 private fun dateAction(c:Context,id:Int,operation:String)=PendingIntent.getBroadcast(c,id*10+operation.hashCode(),Intent(c,CoachPlannerWidget::class.java).setAction(CoachPlanner.ACTION).putExtra("widgetId",id).putExtra("operation",operation).setData(Uri.parse("vdcoach-focus://$id/$operation")),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 fun render(c:Context,m:AppWidgetManager,id:Int){
  val date=CoachPlanner.date(c,id);val current=date==CoachWidgetStore.today();val day=CoachPlanner.day(c,date);val plan=CoachFocusEngine.plan(c,date);val snapshot=CoachFocusStore.snapshot(c);val session=if(current)snapshot.optJSONObject("session") else null;val active=snapshot.optJSONObject("active");val focus=plan.optJSONObject("focus");val task=focus?.optJSONObject("task");val busy=plan.optJSONObject("busy")
  val dark=CoachWidgetStyle.dark(c,id);val fg=Color.parseColor(if(dark)"#f5f7fb" else "#20262e");val soft=Color.parseColor(if(dark)"#aeb9c8" else "#647289");val accent=Color.parseColor(if(dark)"#4da4ff" else "#365bd1")
  val v=RemoteViews(c.packageName,R.layout.widget_planner);v.setInt(R.id.planner_root,"setBackgroundResource",CoachWidgetStyle.background(c,id));v.setInt(R.id.focus_surface,"setBackgroundResource",CoachWidgetStyle.surface(c,id));v.setInt(R.id.focus_primary,"setBackgroundResource",CoachWidgetStyle.surface(c,id));v.setInt(R.id.focus_replan,"setBackgroundResource",CoachWidgetStyle.surface(c,id))
  for(view in intArrayOf(R.id.focus_greeting,R.id.focus_title))v.setTextColor(view,fg)
  for(view in intArrayOf(R.id.planner_date,R.id.planner_prev,R.id.planner_next,R.id.focus_reason,R.id.focus_secondary,R.id.planner_status,R.id.focus_next_heading,R.id.focus_habits_heading))v.setTextColor(view,soft)
  for(view in intArrayOf(R.id.focus_eyebrow,R.id.focus_duration,R.id.planner_clock,R.id.focus_primary,R.id.focus_replan,R.id.focus_checkin,R.id.planner_refresh))v.setTextColor(view,accent)
  val formatted=SimpleDateFormat("EEE d MMM",Locale.forLanguageTag("nl-NL")).format(SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).parse(date)!!)
  v.setTextViewText(R.id.planner_date,if(current)"v2.0 · $formatted" else formatted)
  val h=Calendar.getInstance(TimeZone.getTimeZone("Europe/Amsterdam")).get(Calendar.HOUR_OF_DAY);v.setTextViewText(R.id.focus_greeting,if(!current)"Je opgeslagen dag" else if(h<12)"Goedemorgen, Thijs" else if(h<18)"Goedemiddag, Thijs" else "Goedenavond, Thijs")
  v.setTextViewText(R.id.focus_title,session?.optString("title")?:task?.optString("shortTitle",task.optString("title"))?:busy?.optString("text")?:"Ruimte voor je dag")
  v.setTextViewText(R.id.focus_reason,if(session!=null){when(session.optString("status")){"review"->"Wat is gelukt? Je tijd is bewaard. De taak staat nog open.";"paused"->"Gepauzeerd. Je bestede tijd blijft bewaard.";else->"Eén ding tegelijk. Je taak wordt apart afgerond."}}else focus?.optString("reason")?:plan.optString("message"))
  v.setTextViewText(R.id.focus_eyebrow,if(session!=null)"JOUW FOCUS" else if(focus!=null)"NU VOOR JOU · VOORSTEL" else "VANDAAG")
  val remaining=focus?.optInt("remainingMinutes")?:0;val block=focus?.optInt("blockMinutes")?:0
  v.setTextViewText(R.id.focus_duration,if(session!=null)"Focusblok · ${session.optInt("minutes")} min" else if(focus==null)"" else if(remaining>block)"Begin met $block min · nog ±$remaining min werk" else "Voorgesteld · $block min"+if(focus.optBoolean("estimated"))" (geschat)" else "")
  v.setTextViewText(R.id.planner_status,if(!current)"Opgeslagen dag · alleen bekijken" else if(plan.optInt("overflow")>0)"±${plan.optInt("overflow")} min meer werk dan vrije ruimte. Herplan zonder iets te verliezen." else if(session==null)"Je kiest zelf. Niets wordt automatisch ingepland." else "Stoppen bewaart tijd, geen automatische taakafronding.")
  val editable=current&&!day.optBoolean("closed");v.setViewVisibility(R.id.planner_clock,if(session==null)View.GONE else View.VISIBLE)
  if(session!=null){val elapsed=session.optLong("elapsed")+if(session.optString("status")=="running"&&active?.optString("focusSessionId")==session.optString("id"))maxOf(0L,System.currentTimeMillis()-active.getLong("startedAt")) else 0L;v.setChronometer(R.id.planner_clock,SystemClock.elapsedRealtime()-elapsed,null,session.optString("status")=="running");v.setTextViewText(R.id.focus_primary,when(session.optString("status")){"running"->"Pauze";"paused"->"Verder";else->"Hoe ging het?"});v.setOnClickPendingIntent(R.id.focus_primary,action(c,when(session.optString("status")){"running"->"pause";"paused"->"resume";else->"review"},session.optString("taskId"),session.optInt("minutes")));v.setTextViewText(R.id.focus_secondary,"Stop & bewaren");v.setOnClickPendingIntent(R.id.focus_secondary,action(c,"stop"))}
  else {v.setTextViewText(R.id.focus_primary,if(task!=null&&remaining==0)"Taak beoordelen" else if(task!=null)"Start · $block min" else if(busy!=null)"Bekijk afspraak" else "Bekijk je dag");v.setOnClickPendingIntent(R.id.focus_primary,if(task!=null&&editable)action(c,if(remaining==0)"assess" else "start",task.optString("id"),block) else action(c,"day"));v.setTextViewText(R.id.focus_secondary,if(task!=null)"Nu even niet" else "");v.setOnClickPendingIntent(R.id.focus_secondary,if(task!=null&&editable)action(c,"skip",task.optString("id")) else null)}
  for(op in listOf("prev","next","today","refresh"))v.setOnClickPendingIntent(when(op){"prev"->R.id.planner_prev;"next"->R.id.planner_next;"today"->R.id.planner_date;else->R.id.planner_refresh},dateAction(c,id,op))
  for((mode,view) in listOf("next" to R.id.focus_next_list,"habits" to R.id.focus_habits)){
   v.setRemoteAdapter(view,Intent(c,CoachFocusViewsService::class.java).putExtra("mode",mode).putExtra("date",date).putExtra("widgetId",id).setData(Uri.parse("vdcoach-focus://$id/$date/$mode")))
   v.setPendingIntentTemplate(view,PendingIntent.getActivity(c,id*50+mode.hashCode(),Intent(c,CoachPlannerPopup::class.java).putExtra("date",date).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS),PendingIntent.FLAG_UPDATE_CURRENT or (if(Build.VERSION.SDK_INT>=31)PendingIntent.FLAG_MUTABLE else 0)))
  }
  v.setTextViewText(R.id.focus_replan,"Heroverleg");v.setViewVisibility(R.id.focus_habits,View.VISIBLE);v.setOnClickPendingIntent(R.id.focus_title,action(c,"stuck",task?.optString("id")?:session?.optString("taskId")?:""));v.setOnClickPendingIntent(R.id.focus_replan,if(editable)action(c,"replan") else action(c,"day"));v.setOnClickPendingIntent(R.id.focus_checkin,if(editable)action(c,"checkin") else action(c,"day"))
  val compact=m.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,500)<400
  for(view in intArrayOf(R.id.focus_greeting,R.id.focus_reason,R.id.focus_duration,R.id.planner_status,R.id.focus_next_heading,R.id.focus_next_list,R.id.focus_habits_heading,R.id.focus_habits))v.setViewVisibility(view,if(compact)View.GONE else View.VISIBLE)
  if(!compact&&m.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,700)<650){v.setViewVisibility(R.id.focus_greeting,View.GONE);v.setViewVisibility(R.id.planner_status,View.GONE)}
  v.setTextViewTextSize(R.id.focus_title,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)17f else 22f)
  val all=day.optJSONArray("tasks")?:JSONArray();val habits=(0 until all.length()).map{all.getJSONObject(it)}.filter{it.optString("category")=="Habit"};v.setTextViewText(R.id.focus_habits_heading,"GEWOONTES · ${habits.count{it.optBoolean("done")}}/${habits.size}")
  m.updateAppWidget(id,v);m.notifyAppWidgetViewDataChanged(id,R.id.focus_next_list);m.notifyAppWidgetViewDataChanged(id,R.id.focus_habits)
 }
}
class CoachFocusViewsService:RemoteViewsService(){override fun onGetViewFactory(intent:Intent)=object:RemoteViewsFactory{
 private val date=intent.getStringExtra("date")?:CoachWidgetStore.today();private val habits=intent.getStringExtra("mode")=="habits";private val widgetId=intent.getIntExtra("widgetId",-1);private var rows=listOf<JSONObject>()
 override fun onCreate(){onDataSetChanged()};override fun onDestroy(){};override fun onDataSetChanged(){val c=this@CoachFocusViewsService;val day=CoachPlanner.day(c,date);val plan=CoachFocusEngine.plan(c,date)
  if(habits){val a=day.optJSONArray("tasks")?:JSONArray();rows=(0 until a.length()).map{a.getJSONObject(it)}.filter{it.optString("category")=="Habit"}.map{JSONObject(it.toString()).put("text",(if(it.optBoolean("done"))"✓  " else "○  ")+it.optString("title")).put("kind","plan")}}
  else {val a=plan.optJSONArray("next")?:JSONArray();val result=mutableListOf<JSONObject>();for(i in 0 until a.length()){val t=a.getJSONObject(i);result.add(JSONObject(t.toString()).put("text",t.optString("shortTitle",t.optString("title"))).put("meta",if(t.optInt("remainingMinutes")==0)"Even beoordelen · daarna" else "±${t.optInt("remainingMinutes",25)} min · "+if(t.optInt("minutes")>0)"daarna" else "geschat").put("kind","plan"))};plan.optJSONObject("appointment")?.let{result.add(JSONObject(it.toString()).put("meta",it.optString("startTime")+"–"+it.optString("endTime")+" · agenda").put("kind","agenda"))};rows=result}
 }
 override fun getCount()=rows.size;override fun getViewAt(position:Int):RemoteViews{val row=rows.getOrNull(position)?:JSONObject().put("text","");val c=this@CoachFocusViewsService;val dark=CoachWidgetStyle.dark(c,widgetId);return RemoteViews(packageName,R.layout.widget_planner_row).apply{setTextViewText(R.id.planner_row_title,row.optString("text"));setTextViewText(R.id.planner_row_meta,row.optString("meta"));setViewVisibility(R.id.planner_row_meta,if(habits)View.GONE else View.VISIBLE);setTextColor(R.id.planner_row_title,Color.parseColor(if(dark)"#f5f7fb" else "#20262e"));setTextColor(R.id.planner_row_meta,Color.parseColor(if(dark)"#aeb9c8" else "#6f7d94"));setOnClickFillInIntent(R.id.planner_row,Intent().putExtra("entryId",row.optString("id")).putExtra("kind",row.optString("kind")))}}
 override fun getLoadingView():RemoteViews?=null;override fun getViewTypeCount()=1;override fun getItemId(position:Int)=rows.getOrNull(position)?.optString("id")?.hashCode()?.toLong()?:0L;override fun hasStableIds()=true
}}

class CoachFocusActionActivity:Activity(){
 override fun onCreate(state:Bundle?){super.onCreate(state);if(intent.getStringExtra("operation") in listOf("start","resume")&&Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),1);return};perform()}
 override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(grantResults.firstOrNull()==PackageManager.PERMISSION_GRANTED)perform() else finish()}
 private fun builder()=AlertDialog.Builder(this,if(CoachWidgetStore.state(this).optBoolean("darkMode",true))android.R.style.Theme_Material_Dialog_Alert else android.R.style.Theme_Material_Light_Dialog_Alert).setOnCancelListener{finish()}
 private fun perform(){try{val op=intent.getStringExtra("operation")?:"day";val id=intent.getStringExtra("taskId")?:"";when(op){
  "start","resume"->{val latest=CoachFocusEngine.plan(this).optJSONObject("focus");if(op=="start"&&(latest==null||latest.getJSONObject("task").optString("id")!=id)){builder().setTitle("Je dag is veranderd").setMessage("Ververs de widget voor een passend voorstel. Je taken zijn behouden.").setPositiveButton("Goed"){_,_->finish()}.show();return};CoachFocusStore.start(this,id,if(op=="start")latest!!.getInt("blockMinutes") else intent.getIntExtra("minutes",25));finish()}
  "assess"->builder().setTitle("Is deze taak klaar?").setMessage("Je hebt de geschatte werktijd besteed. Jij bepaalt of de taak af is.").setPositiveButton("Taak klaar"){_,_->CoachWidgetStore.enqueue(this,JSONObject().put("kind","task").put("date",CoachWidgetStore.today()).put("taskId",id).put("done",true));CoachWidgets.update(this);finish()}.setNeutralButton("Nog een blok"){_,_->try{CoachFocusStore.start(this,id,10)}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show()};finish()}.setNegativeButton("Open laten"){_,_->finish()}.show()
  "pause"->{CoachFocusStore.pause(this);finish()}
  "stop","review"->{CoachFocusStore.pause(this,true);review()}
  "skip"->{CoachFocusStore.skip(this,id);finish()}
  "stuck"->{val a=CoachPlanner.day(this,CoachWidgetStore.today()).optJSONArray("tasks")?:JSONArray();val task=(0 until a.length()).map{a.getJSONObject(it)}.find{it.optString("id")==id};if(task==null){openDay();return};val step=task.optString("firstStep").ifEmpty{"Open wat je nodig hebt en schrijf één concrete volgende stap op. Begin daar vijf minuten mee."};builder().setTitle("Ik loop vast").setMessage(task.optString("title")+"\n\n"+step+"\n\nDit is een startvoorstel. Je oorspronkelijke taak en duur blijven behouden.").setPositiveButton("Start 5 min"){_,_->try{CoachFocusStore.start(this,id,5)}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show()};finish()}.setNegativeButton("Niet nu"){_,_->finish()}.show()}
  "help"->{val a=CoachPlanner.day(this,CoachWidgetStore.today()).optJSONArray("tasks")?:JSONArray();val task=(0 until a.length()).map{a.getJSONObject(it)}.find{it.optString("id")==id};builder().setTitle("Maak de start klein").setMessage((task?.optString("title")?:"Kies één open taak.")+"\n\n"+(task?.optString("comment")?:"")+"\n\nBegin met één kleine stap. Je hoeft niet de hele taak in één blok af te krijgen.").setPositiveButton("Goed"){_,_->finish()}.show()}
  "checkin"->builder().setTitle("Hoe past je dag nu?").setMessage("Je taken blijven staan. Pas de grootte van je volgende werkblok aan.").setItems(arrayOf("Rustiger · 25 minuten","Goed zo · 45 minuten","Meer ruimte · 60 minuten","Dag afronden in de app")){_,which->if(which<3){CoachFocusStore.energy(this,arrayOf("low","normal","high")[which]);finish()}else openDay()}.show()
  "replan"->{startActivity(Intent(this,MainActivity::class.java).putExtra("widgetScreen","Coach").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP));finish()}

  else->openDay()
 }}catch(e:Exception){builder().setTitle("Even controleren").setMessage(e.message?:"Je gegevens zijn behouden.").setPositiveButton("Sluiten"){_,_->finish()}.show()}}
 private fun openDay(){startActivity(Intent(this,MainActivity::class.java).putExtra("widgetScreen","Dagboek").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP));finish()}
 private fun review(){val s=CoachFocusStore.session(this);if(s==null){finish();return};builder().setTitle("Wat is gelukt?").setMessage(s.optString("title")+"\n\nJe bestede tijd is bewaard. Kies apart of de taak klaar is.").setPositiveButton("Taak klaar"){_,_->CoachFocusStore.finish(this,"done");finish()}.setNeutralButton("Verder"){_,_->try{CoachFocusStore.start(this,s.getString("taskId"),s.getInt("minutes"));finish()}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();finish()}}.setNegativeButton("Later"){_,_->CoachFocusStore.finish(this,"later");later(s)}.show()}
 private fun later(s:JSONObject){builder().setTitle("Wanneer past dit?").setItems(arrayOf(if(s.optString("date")==CoachWidgetStore.today())"Morgen" else "Op vandaag","Naar backlog","Open laten")){_,which->if(which<2)CoachWidgetStore.enqueue(this,JSONObject().put("kind","task-move").put("date",s.getString("date")).put("taskId",s.getString("taskId")).put("target",if(which==0){if(s.optString("date")==CoachWidgetStore.today())"tomorrow" else CoachWidgetStore.today()} else "backlog"));CoachWidgets.update(this);finish()}.show()}
}
