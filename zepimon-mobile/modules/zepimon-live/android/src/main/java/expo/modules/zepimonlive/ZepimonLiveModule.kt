package expo.modules.zepimonlive

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class LiveOptions : Record {
  @Field var activity: String = "Walk"
  @Field var startedAt: Double = 0.0
  @Field var distance: String = ""
  @Field var pokemon: String = ""
  @Field var icon: String? = null
}

class ZepimonLiveModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ZepimonLive")
    Function("show") { options: LiveOptions ->
      LiveNotification.show(context, LiveNotification.State(options.activity, options.startedAt.toLong(), options.distance,
        options.pokemon, options.icon))
    }
    Function("stop") { LiveNotification.stop(context) }
  }
}
