package nl.vandijk.coach
import android.content.*
class CoachReleaseReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){CoachWidgets.update(c);CoachWidgetRefresh.schedule(c)}}
