package nl.vandijk.coach

import android.app.*
import android.appwidget.*
import android.content.*
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.*
import android.text.InputType
import android.view.*
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.*
import java.text.SimpleDateFormat
import java.util.*

/** Private durable inbox. Never writes React Native's storage behind its back. */
object CoachWidgetStore {
 private fun prefs(c:Context)=c.getSharedPreferences("coach_widgets",Context.MODE_PRIVATE)
 fun today():String=SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).apply{timeZone=TimeZone.getTimeZone("Europe/Amsterdam")}.format(Date())
 @Synchronized fun state(c:Context)=JSONObject(prefs(c).getString("mirror",null)?:"{\"days\":{}}")
 @Synchronized fun actions(c:Context)=JSONArray(prefs(c).getString("actions",null)?:"[]")
 @Synchronized fun enqueue(c:Context,row:JSONObject){val list=actions(c);check(list.length()<1000){"Open de app om je widgetacties te verwerken"};row.put("id",UUID.randomUUID().toString());list.put(row);check(prefs(c).edit().putString("actions",list.toString()).commit())}
 @Synchronized fun publish(c:Context,state:JSONObject,ack:Set<String>){val old=actions(c);val keep=JSONArray();for(i in 0 until old.length()){val row=old.getJSONObject(i);if(!ack.contains(row.getString("id")))keep.put(row)};check(prefs(c).edit().putString("mirror",state.toString()).putString("actions",keep.toString()).commit())}
 @Synchronized fun day(c:Context):JSONObject {
  val date=today();val day=JSONObject((state(c).optJSONObject("days")?.optJSONObject(date)?:JSONObject()).toString())
  val rows=actions(c);val tasks=day.optJSONArray("tasks")?:JSONArray();val food=day.optJSONArray("foodEntries")?:JSONArray()
  for(i in 0 until rows.length()){val action=rows.getJSONObject(i);if(action.optString("date")!=date||day.optBoolean("closed"))continue
   if(action.optString("kind")=="food")food.put(JSONObject().put("id","widget-"+action.optString("id")).put("text",action.optString("text")))
   if(action.optString("kind")=="task-add"){
    val taskId="widget-"+action.getString("id")
    if((0 until tasks.length()).none{tasks.getJSONObject(it).optString("id")==taskId})tasks.put(JSONObject().put("id",taskId).put("title",action.optString("text")).put("category","Task").put("done",false).put("priority",false).put("minutes",0).put("rollovers",0).put("firstPlannedDate",date))
   }
   if(action.optString("kind")=="task")for(j in 0 until tasks.length()){val task=tasks.getJSONObject(j);if(task.optString("id")==action.optString("taskId"))task.put("done",action.optBoolean("done"))}
  };return day.put("tasks",tasks).put("foodEntries",food)
 }
 fun tasks(c:Context):List<JSONObject>{val rows=day(c).optJSONArray("tasks")?:JSONArray();return (0 until rows.length()).map{rows.getJSONObject(it)}.filter{it.optString("category")=="Task"}.sortedWith(compareBy<JSONObject>{it.optBoolean("done")}.thenByDescending{it.optBoolean("priority")})}
}
/** Appearance belongs to a placed widget, independent of the shared app mirror. */
object CoachWidgetStyle {
 private fun prefs(c:Context)=c.getSharedPreferences("coach_widget_styles",Context.MODE_PRIVATE)
 fun get(c:Context,id:Int)=prefs(c).getString("style_$id","standard")?:"standard"
 fun save(c:Context,id:Int,value:String)=prefs(c).edit().putString("style_$id",value).commit()
 fun remove(c:Context,id:Int){prefs(c).edit().remove("style_$id").apply()}
 fun dark(c:Context,id:Int)=when(get(c,id)){"glass_dark"->true;"glass_light"->false;else->CoachWidgetStore.state(c).optBoolean("darkMode",true)}
 fun background(c:Context,id:Int)=when(get(c,id)){"glass_dark"->R.drawable.widget_glass_dark;"glass_light"->R.drawable.widget_glass_light;"transparent"->android.R.color.transparent;else->if(dark(c,id))R.drawable.widget_background else R.drawable.widget_background_light}
 fun surface(c:Context,id:Int)=if(get(c,id)=="standard"){if(dark(c,id))R.drawable.widget_input_background else R.drawable.widget_input_background_light}else if(dark(c,id))R.drawable.widget_glass_surface_dark else R.drawable.widget_glass_surface_light
}
class CoachWidgetStyleActivity:Activity(){
 override fun onCreate(state:Bundle?){
  super.onCreate(state);setResult(RESULT_CANCELED)
  val id=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID)
  val manager=AppWidgetManager.getInstance(this);val info=manager.getAppWidgetInfo(id)
  if(info==null||info.provider.packageName!=packageName){finish();return}
  val keys=arrayOf("standard","glass_dark","glass_light","transparent")
  var selected=state?.getInt("selection")?:keys.indexOf(CoachWidgetStyle.get(this,id)).coerceAtLeast(0)
  val dark=CoachWidgetStore.state(this).optBoolean("darkMode",true)
  val dialog=AlertDialog.Builder(this,if(dark)android.R.style.Theme_Material_Dialog_Alert else android.R.style.Theme_Material_Light_Dialog_Alert)
   .setTitle("Widgetstijl")
   .setSingleChoiceItems(arrayOf("Huidige stijl","Donker glas","Licht glas","Transparant"),selected){_,which->selected=which;selection=which}
   .setNegativeButton("Annuleren"){_,_->finish()}
   .setPositiveButton("Opslaan"){_,_->
    if(CoachWidgetStyle.save(this,id,keys[selected])){
     CoachWidgets.render(this,manager,id,Class.forName(info.provider.className))
     setResult(RESULT_OK,Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish()
    }else{Toast.makeText(this,"Opslaan mislukt",Toast.LENGTH_LONG).show();finish()}
   }.setOnCancelListener{finish()}.create()
  dialog.show()
 }
 private var selection:Int?=null
 override fun onSaveInstanceState(out:Bundle){selection?.let{out.putInt("selection",it)};super.onSaveInstanceState(out)}
}

