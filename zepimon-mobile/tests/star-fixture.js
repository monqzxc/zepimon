// A small deterministic Shattered Star island, shared by the rules tests and the solver test.
export const STAR = {
  id: 'star-fixture', kind: 'star', tiles: ['.%.%.', '..MM.', '?.MM.', '@...%'], warps: {}, open: '', crackAll: false, dark: false, par: 99, hint: '',
  star: {
    nodes: [{ id: 'n1', at: [1, 0], links: ['n2'], turns: 0 }, { id: 'n2', at: [3, 0], links: [], turns: 1 }, { id: 'n3', at: [4, 3], links: ['n1'], turns: 0 }],
    patterns: 3, startLit: [], target: { lit: ['n1'], pattern: 1 }, resetOnFail: false,
    clues: [{ at: [0, 2], text: 'One light alone, one point turned.', reveals: ['n1', 'n2', 'n3', 'pattern'] }],
    hints: ['Some crystals wake their neighbours.', 'The eastern crystal turns the star.', 'Only the western crystal should shine.'],
  },
}
