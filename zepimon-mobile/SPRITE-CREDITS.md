# Interactive Pokemon artwork

The offline two-frame overworld poses come from [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion/tree/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011/graphics/pokemon), pinned to revision `0ecb1115129ccb7eb3a7e0dc3718dc263ab84011`.

See the [upstream contributors and resource credits](https://github.com/rh-hideout/pokeemerald-expansion/blob/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011/CREDITS.md). Mega overworld artwork is credited there to princess-phoenix, larryturbo and kidkatt. Original Pokémon characters and game artwork belong to their respective owners.

The build script extracts two south-facing poses so the Pokemon faces the viewer, applies the source normal/shiny palettes and fits them to a shared transparent canvas. Static fallback artwork remains from PokeAPI as documented in README.md. Unsupported forms and eggs stay still; no substitute species is animated in their place.

For Route Guard and Trail Defense, `scripts/build-trail-walkers.py` takes the same cached overworld sheets and writes Normal and Shiny strips for every form to `assets/trail/`: two steps each facing south, north, west and east. Sheets without an east pose use the mirrored west pose. Foes use the Normal strip under a shadow tint; your team uses its own variant.

# Move animations

The attack animations in Route Guard and Trail Defense are the Gen III battle animation sprites from the same repository, [graphics/battle_anims/sprites](https://github.com/rh-hideout/pokeemerald-expansion/tree/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011/graphics/battle_anims/sprites), at the same pinned revision and under the same credits. `scripts/build-move-sprites.py` downloads the sheets it needs into the shared cache, colours each with the palette the game loads for it, and writes upscaled frame strips to `assets/moves/`. Dragon Breath and Fairy Wind recolour the Ember and sparkle sheets, and Bite closes the upper teeth onto a flipped copy, as the game's own Bite does.

# Tab bar Gengar

The Gengar peeking over the tab bar, and floating over its Adventure button, is original vector fan art drawn for this app in `scripts/build-nav-gengar.mjs`, which renders its head, blink, surprised, paw and floating layers to `assets/nav/` with headless Chrome. Gengar belongs to its respective owners.

# Safari Zone

The Safari Zone's art comes from the same repository, [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion/tree/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011), at the same pinned revision and under the same [upstream credits](https://github.com/rh-hideout/pokeemerald-expansion/blob/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011/CREDITS.md). `scripts/build-safari-map.py` downloads what it needs into the shared cache and writes `assets/safari/`:

- Brendan's and May's walking sheets (`graphics/object_events/pics/people/`), recoloured for Zepimon: a purple-and-white cap and a black-and-white shirt. Only the cap and shirt rows change; bags, shoes, skin and hair keep Emerald's colours.
- The tall grass, ground dust and shadow field effects (`graphics/field_effects/pics/`), the item ball (`graphics/object_events/pics/misc/`) and the Safari Ball (`graphics/balls/`).
- The long grass and pond battle backgrounds (`graphics/battle_environment/`), drawn from their tilemaps and palettes.
- The map tiles: the General and Lilycove tilesets (`data/tilesets/`), the pair Emerald's own Safari Zone uses, arranged into our own layout in `scripts/safari/`. Rocks are Emerald's Safari Zone rock tiles.

# Legendary trials

The trial rooms' art comes from the same repository, [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion/tree/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011), at the same pinned revision `0ecb1115129ccb7eb3a7e0dc3718dc263ab84011` and under the same [upstream credits](https://github.com/rh-hideout/pokeemerald-expansion/blob/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011/CREDITS.md). Original Pokémon characters and game artwork belong to their respective owners. `scripts/build-trial-maps.py` downloads what it needs into the shared cache and writes `assets/trials/`:

- The room terrain: each kind takes the tileset pair (`data/tilesets/`) of one Emerald map, arranged into our own rooms in `scripts/trials/stages.json`: Mauville Gym (Building + Mauville Gym) for Switch Mazes, Sky Pillar (General + Pacifidlog) for Crumbling Floors, Granite Cave (General + Cave) for Dark Labyrinths, the Desert Ruins' pair (General + Cave, its desert sand and stone columns) for Ancient Temples, Mossdeep Gym (Building + Mossdeep Gym) for Warp Chambers and Birth Island's exterior (General + Dewford) for the Shattered Star.
- Switches and gates: Mauville Gym's floor switch and electric barrier, palette-swapped to red, blue and gold for the three gate groups.
- Fragile floor's cracks and hole, and the exit's sealed hatch and stairs, from Sky Pillar; the pressure plate (a stone slab), the sealed door (a braille slab, whose edge stays as the open doorway) and the clue stone (a braille stone) from the Desert Ruins; warp pads from Mossdeep Gym's floor buttons, brightened for their glow. These pieces are cut out of their own tileset's floor so they sit on any room's ground; gates and plates get a one-pixel outline.
- The relic (the Ruby) and the boulder (`graphics/object_events/pics/misc/`).
- The wall torch's flame (the Ember battle sprite), the Shattered Star's crystals (the Ice Crystals battle sprite, dimmed and brightened) and its meteorite (the Rock Throw boulder, with a turning glow for its patterns and split for its shatter frames), from `graphics/battle_anims/sprites/`.
