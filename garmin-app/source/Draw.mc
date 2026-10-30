import Toybox.Graphics;
import Toybox.Lang;

// Drawing shared by the screens, for the Forerunner 165's round 390 px AMOLED: black around (AMOLED pixels off),
// Zepimon purple and gold for accents.
module Draw {
    const PURPLE = 0x8A5CDB;
    const GOLD = 0xF2C230;
    const INK = 0xFFFFFF;
    const MUTED = 0xA8A2B8;

    function clear(dc as Dc) as Void {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
    }

    function text(dc as Dc, y as Numeric, font, value as String, color as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, y, font, value, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // The egg (a speckled oval) or, once hatched, a badge with the Pokemon's initial until sprites arrive. Shiny ones
    // get a gold ring.
    function pokemon(dc as Dc, cx as Numeric, cy as Numeric, size as Numeric, form as String, shiny as Boolean) as Void {
        if (shiny) {
            dc.setColor(GOLD, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(4);
            dc.drawCircle(cx, cy, size + 10);
            dc.setPenWidth(1);
        }
        if (form.equals("Egg")) {
            dc.setColor(0xF4EEDC, Graphics.COLOR_TRANSPARENT);
            dc.fillEllipse(cx, cy, size * 0.78, size);
            dc.setColor(PURPLE, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(cx - size * 0.3, cy - size * 0.35, size * 0.16);
            dc.fillCircle(cx + size * 0.32, cy + size * 0.05, size * 0.2);
            dc.fillCircle(cx - size * 0.18, cy + size * 0.5, size * 0.12);
            return;
        }
        dc.setColor(PURPLE, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, size);
        var initial = form.substring(form.find("Mega ") == 0 ? 5 : 0, (form.find("Mega ") == 0 ? 5 : 0) + 1);
        text(dc, cy, Graphics.FONT_NUMBER_MEDIUM, initial, INK);
    }
}
