package expo.modules.zepimondiagnostics

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZepimonDiagnosticsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ZepimonDiagnostics")
    Function("lastCrash") { CrashRecorder.report(context) }
    Function("acknowledgeCrash") { CrashRecorder.acknowledge(context) }
  }
}