object CoachWidgets {
 const val TASK="nl.vandijk.coach.WIDGET_TASK"
 private fun pending(c:Context,intent:Intent,request:Int)=PendingIntent.getActivity(c,request,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 fun open(c:Context,mode:String)=pending(c,Intent(c,CoachWidgetInputActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_MULTIPLE_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or Intent.FLAG_ACTIVITY_NO_ANIMATION).putExtra("mode",mode).setData(android.net.Uri.parse("vdcoach-widget://$mode")),mode.hashCode())
 fun app(c:Context)=pending(c,Intent(c,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),8190)
 fun applicationScreen(c:Context)=pending(c,Intent(c,MainActivity::class.java).putExtra("widgetScreen","Sollicitaties").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),8192)
 fun update(c:Context){runCatching {val m=AppWidgetManager.getInstance(c);for(type in arrayOf(CoachTasksWidget::class.java,CoachFoodWidget::class.java,CoachActivityWidget::class.java,CoachApplicationsWidget::class.java)){for(id in m.getAppWidgetIds(ComponentName(c,type)))runCatching {render(c,m,id,type)}}}}
 @Suppress("DEPRECATION") fun render(c:Context,m:AppWidgetManager,id:Int,type:Class<*>) {
  val day=CoachWidgetStore.day(c);val closed=day.optBoolean("closed");val dark=CoachWidgetStyle.dark(c,id)
  val layout=when(type){CoachApplicationsWidget::class.java->R.layout.widget_applications;CoachTasksWidget::class.java->R.layout.widget_tasks;CoachFoodWidget::class.java->R.layout.widget_food;else->R.layout.widget_activity}
  val v=RemoteViews(c.packageName,layout)
  v.setInt(R.id.widget_root,"setBackgroundResource",CoachWidgetStyle.background(c,id))
  v.setTextColor(R.id.widget_title,Color.parseColor(if(dark)"#f5f7fb" else "#20262e"))
  v.setOnClickPendingIntent(R.id.widget_title,app(c))
  if(type!=CoachApplicationsWidget::class.java)v.setInt(R.id.widget_action,"setBackgroundResource",if(CoachWidgetStyle.get(c,id)=="standard")R.drawable.widget_button else CoachWidgetStyle.surface(c,id))
  if(type==CoachApplicationsWidget::class.java){
   val overview=CoachWidgetStore.state(c).optJSONObject("applications");val appItems=overview?.optJSONArray("items")?:JSONArray();val count=(0 until appItems.length()).count{appItems.getJSONObject(it).optString("stage")!="closed"}
   v.setTextViewText(R.id.widget_title,"Sollicitaties")
   v.setTextViewText(R.id.widget_subtitle,if(overview==null)"Nog niet opgehaald" else "$count lopende trajecten")
   v.setTextColor(R.id.widget_subtitle,Color.parseColor(if(dark)"#aeb9c8" else "#596777"));v.setTextColor(R.id.widget_empty,Color.parseColor(if(dark)"#aeb9c8" else "#596777"))
   v.setTextViewText(R.id.widget_empty,if(overview==null)"Open de app om je overzicht op te halen" else "Geen lopende sollicitaties")
   v.setOnClickPendingIntent(R.id.widget_title,applicationScreen(c));v.setOnClickPendingIntent(R.id.widget_empty,applicationScreen(c))
   v.setRemoteAdapter(R.id.widget_applications_list,Intent(c,CoachApplicationViewsService::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).setData(android.net.Uri.parse("vdcoach-widget://applications/$id")))
   v.setEmptyView(R.id.widget_applications_list,R.id.widget_empty)
   v.setPendingIntentTemplate(R.id.widget_applications_list,PendingIntent.getActivity(c,8193,Intent(c,MainActivity::class.java).putExtra("widgetScreen","Sollicitaties").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT or (if(Build.VERSION.SDK_INT>=31)PendingIntent.FLAG_MUTABLE else 0)))
   m.updateAppWidget(id,v);m.notifyAppWidgetViewDataChanged(id,R.id.widget_applications_list);return
  }
  if(type==CoachTasksWidget::class.java){
   val rows=CoachWidgetStore.tasks(c);val done=rows.count{it.optBoolean("done")}
   v.setTextViewText(R.id.widget_title,"Taken · $done/${rows.size}")
   v.setTextViewText(R.id.widget_empty,if(closed)"Dag afgesloten" else "Nog geen taken. Voeg er één toe.")
   v.setTextColor(R.id.widget_empty,Color.parseColor(if(dark)"#aeb9c8" else "#596777"))
   v.setTextViewText(R.id.widget_action,if(closed)"Dag afgesloten" else "＋ Toevoegen")
   v.setBoolean(R.id.widget_action,"setEnabled",!closed)
   v.setOnClickPendingIntent(R.id.widget_action,if(closed)null else open(c,"task"))
   v.setRemoteAdapter(R.id.widget_list,Intent(c,CoachTaskViewsService::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).setData(android.net.Uri.parse("vdcoach-widget://tasks/$id")))
   v.setEmptyView(R.id.widget_list,R.id.widget_empty)
   val intent=Intent(c,CoachTasksWidget::class.java).setAction(TASK).putExtra("date",CoachWidgetStore.today()).setData(android.net.Uri.parse("vdcoach-widget://task/$id/${CoachWidgetStore.today()}"))
   v.setPendingIntentTemplate(R.id.widget_list,PendingIntent.getBroadcast(c,id,intent,PendingIntent.FLAG_UPDATE_CURRENT or (if(Build.VERSION.SDK_INT>=31)PendingIntent.FLAG_MUTABLE else 0)))
   m.updateAppWidget(id,v);m.notifyAppWidgetViewDataChanged(id,R.id.widget_list);return
  }
  if(type==CoachFoodWidget::class.java){
   val food=day.optJSONArray("foodEntries")?:JSONArray();val count=food.length()
   v.setTextViewText(R.id.widget_title,"Voeding")
   v.setTextColor(R.id.widget_subtitle,Color.parseColor(if(dark)"#aeb9c8" else "#596777"))
   v.setTextColor(R.id.widget_food_empty,Color.parseColor(if(dark)"#aeb9c8" else "#596777"))
   v.setTextViewText(R.id.widget_subtitle,if(closed)"Dag afgesloten" else "$count ${if(count==1)"item" else "items"} vandaag")
   v.setOnClickPendingIntent(R.id.widget_action,if(closed)null else open(c,"food"))
   v.setBoolean(R.id.widget_action,"setEnabled",!closed)
   v.setTextViewText(R.id.widget_action,if(closed)"Dag afgesloten" else "＋ Toevoegen")
   v.setRemoteAdapter(R.id.widget_food_list,Intent(c,CoachFoodViewsService::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id).setData(android.net.Uri.parse("vdcoach-widget://food/$id")))
   v.setEmptyView(R.id.widget_food_list,R.id.widget_food_empty)
   m.updateAppWidget(id,v);m.notifyAppWidgetViewDataChanged(id,R.id.widget_food_list);return
  }else{
   val active=CoachTimerStore.snapshot(c).optJSONObject("active")
   val input=if(active==null)open(c,"timer") else null
   v.setInt(R.id.widget_input,"setBackgroundResource",CoachWidgetStyle.surface(c,id))
   v.setTextViewText(R.id.widget_title,active?.optString("title")?:"Activiteit typen…")
   v.setOnClickPendingIntent(R.id.widget_input,input)
   v.setOnClickPendingIntent(R.id.widget_title,input)
   v.setOnClickPendingIntent(R.id.widget_clock,input)
   v.setTextViewText(R.id.widget_action,if(active!=null)"Stop" else "Start")
   v.setContentDescription(R.id.widget_input,if(active!=null)"Lopende activiteit" else "Typ een activiteit")
   v.setContentDescription(R.id.widget_action,if(active!=null)"Stop en bewaar activiteit" else "Typ en start activiteit")
   if(active!=null){
    val elapsed=maxOf(0L,System.currentTimeMillis()-active.getLong("startedAt"))
    v.setViewVisibility(R.id.widget_clock,View.VISIBLE)
    v.setChronometer(R.id.widget_clock,SystemClock.elapsedRealtime()-elapsed,null,true)
    v.setOnClickPendingIntent(R.id.widget_action,PendingIntent.getService(c,8191,Intent(c,CoachTimerService::class.java).setAction(CoachTimerService.STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
   }else{
    v.setChronometer(R.id.widget_clock,SystemClock.elapsedRealtime(),null,false)
    v.setTextViewText(R.id.widget_clock,"")
    v.setViewVisibility(R.id.widget_clock,View.GONE)
    v.setOnClickPendingIntent(R.id.widget_action,open(c,"timer"))
   }
  };m.updateAppWidget(id,v)
 }
}
open class CoachBaseWidget:AppWidgetProvider(){
 override fun onDeleted(c:Context,ids:IntArray){ids.forEach{CoachWidgetStyle.remove(c,it)}}
 override fun onUpdate(c:Context,m:AppWidgetManager,ids:IntArray){ids.forEach{CoachWidgets.render(c,m,it,javaClass)}}
 override fun onAppWidgetOptionsChanged(c:Context,m:AppWidgetManager,id:Int,options:Bundle){CoachWidgets.render(c,m,id,javaClass)}
 override fun onReceive(c:Context,intent:Intent){super.onReceive(c,intent);if(intent.action in listOf(Intent.ACTION_DATE_CHANGED,Intent.ACTION_TIME_CHANGED,Intent.ACTION_TIMEZONE_CHANGED))CoachWidgets.update(c)}
}
class CoachTasksWidget:CoachBaseWidget(){override fun onReceive(c:Context,intent:Intent){super.onReceive(c,intent);if(intent.action==CoachWidgets.TASK){try{
 val date=intent.getStringExtra("date");val id=intent.getStringExtra("taskId");if(date!=CoachWidgetStore.today()||CoachWidgetStore.day(c).optBoolean("closed"))return
 if(CoachWidgetStore.tasks(c).none{it.optString("id")==id})return
 CoachWidgetStore.enqueue(c,JSONObject().put("kind","task").put("date",date).put("taskId",id).put("done",intent.getBooleanExtra("done",true)))
 CoachWidgets.update(c)
 }catch(e:Exception){Toast.makeText(c,e.message?:"Open de app om verder te gaan",Toast.LENGTH_LONG).show()}}}}
class CoachApplicationsWidget:CoachBaseWidget()
class CoachFoodWidget:CoachBaseWidget()
class CoachActivityWidget:CoachBaseWidget()
class CoachTaskViewsService:RemoteViewsService(){override fun onGetViewFactory(intent:Intent):RemoteViewsFactory=object:RemoteViewsFactory{
 private var rows=listOf<JSONObject>()
 override fun onCreate(){onDataSetChanged()};override fun onDataSetChanged(){rows=CoachWidgetStore.tasks(this@CoachTaskViewsService)};override fun onDestroy(){};override fun getCount()=rows.size
 override fun getViewAt(position:Int):RemoteViews?{val row=rows.getOrNull(position)?:return null;val c=this@CoachTaskViewsService;val v=RemoteViews(packageName,R.layout.widget_task_row);val done=row.optBoolean("done");v.setTextViewText(R.id.widget_row_check,if(done)"✓" else "○");v.setTextViewText(R.id.widget_row_text,row.optString("shortTitle").ifBlank{row.optString("title")});val dark=CoachWidgetStyle.dark(c,intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1));v.setTextColor(R.id.widget_row_text,Color.parseColor(if(done)"#7f8c9c" else if(dark)"#f5f7fb" else "#20262e"));v.setOnClickFillInIntent(R.id.widget_row,Intent().putExtra("taskId",row.optString("id")).putExtra("done",!done));return v}
 override fun getLoadingView():RemoteViews?=null;override fun getViewTypeCount()=1;override fun getItemId(position:Int)=rows.getOrNull(position)?.optString("id")?.hashCode()?.toLong()?:0L;override fun hasStableIds()=true
}}
class CoachApplicationViewsService:RemoteViewsService(){override fun onGetViewFactory(intent:Intent):RemoteViewsFactory=object:RemoteViewsFactory{
 private var rows=listOf<JSONObject>()
 override fun onCreate(){onDataSetChanged()};override fun onDestroy(){}
 override fun onDataSetChanged(){
  val list=CoachWidgetStore.state(this@CoachApplicationViewsService).optJSONObject("applications")?.optJSONArray("items")?:JSONArray()
  val items=(0 until list.length()).map{list.getJSONObject(it)};val grouped=mutableListOf<JSONObject>()
  for((stage,title) in listOf("action" to "Actie nodig","interview" to "Gesprekken","waiting" to "Wacht op reactie")){
   val members=items.filter{it.optString("stage")==stage}
   if(members.isNotEmpty()){grouped.add(JSONObject().put("id","header-"+stage).put("heading",title+" · "+members.size));grouped.addAll(members)}
  };rows=grouped
 }
 override fun getCount()=rows.size
 override fun getViewAt(position:Int):RemoteViews?{val row=rows.getOrNull(position)?:return null;val dark=CoachWidgetStyle.dark(this@CoachApplicationViewsService,intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1))
  if(row.has("heading"))return RemoteViews(packageName,R.layout.widget_application_heading).apply{
   setTextViewText(R.id.widget_application_heading,row.getString("heading"))
   setTextColor(R.id.widget_application_heading,Color.parseColor(if(dark)"#aeb9c8" else "#596777"))
  }
  return RemoteViews(packageName,R.layout.widget_application_row).apply{
   setInt(R.id.widget_application_row,"setBackgroundResource",CoachWidgetStyle.surface(this@CoachApplicationViewsService,intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1)))
   setTextColor(R.id.widget_company,Color.parseColor(if(dark)"#f5f7fb" else "#20262e"))
   val stage=row.optString("stage");val color=row.optString("color").ifBlank{if(stage=="interview")"green" else if(stage=="closed")"red" else "orange"}
   setTextViewText(R.id.widget_application_dot,"●");setTextColor(R.id.widget_application_dot,Color.parseColor(when(color){"green"->"#77d19b";"red"->"#ff6f7d";else->"#f2ad59"}))
   setTextViewText(R.id.widget_company,row.optString("company"));setTextViewText(R.id.widget_role,row.optString("role"))
   val date=row.optString("actionDate");setTextViewText(R.id.widget_status,row.optString("status")+if(date.isBlank())"" else " · actie "+date.takeLast(5).split("-").reversed().joinToString("-"))
   setTextColor(R.id.widget_role,Color.parseColor(if(dark)"#f5f7fb" else "#20262e"));setTextColor(R.id.widget_status,Color.parseColor(if(dark)"#aeb9c8" else "#596777"))
   setOnClickFillInIntent(R.id.widget_application_row,Intent())
  }
 }
 override fun getLoadingView():RemoteViews?=null;override fun getViewTypeCount()=2;override fun getItemId(position:Int)=rows.getOrNull(position)?.optString("id")?.hashCode()?.toLong()?:0L;override fun hasStableIds()=true
}}

