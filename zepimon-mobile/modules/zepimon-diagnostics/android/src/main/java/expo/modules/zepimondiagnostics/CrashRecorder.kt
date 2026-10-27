package expo.modules.zepimondiagnostics

import android.app.ActivityManager
import android.app.Application
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Remembers why Zepimon last closed unexpectedly, so the app can show it on the next start: no computer or developer
// options needed. A crash in Java or Kotlin, or a JavaScript error (which ends the app as a Java exception in release
// builds), is written to a file just before the app closes. Android's own record of abnormal exits adds native
// crashes and freezes (Android 11 and later).
//
// It also breaks crash loops. expo-task-manager restores saved tasks every time the app starts, so a location task
// that crashes would crash every start. After a crash, and after the app is installed or updated, the next start
// drops the saved tasks once; the adventure in progress is kept by the app, which then offers to resume recording.
object CrashRecorder {
  private const val CRASH_FILE = "zepimon-last-crash.txt"
  private const val PREFS = "ZepimonDiagnostics"
  private const val HANDLED = "handledAt"         // the newest crash the startup check has dealt with
  private const val INSTALLED = "installedAt"     // the install or update the startup check has dealt with
  private const val ACKNOWLEDGED = "acknowledgedAt" // when the report was last closed in the app
  private const val TASK_MANAGER_PREFS = "TaskManagerModule" // expo-task-manager's saved tasks

  fun install(application: Application) {
    try {
      val prefs = application.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val latest = latestCrashAt(application)
      val installed = application.packageManager.getPackageInfo(application.packageName, 0).lastUpdateTime
      if (latest > prefs.getLong(HANDLED, 0L) || installed != prefs.getLong(INSTALLED, 0L)) {
        application.getSharedPreferences(TASK_MANAGER_PREFS, Context.MODE_PRIVATE).edit().clear().commit()
        prefs.edit().putLong(HANDLED, maxOf(latest, prefs.getLong(HANDLED, 0L))).putLong(INSTALLED, installed).commit()
      }
    } catch (_: Throwable) {
      // Diagnostics must never stop the app from starting.
    }
    val crashFile = File(application.filesDir, CRASH_FILE)
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
        crashFile.writeText("Crash at ${stamp(System.currentTimeMillis())} on thread \"${thread.name}\"\n${trace.take(16000)}")
      } catch (_: Throwable) {
      }
      previous?.uncaughtException(thread, error)
    }
  }

  // The report for the app to show, or null when nothing new has happened since it was last closed.
  fun report(context: Context): String? {
    val acknowledged = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(ACKNOWLEDGED, 0L)
    val parts = mutableListOf<String>()
    val crashFile = File(context.filesDir, CRASH_FILE)
    if (crashFile.exists() && crashFile.lastModified() > acknowledged) parts.add(crashFile.readText())
    val exits = abnormalExits(context).filter { it.timestamp > acknowledged }
    if (exits.isNotEmpty()) {
      parts.add("Android's record of recent unexpected exits:\n" + exits.joinToString("\n") {
        "- ${stamp(it.timestamp)}: ${reasonName(it.reason)}${it.description?.let { text -> " ($text)" } ?: ""}"
      })
    }
    if (parts.isEmpty()) return null
    return "Zepimon ${appVersion(context)} on Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), " +
      "${Build.MANUFACTURER} ${Build.MODEL}\n\n" + parts.joinToString("\n\n")
  }

  fun acknowledge(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(ACKNOWLEDGED, System.currentTimeMillis()).commit()
    File(context.filesDir, CRASH_FILE).delete()
  }

  private fun latestCrashAt(context: Context): Long {
    val crashFile = File(context.filesDir, CRASH_FILE)
    val fromFile = if (crashFile.exists()) crashFile.lastModified() else 0L
    return maxOf(fromFile, abnormalExits(context).maxOfOrNull { it.timestamp } ?: 0L)
  }

  private fun abnormalExits(context: Context): List<ApplicationExitInfo> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return emptyList()
    return try {
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      manager.getHistoricalProcessExitReasons(context.packageName, 0, 10).filter {
        it.reason == ApplicationExitInfo.REASON_CRASH || it.reason == ApplicationExitInfo.REASON_CRASH_NATIVE ||
          it.reason == ApplicationExitInfo.REASON_ANR || it.reason == ApplicationExitInfo.REASON_INITIALIZATION_FAILURE
      }.take(5)
    } catch (_: Throwable) {
      emptyList()
    }
  }

  private fun reasonName(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_CRASH -> "crash"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "native crash"
    ApplicationExitInfo.REASON_ANR -> "not responding"
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "failed to start"
    else -> "reason $reason"
  }

  private fun appVersion(context: Context): String = try {
    context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
  } catch (_: Throwable) {
    "?"
  }

  private fun stamp(time: Long) = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(time))
}
