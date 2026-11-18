package expo.modules.zepimonlive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import java.net.URI

// The adventure in progress as a live notification, like a running app's: "Run · 0:05 · 1.23 km" over the Pokemon
// it is raising, with that Pokemon's sprite. While expo-location records in the background, its foreground service
// already shows a notification (on the channel "<app id>:zepimon-adventure-route"); this one takes that notification's
// place by posting under its id, so there is only ever one. Without that service (recording only while the screen is
// on) it posts its own. The time ticks here every second, since JavaScript only runs when a location arrives.
//
// During a Gym session it also carries the cue ("Jog · 0:45 left · then Walk", see src/cue-alerts.ts). A timed step's
// end is known in advance, so the buzz for it (and the tap 10 s before) is scheduled here: it comes on the second even
// with the screen off and no new location to wake JavaScript, say while walking on the spot. Measured steps end with a
// location, so JavaScript buzzes for those.
object LiveNotification {
  data class State(val activity: String, val startedAt: Long, val distance: String, val pokemon: String, val icon: String?)
  // until: when a timed step ends (ms since the epoch), 0 for a measured one, whose remaining distance is `remaining`.
  data class Cue(val label: String, val until: Long, val remaining: String, val next: String?, val nextEffort: Boolean)

  private val EFFORT = longArrayOf(0, 400, 200, 400)
  private val EASY = longArrayOf(0, 700)
  private val WARNING = longArrayOf(0, 120)
  private val DONE = longArrayOf(0, 200, 100, 200, 100, 600)

  private const val SERVICE_CHANNEL_SUFFIX = ":zepimon-adventure-route"
  private const val OWN_CHANNEL = "zepimon-adventure"
  private const val OWN_ID = 73_014
  private const val ICON_SIZE = 192

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var app: Context
  @Volatile private var state: State? = null
  @Volatile private var icon: Bitmap? = null
  @Volatile private var cue: Cue? = null
  private val warn = Runnable { vibrate(WARNING) }
  private val change = Runnable {
    val ending = cue ?: return@Runnable
    vibrate(if (ending.next == null) DONE else if (ending.nextEffort) EFFORT else EASY)
  }
  private var iconKey: String? = null
  private var ownPosted = false

  private val tick = object : Runnable {
    override fun run() {
      post()
      handler.postDelayed(this, 1000)
    }
  }

  fun show(context: Context, next: State) {
    handler.post {
      app = context.applicationContext
      state = next
      if (next.icon != iconKey) {
        iconKey = next.icon
        icon = null
        next.icon?.let { load(it) }
      }
      handler.removeCallbacks(tick)
      tick.run()
    }
  }

  fun setCue(context: Context, next: Cue?) {
    handler.post {
      app = context.applicationContext
      val same = next != null && cue?.let { it.label == next.label && it.until == next.until && it.next == next.next } == true
      cue = next
      if (!same) {
        handler.removeCallbacks(warn)
        handler.removeCallbacks(change)
        if (next != null && next.until > 0) {
          val now = System.currentTimeMillis()
          if (next.until - 10_000 > now && next.next != null) handler.postDelayed(warn, next.until - 10_000 - now)
          if (next.until > now) handler.postDelayed(change, next.until - now)
        }
      }
      if (state != null) post()
    }
  }

  private fun vibrate(pattern: LongArray) {
    try {
      val found: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        app.getSystemService(VibratorManager::class.java)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      val vibrator = found ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(pattern, -1)
      }
    } catch (_: Exception) { /* no vibrator: the notification and voice still cue */ }
  }

  // "Jog · 0:45 left · then Walk", ticking with the notification.
  private fun cueLine(): String? {
    val current = cue ?: return null
    val left = if (current.until > 0) elapsed(current.until - System.currentTimeMillis()) else current.remaining
    return "${current.label} · $left left" + (current.next?.let { " · then $it" } ?: "")
  }

  fun stop(context: Context) {
    handler.post {
      handler.removeCallbacks(tick)
      handler.removeCallbacks(warn)
      handler.removeCallbacks(change)
      cue = null
      state = null
      if (ownPosted) context.getSystemService(NotificationManager::class.java)?.cancel(OWN_ID)
      ownPosted = false
    }
  }

  // "0:05", "12:34" or "1:02:03", like the time in a running app's notification.
  fun elapsed(millis: Long): String {
    val total = (millis.coerceAtLeast(0) / 1000)
    val hours = total / 3600
    val minutes = total / 60 % 60
    val seconds = total % 60
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds) else "%d:%02d".format(minutes, seconds)
  }

  private fun post() {
    val current = state ?: return
    val manager = app.getSystemService(NotificationManager::class.java) ?: return
    val service = try {
      manager.activeNotifications.firstOrNull {
        it.id != OWN_ID && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && it.notification.channelId?.endsWith(SERVICE_CHANNEL_SUFFIX) == true
      }
    } catch (_: Exception) { null }
    if (service != null && ownPosted) {
      manager.cancel(OWN_ID)
      ownPosted = false
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(app, service?.notification?.channelId ?: ownChannel(manager))
    } else {
      @Suppress("DEPRECATION") Notification.Builder(app)
    }
    builder.setContentTitle("${current.activity} · ${elapsed(System.currentTimeMillis() - current.startedAt)} · ${current.distance}")
      .setContentText(cueLine() ?: current.pokemon)
      .setSmallIcon(smallIcon())
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(current.startedAt)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setColor(0xFF6E52C8.toInt())
    icon?.let { builder.setLargeIcon(it) }
    launchIntent()?.let { builder.setContentIntent(it) }
    try {
      manager.notify(service?.id ?: OWN_ID, builder.build())
      if (service == null) ownPosted = true
    } catch (_: Exception) { /* notifications blocked: recording goes on */ }
  }

  private fun ownChannel(manager: NotificationManager): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(OWN_CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(OWN_CHANNEL, "Adventure in progress", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Your walk or run while Zepimon records it"
        setShowBadge(false)
      })
    }
    return OWN_CHANNEL
  }

  private fun smallIcon(): Int =
    app.resources.getIdentifier("zepimon_notification", "drawable", app.packageName).takeIf { it != 0 } ?: app.applicationInfo.icon

  private fun launchIntent(): PendingIntent? {
    val intent = app.packageManager.getLaunchIntentForPackage(app.packageName) ?: return null
    intent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
    return PendingIntent.getActivity(app, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  // The sprite's image source: a drawable resource name in a release build, a URL from the dev server, or a file.
  // Pixel art is enlarged without smoothing so it stays crisp.
  private fun load(source: String) {
    Thread {
      val bitmap = try {
        when {
          source.startsWith("http") -> URI(source).toURL().openStream().use { BitmapFactory.decodeStream(it) }
          source.startsWith("file://") -> BitmapFactory.decodeFile(source.removePrefix("file://"))
          source.startsWith("/") -> BitmapFactory.decodeFile(source)
          else -> app.resources.getIdentifier(source, "drawable", app.packageName).takeIf { it != 0 }?.let {
            BitmapFactory.decodeResource(app.resources, it, BitmapFactory.Options().apply { inScaled = false })
          }
        }
      } catch (_: Exception) { null } ?: return@Thread
      val scale = ICON_SIZE.toFloat() / maxOf(bitmap.width, bitmap.height)
      val crisp = Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), false)
      handler.post {
        if (iconKey == source) {
          icon = crisp
          post()
        }
      }
    }.start()
  }
}
