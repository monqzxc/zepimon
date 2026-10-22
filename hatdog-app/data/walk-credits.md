# Walking sprites

Source: [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion/tree/0ecb1115129ccb7eb3a7e0dc3718dc263ab84011/graphics/pokemon), revision `0ecb1115129ccb7eb3a7e0dc3718dc263ab84011`.

See [the retained upstream credits](walk-upstream-credits.md) for contributors and original resources. Upstream credits Mega overworld artwork to princess-phoenix, larryturbo and kidkatt. Pokémon characters and original game artwork belong to their respective owners.

`tools/build_walk_sprites.py` extracts the two west-facing walking frames, mirrors them to face east, applies the supplied normal/shiny overworld palettes and fits both frames to the same 24-pixel transparent canvas. Both frames are packed side by side into a 48 x 24 image at the existing portrait path. A bounded canvas scales and clips one frame at a time, with no extra image files. No new walking poses are synthesized. Running uses the same cycle at a faster cadence. Unsupported forms retain their existing still portrait; the exact list is in `walk-fallbacks.json`.
