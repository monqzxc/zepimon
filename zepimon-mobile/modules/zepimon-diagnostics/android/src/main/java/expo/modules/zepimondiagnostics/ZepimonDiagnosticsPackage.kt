package expo.modules.zepimondiagnostics

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

// Installs the crash recorder as the app starts, before React Native and any saved task.
class ZepimonDiagnosticsPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) = CrashRecorder.install(application)
    })
}
