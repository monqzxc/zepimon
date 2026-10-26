# Interactive Pokemon artwork

The offline two-frame overworld poses come from [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion/tree/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011/graphics/pokemon), pinned to revision `0ecb1115129ccb7eb3a7e0dc3718dc263ab84011`.

See the [upstream contributors and resource credits](https://github.com/rh-hideout/pokeemerald-expansion/blob/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011/CREDITS.md). Mega overworld artwork is credited there to princess-phoenix, larryturbo and kidkatt. Original Pokémon characters and game artwork belong to their respective owners.

The build script extracts two south-facing poses so the Pokemon faces the viewer, applies the source normal/shiny palettes and fits them to a shared transparent canvas. Static fallback artwork remains from PokeAPI as documented in README.md. Unsupported forms and eggs stay still; no substitute species is animated in their place.

For Route Guard and Trail Defense foes, `scripts/build-trail-walkers.py` takes the same cached overworld sheets (normal palette only) and writes one strip per Gen 1-4 form to `assets/trail/`: two steps each facing south, north, west and east. Sheets without an east pose use the mirrored west pose.