object CoachFoodSymbols {
 private val matches=listOf(
  Regex("\\b(pizza|pizzaatje)\\b",RegexOption.IGNORE_CASE) to "🍕",
  Regex("\\b(wraps?|burrito|burritos|shoarmawrap)\\b",RegexOption.IGNORE_CASE) to "🌯",
  Regex("\\b(hamburgers?|burgers?|cheeseburgers?)\\b",RegexOption.IGNORE_CASE) to "🍔",
  Regex("\\b(croissants?)\\b",RegexOption.IGNORE_CASE) to "🥐",
  Regex("\\b(brood|broodjes?|boterhammen?|sneetjes?|tosti|tostis|stokbrood)\\b",RegexOption.IGNORE_CASE) to "🥪",
  Regex("\\b(pasta|spaghetti|lasagne|macaroni)\\b",RegexOption.IGNORE_CASE) to "🍝",
  Regex("\\b(rijst|risotto)\\b",RegexOption.IGNORE_CASE) to "🍚",
  Regex("\\b(soep|erwtensoep|tomatensoep)\\b",RegexOption.IGNORE_CASE) to "🍲",
  Regex("\\b(kwark|yoghurt|yogurt|havermout|muesli|granola)\\b",RegexOption.IGNORE_CASE) to "🥣",
  Regex("\\b(melk|karnemelk)\\b",RegexOption.IGNORE_CASE) to "🥛",
  Regex("\\b(shake|proteïneshake|eiwitshake|smoothie)\\b",RegexOption.IGNORE_CASE) to "🥤",
  Regex("\\b(ei|eieren|omelet|omelette|eggs?)\\b",RegexOption.IGNORE_CASE) to "🥚",
  Regex("\\b(banaan|bananen|banana|bananas)\\b",RegexOption.IGNORE_CASE) to "🍌",
  Regex("\\b(appel|appels|apple|apples)\\b",RegexOption.IGNORE_CASE) to "🍎",
  Regex("\\b(aardbei|aardbeien)\\b",RegexOption.IGNORE_CASE) to "🍓",
  Regex("\\b(bessen|blauwe\\s+bessen|bosbessen)\\b",RegexOption.IGNORE_CASE) to "🫐",
  Regex("\\b(druiven)\\b",RegexOption.IGNORE_CASE) to "🍇",
  Regex("\\b(sinaasappel|sinaasappels|mandarijn|mandarijnen)\\b",RegexOption.IGNORE_CASE) to "🍊",
  Regex("\\b(koffie|coffee|espresso|cappuccino|latte)\\b",RegexOption.IGNORE_CASE) to "☕",
  Regex("\\b(thee|tea|matcha)\\b",RegexOption.IGNORE_CASE) to "🍵",
  Regex("\\b(water)\\b",RegexOption.IGNORE_CASE) to "💧",
  Regex("\\b(cola|frisdrank|sap|limonade|kombucha)\\b",RegexOption.IGNORE_CASE) to "🥤",
  Regex("\\b(bier|biertjes?|pils|leffe)\\b",RegexOption.IGNORE_CASE) to "🍺",
  Regex("\\b(wijn|cava|prosecco)\\b",RegexOption.IGNORE_CASE) to "🍷",
  Regex("\\b(popcorn)\\b",RegexOption.IGNORE_CASE) to "🍿",
  Regex("\\b(chocolade|chocola|chocoladereep)\\b",RegexOption.IGNORE_CASE) to "🍫",
  Regex("\\b(koek|koeken|koekje|koekjes|cookies?)\\b",RegexOption.IGNORE_CASE) to "🍪",
  Regex("\\b(snoep|snoepjes|snoepgoed)\\b",RegexOption.IGNORE_CASE) to "🍬",
  Regex("\\b(friet|frietjes|patat)\\b",RegexOption.IGNORE_CASE) to "🍟"
 )
 fun symbol(text:String)=matches.firstOrNull{it.first.containsMatchIn(text)}?.second?:"🍽️"
}
class CoachFoodViewsService:RemoteViewsService(){override fun onGetViewFactory(intent:Intent):RemoteViewsFactory=object:RemoteViewsFactory{
 private var rows=listOf<JSONObject>()
 override fun onCreate(){onDataSetChanged()}
 override fun onDataSetChanged(){val food=CoachWidgetStore.day(this@CoachFoodViewsService).optJSONArray("foodEntries")?:JSONArray();rows=(0 until food.length()).map{food.getJSONObject(it)}}
 override fun onDestroy(){};override fun getCount()=rows.size
 override fun getViewAt(position:Int):RemoteViews?{
  val row=rows.getOrNull(position)?:return null;val c=this@CoachFoodViewsService;val dark=CoachWidgetStyle.dark(c,intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1));val text=row.optString("text")
  return RemoteViews(packageName,R.layout.widget_food_row).apply{
   setInt(R.id.widget_food_row,"setBackgroundResource",CoachWidgetStyle.surface(c,intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,-1)))
   setTextViewText(R.id.widget_food_icon,CoachFoodSymbols.symbol(text));setTextViewText(R.id.widget_food_text,text)
   setTextColor(R.id.widget_food_text,Color.parseColor(if(dark)"#f5f7fb" else "#20262e"))
  }
 }
 override fun getLoadingView():RemoteViews?=null;override fun getViewTypeCount()=1
 override fun getItemId(position:Int)=rows.getOrNull(position)?.optString("id",position.toString())?.hashCode()?.toLong()?:0L
 override fun hasStableIds()=true
}}

