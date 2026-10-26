// Trail Defense maps. Waypoints are cell centers: every trail enters from outside its board and ends on an edge, or in
// the middle for spirals. Runs never touch, so there is always a free row or column to build on between two of them.
export type TrailMap = { name: string, cols: number, rows: number, route: [number, number][] }

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
    route: [[-0.5, 0.5], [7.5, 0.5], [7.5, 14.5], [1.5, 14.5], [1.5, 2.5], [5.5, 2.5], [5.5, 12.5], [3.5, 12.5], [3.5, 5.5]] }
} satisfies Record<string, TrailMap>
