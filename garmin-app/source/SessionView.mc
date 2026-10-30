import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

// The adventure as it records: time, distance, the Pokemon and the distance to its next form, refreshed every second.
// A hatch, evolution or Mega buzzes and shows for a few seconds. BACK or START ends it: save, discard or keep going.
class SessionView extends WatchUi.View {
    var timer = null;
    var news = "";
    var newsUntil = 0;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        timer = new Timer.Timer();
        timer.start(method(:tick), 1000, true);
    }

    function onHide() as Void {
        if (timer != null) {
            timer.stop();
            timer = null;
        }
    }

    function tick() as Void {
        var adventure = getApp().adventure;
        if (adventure == null) {
            return;
        }
        if (adventure.update()) {
            var form = adventure.form();
            news = form.find("Mega ") == 0 ? "Mega Evolution!" : (adventure.meters < Rules.HATCH * 2 ? "Your egg hatched!" : "It evolved!");
            newsUntil = adventure.elapsed() + 5;
            if (Attention has :vibrate) {
                Attention.vibrate([new Attention.VibeProfile(80, 400), new Attention.VibeProfile(0, 200), new Attention.VibeProfile(80, 400)]);
            }
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Dc) as Void {
        Draw.clear(dc);
        var adventure = getApp().adventure;
        if (adventure == null) {
            return;
        }
        var h = dc.getHeight();
        var form = adventure.form();
        Draw.text(dc, h * 0.13, Graphics.FONT_XTINY, (adventure.running ? "RUN" : "WALK") + "  " + Rules.clock(adventure.elapsed()), Draw.GOLD);
        Draw.pokemon(dc, dc.getWidth() / 2, h * 0.33, h * 0.11, form, adventure.shiny);
        Draw.text(dc, h * 0.52, Graphics.FONT_SMALL, Rules.name(adventure.egg, form, adventure.shiny), adventure.shiny ? Draw.GOLD : Draw.INK);
        Draw.text(dc, h * 0.66, Graphics.FONT_NUMBER_MEDIUM, (adventure.meters / 1000.0).format("%.2f"), Draw.INK);
        Draw.text(dc, h * 0.76, Graphics.FONT_XTINY, "km", Draw.MUTED);
        var line;
        if (adventure.elapsed() < newsUntil) {
            line = news;
        } else if (!adventure.located()) {
            line = "Waiting for GPS...";
        } else {
            var next = Rules.nextAt(adventure.egg, adventure.meters);
            line = next == null ? "Final form reached!"
                : Rules.km(next - adventure.meters) + " to " + (next == Rules.MEGA ? "Mega" : (form.equals("Egg") ? "hatch" : "evolve"));
        }
        Draw.text(dc, h * 0.87, Graphics.FONT_XTINY, line, Draw.PURPLE);
    }
}

class SessionDelegate extends WatchUi.BehaviorDelegate {
    var view as SessionView;

    function initialize(session as SessionView) {
        BehaviorDelegate.initialize();
        view = session;
    }

    function onBack() as Boolean {
        return finishMenu();
    }

    function onSelect() as Boolean {
        return finishMenu();
    }

    function finishMenu() as Boolean {
        var adventure = getApp().adventure;
        if (adventure == null) {
            return false;
        }
        var menu = new WatchUi.Menu2({ :title => Rules.km(adventure.meters) });
        menu.addItem(new WatchUi.MenuItem("Save & finish", null, :save, null));
        menu.addItem(new WatchUi.MenuItem("Discard", "Nothing is saved", :discard, null));
        menu.addItem(new WatchUi.MenuItem(adventure.running ? "Keep running" : "Keep walking", null, :keep, null));
        WatchUi.pushView(menu, new FinishMenuDelegate(), WatchUi.SLIDE_UP);
        return true;
    }
}

// Save & finish shows what was earned; Discard asks once more; Keep going returns to the adventure.
class FinishMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var id = item.getId();
        if (id == :save) {
            var app = getApp();
            var adventure = app.adventure;
            app.adventure = null;
            var earned = adventure.finish(true);
            var form = adventure.form();
            WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            WatchUi.switchToView(new SavedView(Rules.name(adventure.egg, form, adventure.shiny), adventure.meters, earned.size()),
                new SavedDelegate(), WatchUi.SLIDE_LEFT);
        } else if (id == :discard) {
            var confirm = new WatchUi.Menu2({ :title => "Discard?" });
            confirm.addItem(new WatchUi.MenuItem("Discard", "No Pokemon or record", :yes, null));
            confirm.addItem(new WatchUi.MenuItem("Back", null, :no, null));
            WatchUi.switchToView(confirm, new DiscardMenuDelegate(), WatchUi.SLIDE_LEFT);
        } else {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        }
    }
}

class DiscardMenuDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
        if (item.getId() == :yes) {
            var app = getApp();
            if (app.adventure != null) {
                app.adventure.finish(false);
                app.adventure = null;
            }
            // Off the adventure, back to the title screen.
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        }
    }
}