/** Small native input window: works without starting the React runtime. */
class CoachWidgetInputActivity:Activity(){
 private lateinit var field:EditText
 private var dialog:AlertDialog?=null
 private val mode get()=intent.getStringExtra("mode")?:"food"
 override fun onCreate(state:Bundle?){super.onCreate(state);showInput(state?.getString("draft")?:"")}
 override fun onSaveInstanceState(out:Bundle){if(::field.isInitialized)out.putString("draft",field.text.toString());super.onSaveInstanceState(out)}
 private fun closeInput(){finishAndRemoveTask()}
 private fun showInput(draft:String){
  fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
  val dark=CoachWidgetStore.state(this).optBoolean("darkMode",true)
  val foreground=Color.parseColor(if(dark)"#f5f7fb" else "#20262e")
  val muted=Color.parseColor(if(dark)"#aeb9c8" else "#596777")
  fun rounded(color:String,radius:Int)=GradientDrawable().apply{setColor(Color.parseColor(color));cornerRadius=dp(radius).toFloat()}
  val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(18),dp(16),dp(18),dp(10))}
  box.addView(TextView(this).apply{text=when(mode){"food"->"Voeding";"task"->"Taak";else->"Activiteit"};textSize=16f;setTextColor(foreground);setTypeface(null,android.graphics.Typeface.BOLD)},LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(12)})
  field=EditText(this).apply{
   setText(draft);hint=when(mode){"food"->"Bijvoorbeeld 4 eieren";"task"->"Wat wil je doen?";else->"Wat ga je doen?"};textSize=15f;setTextColor(foreground);setHintTextColor(muted)
   background=rounded(if(dark)"#20262e" else "#f0f3f7",14);setPadding(dp(14),0,dp(14),0)
   filters=arrayOf(android.text.InputFilter.LengthFilter(if(mode=="food")2000 else 300));inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
   setSingleLine(true);imeOptions=android.view.inputmethod.EditorInfo.IME_ACTION_DONE
  }
  box.addView(field,LinearLayout.LayoutParams(-1,dp(48)))
  val actions=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.END;setPadding(0,dp(8),0,0)}
  fun action(label:String,color:Int,click:()->Unit)=TextView(this).apply{text=label;textSize=14f;setTextColor(color);gravity=Gravity.CENTER;setPadding(dp(16),0,dp(16),0);setTypeface(null,android.graphics.Typeface.BOLD);setOnClickListener{click()}}
  actions.addView(action("Annuleren",muted){closeInput()},LinearLayout.LayoutParams(-2,dp(44)))
  actions.addView(action(if(mode=="timer")"Start" else "Toevoegen",Color.parseColor("#4da4ff")){submit()}.apply{background=rounded(if(dark)"#243d56" else "#e4efff",12)},LinearLayout.LayoutParams(-2,dp(44)))
  box.addView(actions)
  dialog=AlertDialog.Builder(this,if(dark)android.R.style.Theme_Material_Dialog_Alert else android.R.style.Theme_Material_Light_Dialog_Alert).create()
  dialog!!.setView(box,0,0,0,0);dialog!!.setOnCancelListener{closeInput()}
  dialog!!.setOnShowListener{
   dialog!!.window?.apply{
    setBackgroundDrawable(rounded(if(dark)"#2c3540" else "#ffffff",24))
    setLayout(minOf(dp(320),resources.displayMetrics.widthPixels-dp(40)),WindowManager.LayoutParams.WRAP_CONTENT)
    setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
   };field.requestFocus()
  }
  field.setOnEditorActionListener{_,action,_->if(action==android.view.inputmethod.EditorInfo.IME_ACTION_DONE){submit();true}else false}
  dialog!!.show()
 }
 private fun submit(){val text=field.text.toString().trim();if(text.isBlank()){field.error="Vul eerst een tekst in";return}
  try{if(mode=="task"){
   check(!CoachWidgetStore.day(this).optBoolean("closed")){"Deze dag is afgesloten"}
   CoachWidgetStore.enqueue(this,JSONObject().put("kind","task-add").put("date",CoachWidgetStore.today()).put("text",text.take(300)))
   CoachWidgets.update(this);closeInput()
  }else if(mode=="food"){
   check(!CoachWidgetStore.day(this).optBoolean("closed")){"Deze dag is afgesloten"}
   CoachWidgetStore.enqueue(this,JSONObject().put("kind","food").put("date",CoachWidgetStore.today()).put("text",text.take(2000)))
   CoachWidgets.update(this);closeInput()
  }else{
   if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED){requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),82);return}
   check(NotificationManagerCompat.from(this).areNotificationsEnabled()){"Sta meldingen toe in de telefooninstellingen"}
   val active=CoachTimerStore.start(this,text).getJSONObject("active")
   try{ContextCompat.startForegroundService(this,Intent(this,CoachTimerService::class.java))}catch(e:Exception){CoachTimerStore.rollback(this,active.getString("id"));throw e}
   CoachWidgets.update(this);closeInput()
  }}catch(e:Exception){field.error=e.message?:"Opslaan mislukt"}
 }
 override fun onRequestPermissionsResult(request:Int,permissions:Array<out String>,results:IntArray){super.onRequestPermissionsResult(request,permissions,results);if(request==82){if(results.firstOrNull()==android.content.pm.PackageManager.PERMISSION_GRANTED)submit()else field.error="Meldingen zijn nodig voor de timer"}}
 override fun onDestroy(){dialog?.dismiss();super.onDestroy()}
}
class CoachWidgetsModule(private val c:ReactApplicationContext):ReactContextBaseJavaModule(c){
 override fun getName()="CoachWidgets"
 @ReactMethod fun consumeScreen(p:Promise){try{val intent=c.currentActivity?.intent;val screen=intent?.getStringExtra("widgetScreen");intent?.removeExtra("widgetScreen");p.resolve(screen)}catch(e:Exception){p.reject("WIDGET",e.message,e)}}
 @ReactMethod fun snapshot(p:Promise){try{p.resolve(CoachWidgetStore.actions(c).toString())}catch(e:Exception){p.reject("WIDGET",e.message,e)}}
 @ReactMethod fun publish(raw:String,ids:ReadableArray,p:Promise){try{CoachWidgetStore.publish(c,JSONObject(raw),(0 until ids.size()).mapNotNull{ids.getString(it)}.toSet());CoachWidgets.update(c);p.resolve(null)}catch(e:Exception){p.reject("WIDGET",e.message,e)}}
}
class CoachWidgetsPackage:ReactPackage{
 override fun createNativeModules(c:ReactApplicationContext):List<NativeModule> = listOf(CoachWidgetsModule(c))
 override fun createViewManagers(c:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
