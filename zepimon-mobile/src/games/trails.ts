// Trail Defense maps. Waypoints are cell centers: every trail enters from outside its board and ends on an edge, or in
// the middle for spirals. Runs never touch, so there is always a free row or column to build on between two of them.
// Element tiles (stage 5 onward): squares beside the trail, by type, where only a Pokemon of that type can stand.
export type TrailMap = { name: string, cols: number, rows: number, route: [number, number][], tiles?: Partial<Record<string, [number, number][]>> }

export const TRAIL_MAPS = {
  // The classic 6 x 8 trails: Adventure Map stops and free play.
  switchback: { name: 'Switchback Trail', cols: 6, rows: 8, route: [[0.5, -0.5], [0.5, 1.5], [4.5, 1.5], [4.5, 3.5], [1.5, 3.5], [1.5, 5.5], [4.5, 5.5], [4.5, 8.5]] },
  canyon: { name: 'Canyon Trail', cols: 6, rows: 8, route: [[2.5, -0.5], [2.5, 2.5], [0.5, 2.5], [0.5, 5.5], [3.5, 5.5], [3.5, 3.5], [5.5, 3.5], [5.5, 8.5]] },
  spiral: { name: 'Spiral Trail', cols: 6, rows: 8, route: [[-0.5, 0.5], [4.5, 0.5], [4.5, 6.5], [0.5, 6.5], [0.5, 2.5], [2.5, 2.5], [2.5, 4.5]] },

  // Level maps (src/games/levels.ts) grow from 6 x 8 to 9 x 16. Each stage ends on a spiral with the boss at its heart.
  'sprout-path': { name: 'Sprout Path', cols: 6, rows: 8, route: [[1.5, -0.5], [1.5, 2.5], [4.5, 2.5], [4.5, 5.5], [1.5, 5.5], [1.5, 8.5]] },
  'pidgey-bend': { name: 'Pidgey Bend', cols: 6, rows: 9, route: [[-0.5, 1.5], [4.5, 1.5], [4.5, 4.5], [1.5, 4.5], [1.5, 7.5], [6.5, 7.5]] },
  'caterpie-crawl': { name: 'Caterpie Crawl', cols: 6, rows: 10,
    route: [[4.5, -0.5], [4.5, 1.5], [1.5, 1.5], [1.5, 4.5], [4.5, 4.5], [4.5, 7.5], [1.5, 7.5], [1.5, 10.5]] },
  'weedle-woods': { name: 'Weedle Woods', cols: 7, rows: 10, route: [[0.5, -0.5], [0.5, 7.5], [3.5, 7.5], [3.5, 1.5], [6.5, 1.5], [6.5, 10.5]] },
  'celebi-grove': { name: 'Celebi’s Grove', cols: 7, rows: 11,
    route: [[-0.5, 0.5], [5.5, 0.5], [5.5, 9.5], [1.5, 9.5], [1.5, 3.5], [3.5, 3.5], [3.5, 6.5]] },

  'tide-pools': { name: 'Tide Pools', cols: 7, rows: 11,
    route: [[7.5, 1.5], [1.5, 1.5], [1.5, 4.5], [5.5, 4.5], [5.5, 7.5], [1.5, 7.5], [1.5, 9.5], [7.5, 9.5]] },
  'spark-shore': { name: 'Spark Shore', cols: 8, rows: 12, route: [[1.5, -0.5], [1.5, 9.5], [4.5, 9.5], [4.5, 1.5], [6.5, 1.5], [6.5, 12.5]] },
  'seafoam-steps': { name: 'Seafoam Steps', cols: 8, rows: 13,
    route: [[-0.5, 1.5], [6.5, 1.5], [6.5, 4.5], [1.5, 4.5], [1.5, 7.5], [6.5, 7.5], [6.5, 10.5], [1.5, 10.5], [1.5, 13.5]] },
  'harbor-hook': { name: 'Harbor Hook', cols: 8, rows: 13,
    route: [[6.5, -0.5], [6.5, 1.5], [1.5, 1.5], [1.5, 11.5], [6.5, 11.5], [6.5, 4.5], [3.5, 4.5], [3.5, 8.5]] },
  'whirl-islands': { name: 'Whirl Islands', cols: 8, rows: 13,
    route: [[0.5, -0.5], [0.5, 11.5], [6.5, 11.5], [6.5, 1.5], [2.5, 1.5], [2.5, 9.5], [4.5, 9.5], [4.5, 4.5]] },

  'ember-climb': { name: 'Ember Climb', cols: 8, rows: 13,
    route: [[6.5, 13.5], [6.5, 10.5], [1.5, 10.5], [1.5, 7.5], [6.5, 7.5], [6.5, 4.5], [1.5, 4.5], [1.5, 1.5], [6.5, 1.5], [6.5, -0.5]] },
  'magma-hook': { name: 'Magma Hook', cols: 9, rows: 13,
    route: [[9.5, 0.5], [1.5, 0.5], [1.5, 11.5], [7.5, 11.5], [7.5, 3.5], [3.5, 3.5], [3.5, 8.5], [5.5, 8.5], [5.5, 5.5]] },
  'cinder-ridge': { name: 'Cinder Ridge', cols: 9, rows: 14,
    route: [[-0.5, 1.5], [7.5, 1.5], [7.5, 4.5], [1.5, 4.5], [1.5, 7.5], [7.5, 7.5], [7.5, 10.5], [1.5, 10.5], [1.5, 12.5], [9.5, 12.5]] },
  'lava-fork': { name: 'Lava Fork', cols: 9, rows: 14,
    route: [[1.5, -0.5], [1.5, 12.5], [3.5, 12.5], [3.5, 1.5], [5.5, 1.5], [5.5, 12.5], [7.5, 12.5], [7.5, 0.5], [9.5, 0.5]] },
  'mt-ember': { name: 'Mt. Ember Crater', cols: 9, rows: 14,
    route: [[-0.5, 0.5], [7.5, 0.5], [7.5, 12.5], [1.5, 12.5], [1.5, 2.5], [5.5, 2.5], [5.5, 10.5], [3.5, 10.5], [3.5, 5.5]] },

  'haunted-wall': { name: 'Haunted Battlements', cols: 9, rows: 14,
    route: [[0.5, -0.5], [0.5, 4.5], [2.5, 4.5], [2.5, 1.5], [4.5, 1.5], [4.5, 4.5], [6.5, 4.5], [6.5, 1.5], [8.5, 1.5], [8.5, 8.5], [2.5, 8.5],
      [2.5, 11.5], [6.5, 11.5], [6.5, 14.5]] },
  'phantom-fork': { name: 'Phantom Fork', cols: 9, rows: 15,
    route: [[0.5, -0.5], [0.5, 6.5], [2.5, 6.5], [2.5, 0.5], [4.5, 0.5], [4.5, 6.5], [6.5, 6.5], [6.5, 0.5], [8.5, 0.5], [8.5, 9.5], [1.5, 9.5],
      [1.5, 12.5], [7.5, 12.5], [7.5, 15.5]] },
  'shadow-maze': { name: 'Shadow Maze', cols: 9, rows: 15,
    route: [[-0.5, 0.5], [7.5, 0.5], [7.5, 3.5], [1.5, 3.5], [1.5, 6.5], [7.5, 6.5], [7.5, 14.5], [5.5, 14.5], [5.5, 8.5], [3.5, 8.5], [3.5, 14.5],
      [1.5, 14.5], [1.5, 8.5], [-0.5, 8.5]] },
  'turnback-cave': { name: 'Turnback Cave', cols: 9, rows: 16,
    route: [[0.5, -0.5], [0.5, 14.5], [2.5, 14.5], [2.5, 1.5], [4.5, 1.5], [4.5, 14.5], [6.5, 14.5], [6.5, 1.5], [8.5, 1.5], [8.5, 16.5]] },
  'distortion-world': { name: 'Distortion World', cols: 9, rows: 16,
    route: [[-0.5, 0.5], [7.5, 0.5], [7.5, 14.5], [1.5, 14.5], [1.5, 2.5], [5.5, 2.5], [5.5, 12.5], [3.5, 12.5], [3.5, 5.5]] },

  // Stage 5, the Elemental Wilds: the biggest boards (10 x 17 to 12 x 20, pinch to zoom) with element tiles on the best
  // squares, most of them between two stretches of trail, where only a Pokemon of that type can stand.
  'verdant-delta': { name: 'Verdant Delta', cols: 10, rows: 17,
    route: [[-0.5, 1.5], [8.5, 1.5], [8.5, 5.5], [1.5, 5.5], [1.5, 9.5], [8.5, 9.5], [8.5, 13.5], [1.5, 13.5], [1.5, 17.5]],
    tiles: { water: [[3, 3], [6, 3], [4, 11], [7, 11]], grass: [[2, 7], [5, 7], [7, 7]] } },
  'thunder-plateau': { name: 'Thunder Plateau', cols: 10, rows: 18,
    route: [[1.5, -0.5], [1.5, 15.5], [4.5, 15.5], [4.5, 2.5], [7.5, 2.5], [7.5, 18.5]],
    tiles: { electric: [[3, 6], [3, 10], [6, 8], [6, 12]], rock: [[2, 12], [5, 5], [8, 10]] } },
  'glacier-pass': { name: 'Glacier Pass', cols: 11, rows: 18,
    route: [[11.5, 2.5], [1.5, 2.5], [1.5, 6.5], [9.5, 6.5], [9.5, 10.5], [1.5, 10.5], [1.5, 14.5], [9.5, 14.5], [9.5, 18.5]],
    tiles: { ice: [[4, 4], [7, 4], [3, 12], [6, 12]], fire: [[5, 8], [8, 8], [2, 16]] } },
  'dragons-spine': { name: 'Dragon’s Spine', cols: 11, rows: 19,
    route: [[1.5, -0.5], [1.5, 16.5], [4.5, 16.5], [4.5, 2.5], [7.5, 2.5], [7.5, 16.5], [9.5, 16.5], [9.5, -0.5]],
    tiles: { dragon: [[3, 9], [6, 6], [6, 12]], fire: [[2, 4], [5, 14]], rock: [[8, 8], [3, 14]] } },
  'hall-of-origin': { name: 'Hall of Origin', cols: 12, rows: 20,
    route: [[-0.5, 0.5], [10.5, 0.5], [10.5, 18.5], [1.5, 18.5], [1.5, 2.5], [8.5, 2.5], [8.5, 16.5], [3.5, 16.5], [3.5, 4.5], [6.5, 4.5], [6.5, 13.5]],
    tiles: { psychic: [[5, 9]], dragon: [[7, 10]], water: [[2, 10]], electric: [[9, 9]], ghost: [[4, 14]], fire: [[9, 14]], fairy: [[5, 6]] } }
} satisfies Record<string, TrailMap>
