package nl.vandijk.coach
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
class CoachClipboardModule(private val context: ReactApplicationContext): ReactContextBaseJavaModule(context) {
 override fun getName() = "CoachClipboard"
 @ReactMethod fun copy(text: String, promise: Promise) {
  try {
   (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Daily check-in", text))
   promise.resolve(null)
  } catch (e: Exception) { promise.reject("CLIPBOARD", "Could not copy text", e) }
 }
}
class CoachClipboardPackage: ReactPackage {
 override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(CoachClipboardModule(context))
 override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
