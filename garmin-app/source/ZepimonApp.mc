import Toybox.Application;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.WatchUi;

// Zepimon for Garmin: carry an egg on a walk or run, and every 5 km it hatches or evolves, with a Mega form at 21 km,
// like the Zepp watch app (hatdog-app). The adventure is a real Garmin activity, saved to Garmin Connect with the
// Pokemon it raised saved here.
class ZepimonApp extends Application.AppBase {
    // The adventure being recorded, or null.
    var adventure = null;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
        Math.srand(System.getTimer());
    }

    // Leaving the app while recording saves the adventure, like finishing it: a Garmin activity cannot carry on
    // without the app that records it.
    function onStop(state) {
        if (adventure != null) {
            adventure.finish(true);
            adventure = null;
        }
    }

    function getInitialView() {
        var view = new HomeView();
        return [view, new HomeDelegate(view)];
    }
}

function getApp() as ZepimonApp {
    return Application.getApp() as ZepimonApp;
}
