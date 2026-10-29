/** Small deterministic grid-maze helpers for a Legendary encounter trial.
 * This is a standalone mini-game mechanic; it does not alter expedition seeds,
 * meters, claimed count, or saved-data contracts.
 */
export type Direction = "up" | "down" | "left" | "right";
export type MazeCell = "#" | "." | "S" | "E";
export type Position = { row: number; col: number };

export const LEGENDARY_MAZE: readonly string[] = [
  "S..#...",
  "##.#.#.",
  "...#.#.",
  ".###...",
  "...##.#",
  "#....#.",
  "...#..E",
];

export function isMazeWalkable(
  layout: readonly string[],
  position: Position,
): boolean {
  if (position.row < 0 || position.row >= layout.length) return false;
  const row = layout[position.row];
  if (position.col < 0 || position.col >= row.length) return false;
  return row[position.col] !== "#";
}

export function moveInMaze(
  layout: readonly string[],
  position: Position,
  direction: Direction,
): Position {
  const delta: Record<Direction, Position> = {
    up: { row: -1, col: 0 },
    down: { row: 1, col: 0 },
    left: { row: 0, col: -1 },
    right: { row: 0, col: 1 },
  };
  const step = delta[direction];
  const next = { row: position.row + step.row, col: position.col + step.col };
  return isMazeWalkable(layout, next) ? next : position;
}

export function isMazeSolved(layout: readonly string[], position: Position): boolean {
  return layout[position.row]?.[position.col] === "E";
}
