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
import java.net.URI

// The adventure in progress as a live notification, like a running app's: "Run · 0:05 · 1.23 km" over the Pokemon
// it is raising, with that Pokemon's sprite. While expo-location records in the background, its foreground service
// already shows a notification (on the channel "<app id>:zepimon-adventure-route"); this one takes that notification's
// place by posting under its id, so there is only ever one. Without that service (recording only while the screen is
// on) it posts its own. The time ticks here every second, since JavaScript only runs when a location arrives.
object LiveNotification {
  data class State(val activity: String, val startedAt: Long, val distance: String, val pokemon: String, val icon: String?)

  private const val SERVICE_CHANNEL_SUFFIX = ":zepimon-adventure-route"
  private const val OWN_CHANNEL = "zepimon-adventure"
  private const val OWN_ID = 73_014
  private const val ICON_SIZE = 192

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var app: Context
  @Volatile private var state: State? = null
  @Volatile private var icon: Bitmap? = null
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

  fun stop(context: Context) {
    handler.post {
      handler.removeCallbacks(tick)
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
      .setContentText(current.pokemon)
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
