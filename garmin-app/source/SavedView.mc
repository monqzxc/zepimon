import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// After saving: the Pokemon it ended as and the distance, then back to the title screen.
class SavedView extends WatchUi.View {
    var label as String;
    var meters;
    var forms as Number;

    function initialize(name as String, distance, earned as Number) {
        View.initialize();
        label = name;
        meters = distance;
        forms = earned;
    }

    function onUpdate(dc as Dc) as Void {
        Draw.clear(dc);
        var h = dc.getHeight();
        Draw.text(dc, h * 0.2, Graphics.FONT_SMALL, "Adventure saved", Draw.GOLD);
        Draw.text(dc, h * 0.42, Graphics.FONT_MEDIUM, label, Draw.INK);
        Draw.text(dc, h * 0.58, Graphics.FONT_SMALL, Rules.km(meters), Draw.INK);
        Draw.text(dc, h * 0.72, Graphics.FONT_XTINY,
            forms > 0 ? "+" + forms.toString() + " in your Dex" : "Still an egg: it hatches at 5 km", Draw.MUTED);
        Draw.text(dc, h * 0.88, Graphics.FONT_XTINY, "Also in Garmin Connect", Draw.PURPLE);
    }
}

class SavedDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }

    function onSelect() as Boolean {
        return onBack();
    }
}
