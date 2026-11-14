package nl.vandijk.coach

import android.app.*
import android.appwidget.*
import android.content.*
import android.graphics.Color
import android.net.Uri
import android.os.*
import android.view.View
import android.widget.*
import org.json.*
import java.text.SimpleDateFormat
import java.util.*

object CoachPlanner {
 const val ACTION="nl.vandijk.coach.PLANNER"
 private fun prefs(c:Context)=c.getSharedPreferences("coach_planner",Context.MODE_PRIVATE)
 fun date(c:Context,id:Int)=prefs(c).getString("date_$id",CoachWidgetStore.today())?:CoachWidgetStore.today()
 fun selected(c:Context,id:Int,value:String){prefs(c).edit().apply{if(value==CoachWidgetStore.today())remove("date_$id") else putString("date_$id",value)}.apply()}
 fun day(c:Context,date:String):JSONObject{
  val day=if(date==CoachWidgetStore.today())CoachWidgetStore.day(c) else JSONObject((CoachWidgetStore.state(c).optJSONObject("days")?.optJSONObject(date)?:JSONObject()).toString())
  val entries=day.optJSONArray("diaryEntries")?:JSONArray();val actions=CoachWidgetStore.actions(c)
  for(i in 0 until actions.length()){val a=actions.getJSONObject(i);if(a.optString("date")!=date)continue
   when(a.optString("kind")){
    "diary-done"->for(j in 0 until entries.length())if(entries.getJSONObject(j).optString("id")==a.optString("taskId"))entries.getJSONObject(j).put("done",a.optBoolean("done"))
    "task-move"->{val original=day.optJSONArray("tasks")?:JSONArray();val keep=JSONArray();for(j in 0 until original.length())if(original.getJSONObject(j).optString("id")!=a.optString("taskId"))keep.put(original.getJSONObject(j));day.put("tasks",keep)}
    "check-in"->day.put("energy",a.optString("energy"))
    "focus-skip"->{val choices=day.optJSONArray("focusChoices")?:JSONArray();choices.put(JSONObject().put("id",a.optString("taskId")).put("until",a.optLong("until")));day.put("focusChoices",choices)}
    "plan-accept"->{val slots=a.optJSONArray("slots")?:JSONArray();for(j in 0 until slots.length()){val slot=slots.getJSONObject(j);val key=slot.optString("id");val existing=(0 until entries.length()).firstOrNull{entries.getJSONObject(it).optString("id")==key};if(existing!=null&&entries.getJSONObject(existing).optBoolean("done"))continue;val entry=JSONObject().put("id",key).put("taskId",slot.optString("taskId")).put("text",slot.optString("title")).put("startTime",slot.optString("startTime")).put("endTime",slot.optString("endTime")).put("done",false).put("edited",true);if(existing==null)entries.put(entry) else entries.put(existing,entry)}}
   }
  }
  // Native completed timers remain visible before React imports them.
  val pending=CoachTimerStore.snapshot(c).optJSONArray("completed")?:JSONArray()
  val dateFormat=SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).apply{timeZone=TimeZone.getTimeZone("Europe/Amsterdam")}
  val clock=SimpleDateFormat("HH:mm",Locale.ROOT).apply{timeZone=TimeZone.getTimeZone("Europe/Amsterdam")}
  for(i in 0 until pending.length()){val t=pending.getJSONObject(i);val start=t.optLong("startedAt");val stop=t.optLong("stoppedAt");if(dateFormat.format(Date(start))!=date)continue;val key="timer-"+t.optString("id")+"-"+date
   if((0 until entries.length()).none{entries.getJSONObject(it).optString("id")==key})entries.put(JSONObject().put("id",key).put("text",t.optString("title")).put("startTime",clock.format(Date(start))).put("endTime",if(dateFormat.format(Date(stop))==date)clock.format(Date(stop)) else "24:00").put("done",true).apply{if(t.optString("taskId").isNotEmpty())put("taskId",t.optString("taskId")).put("focusSeconds",maxOf(0.0,(stop-start)/1000.0))})}
  return day.put("diaryEntries",entries)
 }
 private fun broadcast(c:Context,id:Int,operation:String)=PendingIntent.getBroadcast(c,id*10+operation.hashCode(),Intent(c,CoachPlannerWidget::class.java).setAction(ACTION).putExtra("widgetId",id).putExtra("operation",operation).setData(Uri.parse("vdcoach-planner://$id/$operation")),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 fun render(c:Context,m:AppWidgetManager,id:Int){CoachFocusWidget.render(c,m,id)}
 fun agendaRows(day:JSONObject,date:String):List<JSONObject>{
  val entries=day.optJSONArray("diaryEntries")?:JSONArray();val all=(0 until entries.length()).map{entries.getJSONObject(it)}
  val rows=mutableListOf<JSONObject>();all.filter{it.optBoolean("allDay")||it.optString("time")=="Hele dag"}.forEach{rows.add(JSONObject(it.toString()).put("meta","Hele dag"))}
  val current=Calendar.getInstance(TimeZone.getTimeZone("Europe/Amsterdam"));val hour=current.get(Calendar.HOUR_OF_DAY)
  for(h in 6..24){rows.add(JSONObject().put("heading",true).put("hour",h).put("text",if(h==24)"00:00" else String.format(Locale.ROOT,"%02d:00",h)).put("meta",if(date==CoachWidgetStore.today()&&h==hour)"── Nu "+String.format(Locale.ROOT,"%02d:%02d",hour,current.get(Calendar.MINUTE))+" ──" else ""));all.filter{!it.optBoolean("allDay")&&it.optString("time")!="Hele dag"&&it.optString("startTime",it.optString("time").take(5)).take(2).toIntOrNull()?.coerceIn(6,23)==h}.sortedBy{it.optString("startTime",it.optString("time"))}.forEach{e->rows.add(JSONObject(e.toString()).put("meta",listOf(e.optString("startTime",e.optString("time")),e.optString("endTime")).filter{it.isNotEmpty()}.joinToString("–")+if(e.optBoolean("done"))" · gedaan" else " · gepland"))}}
  return rows
 }
 fun taskRows(day:JSONObject):List<JSONObject>{val a=day.optJSONArray("tasks")?:JSONArray();val tasks=(0 until a.length()).map{a.getJSONObject(it)};val result=mutableListOf<JSONObject>();val priorities=tasks.filter{it.optString("category")=="Task"&&!it.optBoolean("done")&&it.optBoolean("priority")}.take(3)
  for((heading,group) in listOf("Prioriteiten" to priorities,"Overig" to tasks.filter{it.optString("category")=="Task"&&!it.optBoolean("done")&&it !in priorities},"Gewoontes" to tasks.filter{it.optString("category")=="Habit"},"Afgerond" to tasks.filter{it.optString("category")=="Task"&&it.optBoolean("done")}))if(group.isNotEmpty()){result.add(JSONObject().put("heading",true).put("text",heading));group.forEach{result.add(JSONObject(it.toString()).put("text",it.optString("shortTitle",it.optString("title"))).put("meta",if(it.optBoolean("done"))"✓" else if(it.optInt("rollovers")>0)"↻"+it.optInt("rollovers") else "○"))}}
  return result.ifEmpty{listOf(JSONObject().put("heading",true).put("text","Nog geen taken"))}
 }
}
class CoachPlannerWidget:CoachBaseWidget(){
 override fun onReceive(c:Context,i:Intent){super.onReceive(c,i);if(i.action!=CoachPlanner.ACTION)return;val id=i.getIntExtra("widgetId",-1);val op=i.getStringExtra("operation");if(op=="refresh")CoachWidgetRefresh.request(c) else {val cal=Calendar.getInstance();cal.time=SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).parse(CoachPlanner.date(c,id))!!;cal.add(Calendar.DAY_OF_MONTH,if(op=="prev")-1 else 1);CoachPlanner.selected(c,id,if(op=="today")CoachWidgetStore.today() else SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(cal.time))};CoachPlanner.render(c,AppWidgetManager.getInstance(c),id)}
 override fun onDeleted(c:Context,ids:IntArray){super.onDeleted(c,ids);ids.forEach{c.getSharedPreferences("coach_planner",Context.MODE_PRIVATE).edit().remove("date_$it").apply()}}
}
class CoachPlannerViewsService:RemoteViewsService(){override fun onGetViewFactory(intent:Intent)=object:RemoteViewsFactory{
 private var rows=listOf<JSONObject>();private val id=intent.getIntExtra("widgetId",-1);private val date=intent.getStringExtra("date")?:CoachWidgetStore.today();private val agenda=intent.getStringExtra("kind")=="agenda"
 override fun onCreate(){onDataSetChanged()};override fun onDestroy(){};override fun onDataSetChanged(){val day=CoachPlanner.day(this@CoachPlannerViewsService,date);rows=if(agenda)CoachPlanner.agendaRows(day,date) else CoachPlanner.taskRows(day)}
 override fun getCount()=rows.size;override fun getViewAt(position:Int):RemoteViews{val row=rows[position];val c=this@CoachPlannerViewsService;val dark=CoachWidgetStyle.dark(c,id);return RemoteViews(packageName,R.layout.widget_planner_row).apply{setTextViewText(R.id.planner_row_title,row.optString("text"));setTextViewText(R.id.planner_row_meta,row.optString("meta"));setViewVisibility(R.id.planner_row_meta,if(row.optString("meta").isEmpty())View.GONE else View.VISIBLE);setTextColor(R.id.planner_row_title,Color.parseColor(if(dark)"#f5f7fb" else "#20262e"));setTextColor(R.id.planner_row_meta,Color.parseColor(if(dark)"#92a4bd" else "#677b97"));if(!row.optBoolean("heading")){setInt(R.id.planner_row,"setBackgroundResource",CoachWidgetStyle.surface(c,id));setOnClickFillInIntent(R.id.planner_row,Intent().putExtra("entryId",row.optString("id")))}}}
 override fun getLoadingView():RemoteViews?=null;override fun getViewTypeCount()=1;override fun getItemId(position:Int)=position.toLong();override fun hasStableIds()=false
}}
class CoachPlannerPopup:Activity(){override fun onCreate(state:Bundle?){super.onCreate(state);val date=intent.getStringExtra("date")?:CoachWidgetStore.today();val agenda=intent.getStringExtra("kind")=="agenda";val key=intent.getStringExtra("entryId")?:"";val day=CoachPlanner.day(this,date);val rows=day.optJSONArray(if(agenda)"diaryEntries" else "tasks")?:JSONArray();val row=(0 until rows.length()).map{rows.getJSONObject(it)}.find{it.optString("id")==key};if(row==null){finish();return}
 val dark=CoachWidgetStore.state(this).optBoolean("darkMode",true);val dialog=AlertDialog.Builder(this,if(dark)android.R.style.Theme_Material_Dialog_Alert else android.R.style.Theme_Material_Light_Dialog_Alert).setTitle(row.optString(if(agenda)"text" else "title")).setMessage(if(agenda)listOf(row.optString("startTime"),row.optString("endTime"),row.optString("note")).filter{it.isNotEmpty()}.joinToString(" · ") else row.optString("comment").ifEmpty{"Tik op afronden om je voortgang vast te leggen."}).setNegativeButton("Sluiten"){_,_->finish()}.setNeutralButton("Open in app"){_,_->startActivity(Intent(this,MainActivity::class.java).putExtra("widgetScreen",if(agenda)"Dagboek" else "Vandaag").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP));finish()}
 if(date==CoachWidgetStore.today()&&!day.optBoolean("closed"))dialog.setPositiveButton(if(row.optBoolean("done"))"Heropenen" else "Afronden"){_,_->CoachWidgetStore.enqueue(this,JSONObject().put("kind",if(agenda)"diary-done" else "task").put("date",date).put("taskId",key).put("done",!row.optBoolean("done")));CoachWidgets.update(this);finish()}
 dialog.setOnCancelListener{finish()}.show()
}}
