import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

// The eggs (resources/data/catalog.json, built by scripts/build-catalog.mjs), each [route, family, megas].
module Catalog {
    var eggs = null;

    function all() as Array {
        if (eggs == null) {
            eggs = (WatchUi.loadResource(Rez.JsonData.catalog) as Dictionary)["eggs"];
        }
        return eggs as Array;
    }
}

// The rules of hatdog-app/page/pokemon.js: a form every 5 km of one adventure (the egg hatches at 5 km), then the
// chosen Mega at 21 km, and a 1 in 50 Shiny roll as the egg is started.
module Rules {
    const HATCH = 5000;
    const MEGA = 21000;

    function earned(egg as Array, meters as Numeric, mega) as Array {
        var family = egg[1] as Array;
        var count = meters.toNumber() / HATCH;
        if (count > family.size()) {
            count = family.size();
        }
        var forms = family.slice(0, count);
        var megas = egg[2] as Array;
        if (meters >= MEGA && megas.size() > 0) {
            forms.add(mega != null ? mega : megas[0]);
        }
        return forms;
    }

    function formOf(egg as Array, meters as Numeric, mega) as String {
        var forms = earned(egg, meters, mega);
        return forms.size() > 0 ? forms[forms.size() - 1] as String : "Egg";
    }

    // The distance of the next hatch, evolution or Mega form, or null once the final form is reached.
    function nextAt(egg as Array, meters as Numeric) {
        var family = egg[1] as Array;
        var whole = meters.toNumber();
        if (whole < family.size() * HATCH) {
            return (whole / HATCH + 1) * HATCH;
        }
        return (egg[2] as Array).size() > 0 && whole < MEGA ? MEGA : null;
    }

    // "Bulbasaur egg", "Ivysaur", "Shiny Mega Venusaur".
    function name(egg as Array, form as String, shiny as Boolean) as String {
        return (shiny ? "Shiny " : "") + (form.equals("Egg") ? ((egg[1] as Array)[0] as String) + " egg" : form);
    }

    function rollShiny() as Boolean {
        return Math.rand() % 50 == 0;
    }

    function km(meters as Numeric) as String {
        return (meters / 1000.0).format("%.2f") + " km";
    }

    // "0:05", "12:34" or "1:02:03".
    function clock(seconds as Number) as String {
        var hours = seconds / 3600;
        var minutes = seconds / 60 % 60;
        if (hours > 0) {
            return hours.format("%d") + ":" + minutes.format("%02d") + ":" + (seconds % 60).format("%02d");
        }
        return minutes.format("%d") + ":" + (seconds % 60).format("%02d");
    }
}
