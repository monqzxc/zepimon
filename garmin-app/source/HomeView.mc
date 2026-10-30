import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

// The title screen: the egg to carry next. Up and down (or swiping) change it; START picks Walk or Run.
class HomeView extends WatchUi.View {
    var index as Number = 0;

    function initialize() {
        View.initialize();
        var saved = Application.Storage.getValue("egg");
        var count = Catalog.all().size();
        index = saved instanceof Number && saved >= 0 && saved < count ? saved : Math.rand() % count;
    }

    function egg() as Array {
        return Catalog.all()[index] as Array;
    }

    function move(step as Number) as Void {
        var count = Catalog.all().size();
        index = (index + step + count) % count;
        Application.Storage.setValue("egg", index);
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Dc) as Void {
        Draw.clear(dc);
        var h = dc.getHeight();
        var chosen = egg();
        var family = chosen[1] as Array;
        Draw.text(dc, h * 0.13, Graphics.FONT_XTINY, "ZEPIMON", Draw.GOLD);
        Draw.pokemon(dc, dc.getWidth() / 2, h * 0.38, h * 0.13, "Egg", false);
        Draw.text(dc, h * 0.6, Graphics.FONT_SMALL, family[0] + " egg", Draw.INK);
        var line = "";
        for (var i = 1; i < family.size(); i++) {
            line += (i > 1 ? " > " : "> ") + family[i];
        }
        Draw.text(dc, h * 0.69, Graphics.FONT_XTINY, line, Draw.MUTED);
        var last = Journal.lastRecord(chosen[0] as Number);
        Draw.text(dc, h * 0.78, Graphics.FONT_XTINY,
            last instanceof Dictionary ? "Last: " + Rules.km(last["meters"] as Number) : "Never carried", Draw.MUTED);
        Draw.text(dc, h * 0.9, Graphics.FONT_XTINY, "START to go", Draw.PURPLE);
    }
}

class HomeDelegate extends WatchUi.BehaviorDelegate {
    var view as HomeView;

    function initialize(home as HomeView) {
        BehaviorDelegate.initialize();
        view = home;
    }

    function onNextPage() as Boolean {
        view.move(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        view.move(-1);
        return true;
    }

    function onSelect() as Boolean {
        var menu = new WatchUi.Menu2({ :title => "Carry it on a" });
        menu.addItem(new WatchUi.MenuItem("Walk", null, :walk, null));
        menu.addItem(new WatchUi.MenuItem("Run", null, :run, null));
        WatchUi.pushView(menu, new StartMenuDelegate(view), WatchUi.SLIDE_UP);
        return true;
    }
}

// Walk or Run: starts recording and opens the adventure.
class StartMenuDelegate extends WatchUi.Menu2InputDelegate {
    var home as HomeView;

    function initialize(view as HomeView) {
        Menu2InputDelegate.initialize();
        home = view;
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        getApp().adventure = new Adventure(home.egg(), item.getId() == :run);
        var view = new SessionView();
        WatchUi.switchToView(view, new SessionDelegate(view), WatchUi.SLIDE_LEFT);
    }
}
