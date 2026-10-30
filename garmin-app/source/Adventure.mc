import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.Lang;
import Toybox.Position;
import Toybox.Time;

// The adventure being recorded: a Garmin walking or running activity (GPS, saved to Garmin Connect) carrying the egg.
// Its distance is the activity's own.
class Adventure {
    var egg as Array;
    var running as Boolean;
    var shiny as Boolean;
    var mega;
    var startedAt as Number;        // seconds since 1970
    var meters = 0.0;
    var hatchSeconds = null;        // when it hatched, in seconds from the start
    var session;

    function initialize(chosen as Array, run as Boolean) {
        egg = chosen;
        running = run;
        shiny = Rules.rollShiny();
        var megas = egg[2] as Array;
        mega = megas.size() > 0 ? megas[0] : null;
        startedAt = Time.now().value();
        Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
        session = ActivityRecording.createSession({
            :name => running ? "Zepimon Run" : "Zepimon Walk",
            :sport => running ? Activity.SPORT_RUNNING : Activity.SPORT_WALKING
        });
        session.start();
    }

    // Location events keep GPS on for the activity; the distance comes from the activity itself.
    function onPosition(info as Position.Info) as Void {
    }

    function elapsed() as Number {
        var seconds = Time.now().value() - startedAt;
        return seconds > 0 ? seconds : 0;
    }

    function form() as String {
        return Rules.formOf(egg, meters, mega);
    }

    // Takes in the activity's distance. Returns true when the Pokemon changed (hatched, evolved or went Mega).
    function update() as Boolean {
        var info = Activity.getActivityInfo();
        if (info == null || info.elapsedDistance == null) {
            return false;
        }
        var before = form();
        var previous = meters;
        meters = info.elapsedDistance;
        if (previous < Rules.HATCH && meters >= Rules.HATCH && hatchSeconds == null) {
            hatchSeconds = elapsed();
        }
        return !before.equals(form());
    }

    // Whether the GPS fix is good enough to count distance yet.
    function located() as Boolean {
        var info = Activity.getActivityInfo();
        return info != null && info.currentLocationAccuracy != null && info.currentLocationAccuracy >= Position.QUALITY_USABLE;
    }

    // Stops recording. Saving keeps the activity in Garmin Connect and the Pokemon in the journal; discarding keeps
    // neither. Returns what was earned (empty when discarded).
    function finish(save as Boolean) as Array {
        update();
        Position.enableLocationEvents(Position.LOCATION_DISABLE, method(:onPosition));
        if (session.isRecording()) {
            session.stop();
        }
        if (!save) {
            session.discard();
            return [];
        }
        session.save();
        return Journal.record(me);
    }
}
