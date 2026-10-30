import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;

// What the watch keeps (Application.Storage), in the shape of the Zepp app's journal so it can sync later: the Dex
// (one entry per Pokemon, "Shiny " in front for a Shiny), the last adventure per egg family (by route) and the total
// Expedition distance. Each Dex entry has its own key, so no stored value grows with the collection.
module Journal {
    function record(adventure as Adventure) as Array {
        var finishedAt = Time.now().value();
        var form = adventure.form();
        var entry = {
            "meters" => adventure.meters.toNumber(),
            "activity" => adventure.running ? "running" : "walking",
            "startedAt" => adventure.startedAt,
            "finishedAt" => finishedAt,
            "elapsedSeconds" => adventure.elapsed(),
            "hatchSeconds" => adventure.hatchSeconds,
            "shiny" => adventure.shiny,
            "mega" => adventure.mega,
            "form" => form
        };
        Application.Storage.setValue("record:" + adventure.egg[0], entry);
        var earned = Rules.earned(adventure.egg, adventure.meters, adventure.mega);
        var names = dexNames();
        for (var i = 0; i < earned.size(); i++) {
            var key = (adventure.shiny ? "Shiny " : "") + earned[i];
            Application.Storage.setValue("dex:" + key, { "meters" => entry["meters"], "finishedAt" => finishedAt, "shiny" => adventure.shiny });
            if (names.indexOf(key) < 0) {
                names.add(key);
            }
        }
        Application.Storage.setValue("dexNames", names);
        var total = Application.Storage.getValue("expedition");
        Application.Storage.setValue("expedition", (total instanceof Number ? total : 0) + entry["meters"]);
        return earned;
    }

    function dexNames() as Array {
        var names = Application.Storage.getValue("dexNames");
        return names instanceof Array ? names : [];
    }

    function lastRecord(route as Number) {
        return Application.Storage.getValue("record:" + route);
    }
}
