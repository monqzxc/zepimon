import type { Direction } from './safari-zone.ts'

// The trial before every Legendary encounter: a small maze walked one square at a time with the D-pad or the keyboard.
// Walls block the way; reaching the exit finishes the trial. Each Legendary has its own shrine and one of four layouts.
// The maze is a mini-game only: it never changes the trail, its distance or which Legendary waits at the end.
export type Cell = { row: number, col: number }
export type MazeStyle = 'winding' | 'spiral' | 'columns' | 'rooms'
export type Maze = { layout: readonly string[], at: Cell, moves: number, bumped: boolean, solved: boolean }

export const LAYOUTS: Record<MazeStyle, readonly string[]> = {
  winding: [
    'S.#.....#',
    '#.#.###.#',
    '..#...#..',
    '.####.##.',
    '......#..',
    '###.#.#.#',
    '..#.#....',
    '#.#.####.',
    '#...#...E'],
  spiral: [
    'S......#.',
    '######.#.',
    '.....#.#.',
    '.###.#.#.',
    '.#E#.#...',
    '.#.#.###.',
    '.#...#...',
    '.#####.##',
    '.........'],
  columns: [
    'S#...#...',
    '.#.#.#.#.',
    '.#.#...#.',
    '.#.###.#.',
    '.....#.#.',
    '####.#.#.',
    '...#.#.##',
    '.#...#...',
    '.#####.#E'],
  rooms: [
    'S..#.....',
    '.#.#.###.',
    '.#...#...',
    '.####.#.#',
    '...#..#..',
    '##.#.####',
    '...#.....',
    '.#####.#.',
    '.......#E']
}

const STEPS: Record<Direction, Cell> = { north: { row: -1, col: 0 }, south: { row: 1, col: 0 }, west: { row: 0, col: -1 }, east: { row: 0, col: 1 } }

export function mazeOpen(layout: readonly string[], { row, col }: Cell): boolean {
  return row >= 0 && row < layout.length && col >= 0 && col < layout[row].length && layout[row][col] !== '#'
}

export function startMaze(layout: readonly string[]): Maze {
  const row = layout.findIndex(line => line.includes('S'))
  return { layout, at: { row, col: layout[row].indexOf('S') }, moves: 0, bumped: false, solved: false }
}

export function stepMaze(maze: Maze, direction: Direction): Maze {
  if (maze.solved) return maze
  const next = { row: maze.at.row + STEPS[direction].row, col: maze.at.col + STEPS[direction].col }
  if (!mazeOpen(maze.layout, next)) return maze.bumped ? maze : { ...maze, bumped: true }
  return { ...maze, at: next, moves: maze.moves + 1, bumped: false, solved: maze.layout[next.row][next.col] === 'E' }
}

