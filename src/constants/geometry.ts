// 11-slot pyramid: 7 base (0=center, 1-6=hex ring) + 3 mid (7,8,9) + 1 apex (10).
// HCP is the vertical offset for hexagonal close-packed layers — the height
// gained when stacking a unit sphere into the pocket of three supports.
export const HCP = Math.sqrt(2 / 3);

export const NUM_SLOTS = 11;

export const SUPPORTS: Record<number, number[]> = {
  7: [0, 1, 2],
  8: [0, 3, 4],
  9: [0, 5, 6],
  10: [7, 8, 9],
};

// Inverse of SUPPORTS: for each slot, the slots that rest directly on top of
// it. Useful for "nothing above me" style rules (e.g. NOT_UNDER).
export const SUPPORTED_BY: Record<number, number[]> = (() => {
  const m: Record<number, number[]> = {};
  for (let i = 0; i <= 10; i++) m[i] = [];
  for (const [above, supports] of Object.entries(SUPPORTS)) {
    for (const s of supports) m[s].push(Number(above));
  }
  return m;
})();

export const POSITIONS_3D: Record<number, [number, number, number]> = (() => {
  const p: Record<number, [number, number, number]> = {};
  p[0] = [0, 0, 0];
  for (let i = 1; i <= 6; i++) {
    const a = ((i - 1) / 6) * Math.PI * 2;
    p[i] = [Math.cos(a), 0, Math.sin(a)];
  }
  for (const id of [7, 8, 9]) {
    const sup = SUPPORTS[id].map(s => p[s]);
    const cx = sup.reduce((a, q) => a + q[0], 0) / 3;
    const cz = sup.reduce((a, q) => a + q[2], 0) / 3;
    p[id] = [cx, HCP, cz];
  }
  const sup = SUPPORTS[10].map(s => p[s]);
  const cx = sup.reduce((a, q) => a + q[0], 0) / 3;
  const cz = sup.reduce((a, q) => a + q[2], 0) / 3;
  p[10] = [cx, 2 * HCP, cz];
  return p;
})();

export const SLOT_LAYER: Record<number, number> = {
  0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0,
  7: 1, 8: 1, 9: 1,
  10: 2,
};

export const ADJACENCIES: Record<number, number[]> = {
  0: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  1: [0, 2, 6, 7],
  2: [0, 1, 3, 7],
  3: [0, 2, 4, 8],
  4: [0, 3, 5, 8],
  5: [0, 4, 6, 9],
  6: [0, 1, 5, 9],
  7: [0, 1, 2, 8, 9, 10],
  8: [0, 3, 4, 7, 9, 10],
  9: [0, 5, 6, 7, 8, 10],
  10: [7, 8, 9],
};
