// Trail Defense maps. Waypoints are cell centers: every trail enters from outside its board and ends on an edge, or in
// the middle for spirals. Runs never touch, so there is always a free row or column to build on between two of them.
// Element tiles (stage 5 onward): squares beside the trail, by type, where only a Pokemon of that type can stand.
export type TrailMap = { name: string, cols: number, rows: number, route: [number, number][], tiles?: Partial<Record<string, [number, number][]>> }

export const TRAIL_MAPS = {
  // The classic 6 x 8 trails: Adventure Map stops and free play.
  switchback: { name: 'Switchback Trail', cols: 6, rows: 8, route: [[0.5, -0.5], [0.5, 1.5], [4.5, 1.5], [4.5, 3.5], [1.5, 3.5], [1.5, 5.5], [4.5, 5.5], [4.5, 8.5]] },
  canyon: { name: 'Canyon Trail', cols: 6, rows: 8, route: [[2.5, -0.5], [2.5, 2.5], [0.5, 2.5], [0.5, 5.5], [3.5, 5.5], [3.5, 3.5], [5.5, 3.5], [5.5, 8.5]] },
  spiral: { name: 'Spiral Trail', cols: 6, rows: 8, route: [[-0.5, 0.5], [4.5, 0.5], [4.5, 6.5], [0.5, 6.5], [0.5, 2.5], [2.5, 2.5], [2.5, 4.5]] },

  // Level maps (src/games/levels.ts) grow from 10 x 13 to 14 x 26, bigger than the screen: the camera pans over them
  // (src/games/ZoomPan.tsx). Each stage ends on a spiral with the boss at its heart.
  'sprout-path': { name: 'Sprout Path', cols: 10, rows: 13,
    route: [[2.5, -0.5], [2.5, 3.5], [7.5, 3.5], [7.5, 9.5], [2.5, 9.5], [2.5, 13.5]] },
  'pidgey-bend': { name: 'Pidgey Bend', cols: 10, rows: 14,
    route: [[-0.5, 2.5], [7.5, 2.5], [7.5, 7.5], [2.5, 7.5], [2.5, 11.5], [10.5, 11.5]] },
  'caterpie-crawl': { name: 'Caterpie Crawl', cols: 10, rows: 16,
    route: [[7.5, -0.5], [7.5, 2.5], [2.5, 2.5], [2.5, 7.5], [7.5, 7.5], [7.5, 12.5], [2.5, 12.5], [2.5, 16.5]] },
  'weedle-woods': { name: 'Weedle Woods', cols: 11, rows: 16,
    route: [[0.5, -0.5], [0.5, 12.5], [5.5, 12.5], [5.5, 2.5], [10.5, 2.5], [10.5, 16.5]] },
  'celebi-grove': { name: 'Celebi’s Grove', cols: 11, rows: 18,
    route: [[-0.5, 0.5], [8.5, 0.5], [8.5, 15.5], [2.5, 15.5], [2.5, 5.5], [5.5, 5.5], [5.5, 10.5]] },

  'tide-pools': { name: 'Tide Pools', cols: 11, rows: 18,
    route: [[11.5, 2.5], [2.5, 2.5], [2.5, 7.5], [8.5, 7.5], [8.5, 12.5], [2.5, 12.5], [2.5, 15.5], [11.5, 15.5]] },
  'spark-shore': { name: 'Spark Shore', cols: 13, rows: 19,
    route: [[2.5, -0.5], [2.5, 15.5], [7.5, 15.5], [7.5, 2.5], [10.5, 2.5], [10.5, 19.5]] },
  'seafoam-steps': { name: 'Seafoam Steps', cols: 13, rows: 21,
    route: [[-0.5, 2.5], [10.5, 2.5], [10.5, 7.5], [2.5, 7.5], [2.5, 12.5], [10.5, 12.5], [10.5, 17.5], [2.5, 17.5], [2.5, 21.5]] },
  'harbor-hook': { name: 'Harbor Hook', cols: 13, rows: 21,
    route: [[10.5, -0.5], [10.5, 2.5], [2.5, 2.5], [2.5, 18.5], [10.5, 18.5], [10.5, 7.5], [5.5, 7.5], [5.5, 13.5]] },
  'whirl-islands': { name: 'Whirl Islands', cols: 13, rows: 21,
    route: [[0.5, -0.5], [0.5, 18.5], [10.5, 18.5], [10.5, 2.5], [3.5, 2.5], [3.5, 15.5], [7.5, 15.5], [7.5, 7.5]] },

  'ember-climb': { name: 'Ember Climb', cols: 13, rows: 21,
    route: [[10.5, 21.5], [10.5, 17.5], [2.5, 17.5], [2.5, 12.5], [10.5, 12.5], [10.5, 7.5], [2.5, 7.5], [2.5, 2.5], [10.5, 2.5], [10.5, -0.5]] },
  'magma-hook': { name: 'Magma Hook', cols: 14, rows: 21,
    route: [[14.5, 0.5], [2.5, 0.5], [2.5, 18.5], [11.5, 18.5], [11.5, 5.5], [5.5, 5.5], [5.5, 13.5], [8.5, 13.5], [8.5, 8.5]] },
  'cinder-ridge': { name: 'Cinder Ridge', cols: 14, rows: 22,
    route: [[-0.5, 2.5], [11.5, 2.5], [11.5, 6.5], [2.5, 6.5], [2.5, 11.5], [11.5, 11.5], [11.5, 16.5], [2.5, 16.5], [2.5, 19.5], [14.5, 19.5]] },
  'lava-fork': { name: 'Lava Fork', cols: 14, rows: 22,
    route: [[2.5, -0.5], [2.5, 19.5], [5.5, 19.5], [5.5, 2.5], [8.5, 2.5], [8.5, 19.5], [11.5, 19.5], [11.5, 0.5], [14.5, 0.5]] },
  'mt-ember': { name: 'Mt. Ember Crater', cols: 14, rows: 22,
    route: [[-0.5, 0.5], [11.5, 0.5], [11.5, 19.5], [2.5, 19.5], [2.5, 3.5], [8.5, 3.5], [8.5, 16.5], [5.5, 16.5], [5.5, 8.5]] },

  'haunted-wall': { name: 'Haunted Battlements', cols: 14, rows: 22,
    route: [[0.5, -0.5], [0.5, 6.5], [3.5, 6.5], [3.5, 2.5], [7.5, 2.5], [7.5, 6.5], [10.5, 6.5], [10.5, 2.5], [13.5, 2.5], [13.5, 13.5], [3.5, 13.5], [3.5, 18.5], [10.5, 18.5], [10.5, 22.5]] },
  'phantom-fork': { name: 'Phantom Fork', cols: 14, rows: 24,
    route: [[0.5, -0.5], [0.5, 10.5], [3.5, 10.5], [3.5, 0.5], [7.5, 0.5], [7.5, 10.5], [10.5, 10.5], [10.5, 0.5], [13.5, 0.5], [13.5, 15.5], [2.5, 15.5], [2.5, 20.5], [11.5, 20.5], [11.5, 24.5]] },
  'shadow-maze': { name: 'Shadow Maze', cols: 14, rows: 24,
    route: [[-0.5, 0.5], [11.5, 0.5], [11.5, 5.5], [2.5, 5.5], [2.5, 10.5], [11.5, 10.5], [11.5, 23.5], [8.5, 23.5], [8.5, 13.5], [5.5, 13.5], [5.5, 23.5], [2.5, 23.5], [2.5, 13.5], [-0.5, 13.5]] },
  'turnback-cave': { name: 'Turnback Cave', cols: 14, rows: 26,
    route: [[0.5, -0.5], [0.5, 23.5], [3.5, 23.5], [3.5, 2.5], [7.5, 2.5], [7.5, 23.5], [10.5, 23.5], [10.5, 2.5], [13.5, 2.5], [13.5, 26.5]] },
  'distortion-world': { name: 'Distortion World', cols: 14, rows: 26,
    route: [[-0.5, 0.5], [11.5, 0.5], [11.5, 23.5], [2.5, 23.5], [2.5, 3.5], [8.5, 3.5], [8.5, 20.5], [5.5, 20.5], [5.5, 8.5]] },

  // Stage 5, the Elemental Wilds: the biggest boards (16 x 27 to 19 x 32) with element tiles on the best
  // squares, most of them between two stretches of trail, where only a Pokemon of that type can stand.
  'verdant-delta': { name: 'Verdant Delta', cols: 16, rows: 27,
    route: [[-0.5, 2.5], [13.5, 2.5], [13.5, 8.5], [2.5, 8.5], [2.5, 15.5], [13.5, 15.5], [13.5, 21.5], [2.5, 21.5], [2.5, 27.5]],
    tiles: { water: [[5, 4], [10, 4], [7, 17], [12, 18]], grass: [[3, 11], [8, 10], [12, 10]] } },
  'thunder-plateau': { name: 'Thunder Plateau', cols: 16, rows: 29,
    route: [[2.5, -0.5], [2.5, 25.5], [7.5, 25.5], [7.5, 3.5], [12.5, 3.5], [12.5, 29.5]],
    tiles: { electric: [[5, 10], [5, 16], [10, 13], [10, 20]], rock: [[3, 20], [8, 8], [13, 16]] } },
  'glacier-pass': { name: 'Glacier Pass', cols: 18, rows: 29,
    route: [[18.5, 3.5], [2.5, 3.5], [2.5, 10.5], [15.5, 10.5], [15.5, 16.5], [2.5, 16.5], [2.5, 23.5], [15.5, 23.5], [15.5, 29.5]],
    tiles: { ice: [[7, 8], [12, 8], [4, 20], [10, 21]], fire: [[9, 12], [14, 13], [3, 25]] } },
  'dragons-spine': { name: 'Dragon’s Spine', cols: 18, rows: 30,
    route: [[2.5, -0.5], [2.5, 26.5], [7.5, 26.5], [7.5, 3.5], [12.5, 3.5], [12.5, 26.5], [15.5, 26.5], [15.5, -0.5]],
    tiles: { dragon: [[5, 15], [10, 10], [10, 19]], fire: [[3, 6], [9, 23]], rock: [[14, 13], [5, 23]] } },
  'hall-of-origin': { name: 'Hall of Origin', cols: 19, rows: 32,
    route: [[-0.5, 0.5], [16.5, 0.5], [16.5, 29.5], [2.5, 29.5], [2.5, 3.5], [13.5, 3.5], [13.5, 26.5], [5.5, 26.5], [5.5, 7.5], [10.5, 7.5], [10.5, 21.5]],
    tiles: { psychic: [[8, 15]], dragon: [[11, 16]], water: [[3, 16]], electric: [[15, 15]], ghost: [[7, 23]], fire: [[15, 23]], fairy: [[8, 10]] } }
} satisfies Record<string, TrailMap>