// Each Legendary's shrine: its trial's name, a line of lore and the maze it uses.
const TRIALS: Record<string, [string, MazeStyle, string]> = {
  Articuno: ['Frozen Feather Path', 'winding', 'Frost has sealed the old paths. Follow the falling feathers to Articuno’s clearing.'],
  Zapdos: ['Thunder Spire', 'columns', 'Lightning has split the spire into narrow halls. Find the one that leads to Zapdos.'],
  Moltres: ['Ember Caldera', 'winding', 'Cooling lava twists through the caldera. Pick a safe way across to Moltres.'],
  Mewtwo: ['Psychic Labyrinth', 'rooms', 'A maze of false turns guards the lab’s last room. Find the exit to face Mewtwo.'],
  Mew: ['Bubble Garden', 'spiral', 'Something playful keeps moving the hedges. Follow the giggles to the heart of the garden.'],
  Raikou: ['Storm Run', 'columns', 'Thunder echoes down long corridors. Race through to where Raikou waits.'],
  Entei: ['Burned Tower', 'rooms', 'Charred beams block the tower’s rooms. Find a way down to Entei.'],
  Suicune: ['Crystal Spring', 'spiral', 'Clear water winds inward. Follow the current to Suicune’s spring.'],
  Lugia: ['Whirl Islands', 'spiral', 'The whirlpools pull every path toward the deep. Ride them down to Lugia.'],
  'Ho-Oh': ['Bell Tower Ascent', 'columns', 'Climb the tower floor by floor to the rainbow at its top.'],
  Celebi: ['Ilex Shrine', 'winding', 'The forest shifts between moments. Keep to the path and reach the little shrine.'],
  Regirock: ['Desert Ruins', 'rooms', 'Sand fills half the chambers. Find the sealed door that opens to Regirock.'],
  Regice: ['Island Cave', 'rooms', 'The frozen rooms all look alike. Find the one where Regice sleeps.'],
  Registeel: ['Ancient Tomb', 'rooms', 'Iron walls seal the tomb’s chambers. Work your way to Registeel.'],
  Latias: ['Southern Island Breeze', 'winding', 'A warm wind runs through the island trees. Follow it to Latias.'],
  Latios: ['Southern Island Dusk', 'winding', 'Evening light paints a path through the trees. Follow it to Latios.'],
  Kyogre: ['Marine Cave', 'spiral', 'The tide channels coil toward the cave’s centre. Swim down to Kyogre.'],
  Groudon: ['Terra Cave', 'rooms', 'Hot stone corridors protect the sleeping guardian. Find the way through to Groudon.'],
  Rayquaza: ['Sky Pillar Ascent', 'columns', 'Ancient winds twist the stairs to the sky. Climb to the top to meet Rayquaza.'],
  Jirachi: ['Wishing Star Path', 'spiral', 'A trail of falling stars curls inward. Follow it to where Jirachi dreams.'],
  Deoxys: ['Birth Island Triangle', 'rooms', 'The rooms rearrange when you are not looking. Solve the triangle to reach Deoxys.'],
  Uxie: ['Lake Acuity', 'spiral', 'The cave remembers every step. Spiral inward to Uxie.'],
  Mesprit: ['Lake Verity', 'spiral', 'Warm feelings guide the way. Spiral inward to Mesprit.'],
  Azelf: ['Lake Valor', 'spiral', 'Only the brave keep going. Spiral inward to Azelf.'],
  Dialga: ['Spear Pillar: Time', 'columns', 'Each column ticks like a clock. Walk between the moments to Dialga.'],
  Palkia: ['Spear Pillar: Space', 'columns', 'Space folds between the columns. Find the true way to Palkia.'],
  Heatran: ['Stark Mountain', 'winding', 'Magma glows through cracks in the trail. Wind up the mountain to Heatran.'],
  Regigigas: ['Snowpoint Temple', 'rooms', 'Three keys woke the temple. Cross its rooms to the colossus.'],
  Giratina: ['Distortion World', 'rooms', 'Up and down trade places here. Find the exit to face Giratina.'],
  Cresselia: ['Fullmoon Island', 'spiral', 'Moonlight spirals through the trees. Follow it to Cresselia.'],
  Phione: ['Sea Currents', 'spiral', 'Gentle currents swirl together. Drift along them to Phione.'],
  Manaphy: ['Sea Temple', 'spiral', 'The temple’s halls spiral toward its heart. Swim on to Manaphy.'],
  Darkrai: ['Newmoon Nightmare', 'rooms', 'Dark dreams fill these rooms. Find the waking door to Darkrai.'],
  Shaymin: ['Flower Paradise', 'winding', 'Gracidea blooms line a winding path. Follow the flowers to Shaymin.'],
  Arceus: ['Hall of Origin', 'columns', 'Endless columns rise into light. Walk between them to Arceus.'],
  Zygarde: ['Terminus Cave', 'winding', 'Green cells glow along the cave walls. Follow them to Zygarde.'],
  Diancie: ['Diamond Domain', 'rooms', 'Crystal rooms reflect every turn. Find the one where Diancie sparkles.'],
  Magearna: ['Azoth Clockwork', 'columns', 'Gears turn between the corridors. Find the path to Magearna’s chamber.'],
  Zeraora: ['Thunderclap Trail', 'columns', 'Sparks leap between narrow halls. Chase them to Zeraora.']
}

export function trialFor(name: string): { title: string, lore: string, layout: readonly string[] } {
  const [title, style, lore] = TRIALS[name] ?? [`${name}’s Shrine`, 'winding', `A quiet maze protects ${name}. Find the golden exit to reach it.`]
  return { title, lore, layout: LAYOUTS[style] }
}
