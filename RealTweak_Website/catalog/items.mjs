// RealTweak furniture catalog — the single source of truth for the website and the Unity AR app.
//
// Every model is a list of primitive parts so both renderers (Three.js and Unity) build the
// exact same object. Run `npm run catalog` after editing; it writes src/catalog.json and the
// Unity copy in RealTweak_AR/Assets/RealTweak/Resources/RealTweakCatalog.json.
//
// Conventions (web / Three.js, right-handed, meters):
//   origin = bottom-center of the footprint, +Y up, the front of the piece faces +Z.
//   Part position is the part's center. Rotations are XYZ Euler degrees.
//   Cylinders/spheres: w = X diameter, d = Z diameter, h = height. t = top/bottom diameter ratio.
//   Colour "main" follows the item's editable finish; other values are fixed hex colours.
//   Material hints: fabric, wood, metal, glass, light (emissive), gloss, ceramic.

const parts = [];
const r3 = v => Math.round(v * 1000) / 1000;

function box(x, y0, z, w, h, d, c = 'main', o = {}) {
  parts.push({ s: 'box', x, y: y0 + h / 2, z, w, h, d, c, ...o });
}
function cyl(x, y0, z, dia, h, c = 'main', o = {}) {
  parts.push({ s: 'cyl', x, y: y0 + h / 2, z, w: dia, h, d: o.dz ?? dia, c, t: o.t ?? 1, ...strip(o, ['dz', 't']) });
}
function sph(x, y, z, w, h, d, c = 'main', o = {}) {
  parts.push({ s: 'sph', x, y, z, w, h, d, c, ...o });
}
function strip(o, keys) { const r = { ...o }; for (const k of keys) delete r[k]; return r; }

// Shared building blocks -----------------------------------------------------------------
const WOOD_DARK = '#5e4a39', METAL = '#8d9196', BLACK = '#232527', WHITE = '#f4f3ef', STEEL = '#c9cdd1', LINEN = '#f1ede4';

function legs(w, d, h, inset = 0.05, size = 0.045, c = WOOD_DARK, round = false) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - inset - size / 2), z = sz * (d / 2 - inset - size / 2);
    if (round) cyl(x, 0, z, size, h, c, { m: 'metal' }); else box(x, 0, z, size, h, size, c, { m: 'wood' });
  }
}
function handle(x, y, z, vertical = false, len = 0.12) {
  box(x, y - (vertical ? len / 2 : 0.01), z, vertical ? 0.015 : len, vertical ? len : 0.02, 0.02, METAL, { m: 'metal' });
}
function sofa(w, d, seats, h = 0.85) {
  const arm = 0.16, seatW = (w - 2 * arm) / seats;
  box(0, 0.08, 0, w, 0.3, d, 'main', { m: 'fabric' });
  for (let i = 0; i < seats; i++) box(-w / 2 + arm + seatW * (i + 0.5), 0.38, 0.06, seatW - 0.02, 0.13, d - 0.22, 'main', { m: 'fabric' });
  box(0, 0.38, -d / 2 + 0.1, w, h - 0.38, 0.2, 'main', { m: 'fabric' });
  for (let i = 0; i < seats; i++) box(-w / 2 + arm + seatW * (i + 0.5), 0.5, -d / 2 + 0.26, seatW - 0.05, 0.32, 0.12, 'main', { m: 'fabric' });
  for (const s of [-1, 1]) box(s * (w / 2 - arm / 2), 0.38, 0, arm, 0.24, d, 'main', { m: 'fabric' });
  legs(w, d, 0.08, 0.06, 0.05, WOOD_DARK);
}
function bed(w, d, headH = 1.0) {
  box(0, 0.12, 0.02, w, 0.22, d - 0.04, 'main', { m: 'wood' });
  legs(w, d, 0.12, 0.04, 0.07);
  box(0, 0.34, 0.04, w - 0.08, 0.22, d - 0.14, LINEN, { m: 'fabric' });
  box(0, 0.08, -d / 2 + 0.04, w, headH - 0.08, 0.08, 'main', { m: 'fabric' });
  const pillows = w > 1.2 ? [-w / 4, w / 4] : [0];
  for (const x of pillows) box(x, 0.56, -d / 2 + 0.33, w / pillows.length - 0.16, 0.12, 0.38, '#ffffff', { m: 'fabric' });
  box(0, 0.56, 0.2, w - 0.04, 0.06, d - 0.75, '#c8d3d8', { m: 'fabric' });
}
function cabinetBody(w, h, d, { kick = 0.1, top = null, doors = 1, drawers = 0 } = {}) {
  box(0, kick, -0.01, w, h - kick - (top ? 0.04 : 0), d - 0.02, 'main', { m: 'wood' });
  if (kick) box(0, 0, -0.04, w - 0.04, kick, d - 0.1, BLACK);
  if (top) box(0, h - 0.04, 0.01, w + 0.02, 0.04, d + 0.02, top, { m: 'gloss' });
  const fy = kick + 0.01, fh = h - kick - (top ? 0.06 : 0.02);
  if (drawers) {
    const dh = fh / drawers;
    for (let i = 0; i < drawers; i++) {
      box(0, fy + i * dh + 0.005, d / 2 - 0.005, w - 0.03, dh - 0.01, 0.012, 'main', { m: 'wood' });
      handle(0, fy + (i + 0.5) * dh + 0.01, d / 2 + 0.01, false, Math.min(0.2, w * 0.3));
    }
  } else {
    const dw = (w - 0.03) / doors;
    for (let i = 0; i < doors; i++) {
      const x = -w / 2 + 0.015 + dw * (i + 0.5);
      box(x, fy, d / 2 - 0.005, dw - 0.008, fh, 0.012, 'main', { m: 'wood' });
      handle(x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), fy + fh * 0.75, d / 2 + 0.01, true);
    }
  }
}
function faucet(x, y, z) {
  cyl(x, y, z, 0.035, 0.22, STEEL, { m: 'metal' });
  box(x, y + 0.2, z + 0.06, 0.03, 0.03, 0.14, STEEL, { m: 'metal' });
}
function straightStairs(w, h, d, steps) {
  const rise = h / steps, run = d / steps;
  for (let i = 0; i < steps; i++) {
    // Solid blocks: step i rises toward -Z (the back of the footprint).
    box(0, 0, d / 2 - (i + 0.5) * run, w, (i + 1) * rise, run, 'main', { m: 'wood' });
    box(0, (i + 1) * rise - 0.02, d / 2 - (i + 0.5) * run + 0.015, w + 0.02, 0.03, run + 0.03, '#a07a52', { m: 'wood' });
  }
  const len = Math.hypot(h, d), angle = Math.atan2(h, d) * 180 / Math.PI;
  for (const s of [-1, 1]) {
    box(s * (w / 2 - 0.03), h / 2 + 0.9 - 0.025, 0, 0.05, 0.05, len, BLACK, { rx: angle, m: 'metal' });
    for (let i = 0; i < steps; i += 2) box(s * (w / 2 - 0.03), (i + 1) * rise, d / 2 - (i + 0.5) * run, 0.025, 0.9, 0.025, BLACK, { m: 'metal' });
  }
}

// Item definitions ---------------------------------------------------------------------------
// [type, name, category, width, height, depth, colour, build, options]
const defs = [
  // Living
  ['sofa', 'Everyday sofa', 'Living', 2.1, 0.85, 0.92, '#879787', () => sofa(2.1, 0.92, 3), { tags: 'couch settee three seater' }],
  ['loveseat', 'Loveseat', 'Living', 1.5, 0.85, 0.9, '#a3876b', () => sofa(1.5, 0.9, 2), { tags: 'sofa couch two seater' }],
  ['sectional', 'Corner sectional', 'Living', 2.6, 0.85, 1.7, '#8b98a3', () => {
    box(0, 0.08, -0.39, 2.6, 0.3, 0.92, 'main', { m: 'fabric' });
    box(0.95, 0.08, 0.46, 0.7, 0.3, 0.78, 'main', { m: 'fabric' });
    for (const x of [-0.8, 0.0]) box(x, 0.38, -0.33, 0.78, 0.13, 0.7, 'main', { m: 'fabric' });
    box(0.95, 0.38, 0.05, 0.66, 0.13, 1.5, 'main', { m: 'fabric' });
    box(0, 0.38, -0.75, 2.6, 0.47, 0.2, 'main', { m: 'fabric' });
    box(-1.22, 0.38, -0.39, 0.16, 0.24, 0.92, 'main', { m: 'fabric' });
  }, { tags: 'sofa l-shaped couch corner' }],
  ['armchair', 'Lounge armchair', 'Living', 0.85, 0.88, 0.85, '#c49a6c', () => {
    box(0, 0.12, 0, 0.85, 0.28, 0.85, 'main', { m: 'fabric' });
    box(0, 0.4, 0.06, 0.55, 0.12, 0.68, 'main', { m: 'fabric' });
    box(0, 0.4, -0.33, 0.85, 0.48, 0.19, 'main', { m: 'fabric' });
    for (const s of [-1, 1]) box(s * 0.34, 0.4, 0.02, 0.17, 0.2, 0.81, 'main', { m: 'fabric' });
    legs(0.85, 0.85, 0.12, 0.05, 0.05);
  }, { tags: 'chair lounge accent' }],
  ['ottoman', 'Ottoman', 'Living', 0.6, 0.42, 0.6, '#b9a58b', () => { box(0, 0.06, 0, 0.6, 0.36, 0.6, 'main', { m: 'fabric' }); legs(0.6, 0.6, 0.06, 0.04, 0.04); }, { tags: 'pouf footstool' }],
  ['beanbag', 'Bean bag', 'Living', 0.8, 0.65, 0.8, '#d08a5a', () => { sph(0, 0.28, 0, 0.8, 0.56, 0.8, 'main', { m: 'fabric' }); sph(0, 0.42, -0.2, 0.62, 0.46, 0.4, 'main', { m: 'fabric' }); }, { tags: 'beanbag pouf' }],
  ['coffee-table', 'Coffee table', 'Living', 1.1, 0.42, 0.6, '#b58b62', () => {
    box(0, 0.38, 0, 1.1, 0.04, 0.6, 'main', { m: 'wood' }); box(0, 0.1, 0, 1.0, 0.02, 0.5, 'main', { m: 'wood' }); legs(1.1, 0.6, 0.38, 0.03, 0.04);
  }, { tags: 'table centre center' }],
  ['side-table', 'Side table', 'Living', 0.5, 0.55, 0.5, '#d6c3a5', () => {
    cyl(0, 0.52, 0, 0.5, 0.03, 'main', { m: 'wood' }); cyl(0, 0.03, 0, 0.05, 0.49, BLACK, { m: 'metal' }); cyl(0, 0, 0, 0.34, 0.03, BLACK, { m: 'metal' });
  }, { tags: 'end table round' }],
  ['tv-stand', 'TV console', 'Living', 1.6, 0.5, 0.4, '#a77d57', () => cabinetBody(1.6, 0.5, 0.4, { kick: 0.08, doors: 3 }), { tags: 'media unit cabinet' }],
  ['tv', 'Television 55"', 'Electronics', 1.23, 0.78, 0.25, BLACK, () => {
    box(0, 0, 0, 0.42, 0.02, 0.22, BLACK, { m: 'metal' }); box(0, 0.02, -0.02, 0.06, 0.08, 0.04, BLACK, { m: 'metal' });
    box(0, 0.08, -0.02, 1.23, 0.7, 0.05, 'main', { m: 'gloss' }); box(0, 0.1, 0.006, 1.19, 0.66, 0.004, '#0e1c27', { m: 'glass' });
  }, { elev: 0.5, tags: 'television screen' }],
  ['tv-wall', 'Wall TV 65"', 'Electronics', 1.45, 0.84, 0.05, BLACK, () => {
    box(0, 0, 0, 1.45, 0.84, 0.05, 'main', { m: 'gloss' }); box(0, 0.02, 0.026, 1.41, 0.8, 0.004, '#0e1c27', { m: 'glass' });
  }, { mount: 'wall', elev: 1.0, tags: 'television screen mounted' }],
  ['speaker', 'Floor speaker', 'Electronics', 0.25, 1.0, 0.3, '#2f3133', () => {
    box(0, 0, 0, 0.25, 1.0, 0.3, 'main', { m: 'wood' }); for (const y of [0.25, 0.55, 0.82]) cyl(0, y, 0.15, 0.12, 0.02, BLACK, { rx: 90 });
  }, { tags: 'audio sound' }],
  ['bookshelf', 'Bookcase', 'Living', 1.0, 1.8, 0.35, '#a88966', () => {
    for (const s of [-1, 1]) box(s * 0.485, 0, 0, 0.03, 1.8, 0.35, 'main', { m: 'wood' });
    box(0, 0, -0.17, 0.94, 1.8, 0.01, 'main', { m: 'wood' });
    const shelfY = [0, 0.44, 0.88, 1.32, 1.77];
    for (const y of shelfY) box(0, y, 0, 0.94, 0.03, 0.35, 'main', { m: 'wood' });
    const colors = ['#6d8a96', '#b55d4c', '#e1c16e', '#5b6b5d', '#8a6f9e', '#d9d2c3'];
    let k = 0;
    for (const y of shelfY.slice(0, 4)) for (let x = -0.4; x < 0.3; x += 0.09 + (k % 3) * 0.015) {
      const bh = 0.24 + (k % 4) * 0.035; box(x, y + 0.03, 0, 0.07, bh, 0.24, colors[k++ % colors.length]);
    }
  }, { tags: 'shelf books shelving storage' }],
  ['fireplace', 'Fireplace', 'Living', 1.4, 1.1, 0.4, '#e7e2d8', () => {
    for (const s of [-1, 1]) box(s * 0.55, 0, 0, 0.3, 1.04, 0.4, 'main', { m: 'ceramic' });
    box(0, 0.78, 0, 0.8, 0.26, 0.4, 'main', { m: 'ceramic' }); box(0, 0, 0.0, 0.8, 0.08, 0.4, 'main', { m: 'ceramic' });
    box(0, 0.08, -0.05, 0.8, 0.7, 0.3, '#2b2420'); box(0, 1.04, 0.03, 1.5, 0.06, 0.46, 'main', { m: 'ceramic' });
    box(0, 0.1, -0.02, 0.5, 0.2, 0.12, '#ff8a3d', { m: 'light' });
  }, { mount: 'wall', tags: 'hearth chimney' }],
  ['rug', 'Woven rug', 'Decor', 2.0, 0.015, 1.5, '#dac7a5', () => {
    box(0, 0, 0, 2.0, 0.01, 1.5, 'main', { m: 'fabric' }); box(0, 0.002, 0, 1.8, 0.012, 1.3, '#c5ad84', { m: 'fabric' }); box(0, 0.004, 0, 1.6, 0.012, 1.1, 'main', { m: 'fabric' });
  }, { tags: 'carpet mat' }],
  ['rug-round', 'Round rug', 'Decor', 1.6, 0.015, 1.6, '#b9c4b0', () => {
    cyl(0, 0, 0, 1.6, 0.01, 'main', { m: 'fabric' }); cyl(0, 0.002, 0, 1.35, 0.012, '#9fae95', { m: 'fabric' });
  }, { tags: 'carpet mat circle' }],

  // Dining
  ['table', 'Dining table', 'Dining', 1.8, 0.75, 0.9, '#c2a07a', () => {
    box(0, 0.71, 0, 1.8, 0.04, 0.9, 'main', { m: 'wood' }); box(0, 0.63, 0, 1.6, 0.08, 0.7, 'main', { m: 'wood' }); legs(1.8, 0.9, 0.71, 0.08, 0.07);
  }, { tags: 'dining kitchen table' }],
  ['table-round', 'Round dining table', 'Dining', 1.1, 0.75, 1.1, '#d2b48c', () => {
    cyl(0, 0.71, 0, 1.1, 0.04, 'main', { m: 'wood' }); cyl(0, 0.05, 0, 0.12, 0.66, 'main', { m: 'wood' }); cyl(0, 0, 0, 0.55, 0.05, 'main', { m: 'wood' });
  }, { tags: 'dining table circle' }],
  ['chair', 'Dining chair', 'Dining', 0.46, 0.9, 0.5, '#b88b61', () => {
    legs(0.46, 0.5, 0.43, 0.02, 0.04);
    box(0, 0.43, 0.02, 0.46, 0.05, 0.46, 'main', { m: 'wood' });
    for (const s of [-1, 1]) box(s * 0.2, 0.48, -0.21, 0.04, 0.42, 0.04, WOOD_DARK, { m: 'wood' });
    box(0, 0.64, -0.215, 0.44, 0.24, 0.03, 'main', { m: 'wood' });
  }, { tags: 'seat dining kitchen' }],
  ['bar-stool', 'Bar stool', 'Dining', 0.4, 0.75, 0.4, '#3d3f42', () => {
    cyl(0, 0.7, 0, 0.38, 0.05, 'main', { m: 'fabric' }); cyl(0, 0.03, 0, 0.05, 0.67, METAL, { m: 'metal' });
    cyl(0, 0, 0, 0.38, 0.03, METAL, { m: 'metal' }); cyl(0, 0.28, 0, 0.32, 0.02, METAL, { m: 'metal', t: 1 });
  }, { tags: 'stool counter bar' }],
  ['bench', 'Bench', 'Dining', 1.2, 0.45, 0.38, '#b08a62', () => { box(0, 0.41, 0, 1.2, 0.04, 0.38, 'main', { m: 'wood' }); legs(1.2, 0.38, 0.41, 0.06, 0.05); }, { tags: 'seat' }],
  ['sideboard', 'Sideboard', 'Dining', 1.6, 0.8, 0.45, '#8c6b4f', () => { cabinetBody(1.6, 0.8, 0.45, { kick: 0.15, doors: 4 }); legs(1.6, 0.45, 0.15, 0.04, 0.04); }, { tags: 'buffet credenza cabinet storage' }],

  // Bedroom
  ['bed', 'Double bed', 'Bedroom', 1.6, 1.0, 2.1, '#9c8268', () => bed(1.6, 2.1), { tags: 'queen bed' }],
  ['bed-king', 'King bed', 'Bedroom', 1.95, 1.1, 2.15, '#6f6a66', () => bed(1.95, 2.15, 1.1), { tags: 'bed large' }],
  ['bed-single', 'Single bed', 'Bedroom', 1.0, 0.9, 2.05, '#c1a787', () => bed(1.0, 2.05, 0.9), { tags: 'bed twin kids' }],
  ['bunk-bed', 'Bunk bed', 'Kids', 1.0, 1.65, 2.05, '#c9a77c', () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 0.47, 0, sz * 0.995, 0.06, 1.65, 0.06, 'main', { m: 'wood' });
    for (const y of [0.22, 1.12]) { box(0, y, 0, 1.0, 0.08, 2.05, 'main', { m: 'wood' }); box(0, y + 0.08, 0, 0.92, 0.16, 1.95, LINEN, { m: 'fabric' }); }
    for (const s of [-1, 1]) box(0, 1.45, s * 0.995, 0.94, 0.06, 0.04, 'main', { m: 'wood' });
    box(0.47, 1.4, -0.3, 0.04, 0.06, 1.3, 'main', { m: 'wood' });
    for (let y = 0.4; y < 1.2; y += 0.25) box(0.5, y, 0.75, 0.03, 0.04, 0.4, 'main', { m: 'wood' });
  }, { tags: 'bed kids children double deck' }],
  ['crib', 'Baby crib', 'Kids', 0.7, 0.95, 1.3, '#f2efe8', () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 0.33, 0, sz * 0.63, 0.04, 0.95, 0.04, 'main', { m: 'wood' });
    box(0, 0.3, 0, 0.66, 0.12, 1.24, LINEN, { m: 'fabric' });
    for (const sz of [-1, 1]) { box(0, 0.9, sz * 0.63, 0.66, 0.04, 0.03, 'main'); for (let x = -0.27; x <= 0.28; x += 0.09) box(x, 0.3, sz * 0.63, 0.02, 0.6, 0.02, 'main'); }
    for (const sx of [-1, 1]) { box(sx * 0.33, 0.9, 0, 0.03, 0.04, 1.22, 'main'); for (let z = -0.54; z <= 0.55; z += 0.09) box(sx * 0.33, 0.3, z, 0.02, 0.6, 0.02, 'main'); }
  }, { tags: 'cot baby nursery' }],
  ['nightstand', 'Nightstand', 'Bedroom', 0.5, 0.55, 0.4, '#b4906b', () => { cabinetBody(0.5, 0.55, 0.4, { kick: 0.12, drawers: 2 }); legs(0.5, 0.4, 0.12, 0.03, 0.035); }, { tags: 'bedside table drawer' }],
  ['wardrobe', 'Wardrobe', 'Bedroom', 1.2, 2.1, 0.6, '#d8cfc2', () => cabinetBody(1.2, 2.1, 0.6, { kick: 0.06, doors: 2 }), { tags: 'closet armoire storage' }],
  ['wardrobe-large', 'Wardrobe 3-door', 'Bedroom', 1.8, 2.2, 0.6, '#ece8e1', () => cabinetBody(1.8, 2.2, 0.6, { kick: 0.06, doors: 3 }), { tags: 'closet armoire storage' }],
  ['dresser', 'Chest of drawers', 'Bedroom', 1.2, 0.85, 0.5, '#9f7b58', () => { cabinetBody(1.2, 0.85, 0.5, { kick: 0.1, drawers: 3 }); }, { tags: 'dresser drawers storage' }],
  ['dressing-table', 'Dressing table', 'Bedroom', 1.0, 1.5, 0.45, '#efe9e0', () => {
    box(0, 0.72, 0, 1.0, 0.04, 0.45, 'main', { m: 'wood' }); box(0.3, 0.55, 0, 0.38, 0.17, 0.43, 'main', { m: 'wood' }); legs(1.0, 0.45, 0.72, 0.03, 0.04);
    box(0, 0.76, -0.2, 0.7, 0.7, 0.03, 'main', { m: 'wood' }); box(0, 0.8, -0.18, 0.62, 0.62, 0.006, '#cfe0e6', { m: 'glass' });
  }, { mount: 'wall', tags: 'vanity makeup mirror' }],

  // Office
  ['desk', 'Writing desk', 'Office', 1.4, 0.75, 0.7, '#bd9971', () => {
    box(0, 0.72, 0, 1.4, 0.03, 0.7, 'main', { m: 'wood' }); legs(1.4, 0.7, 0.72, 0.03, 0.04, BLACK, true);
    box(0.45, 0.55, 0, 0.42, 0.17, 0.6, 'main', { m: 'wood' }); handle(0.45, 0.64, 0.31);
  }, { tags: 'table study work computer' }],
  ['desk-l', 'Corner desk', 'Office', 1.6, 0.75, 1.5, '#e4e1da', () => {
    box(0, 0.72, -0.4, 1.6, 0.03, 0.7, 'main', { m: 'wood' }); box(0.45, 0.72, 0.38, 0.7, 0.03, 0.74, 'main', { m: 'wood' });
    for (const [x, z] of [[-0.76, -0.71], [-0.76, -0.09], [0.76, -0.71], [0.76, 0.71], [0.14, 0.71]]) box(x, 0, z, 0.05, 0.72, 0.05, BLACK, { m: 'metal' });
  }, { tags: 'desk l-shaped workstation' }],
  ['office-chair', 'Office chair', 'Office', 0.65, 1.1, 0.65, '#3a4148', () => {
    for (let i = 0; i < 5; i++) {
      const a = i * 72, rad = a * Math.PI / 180;
      box(Math.cos(rad) * 0.15, 0.05, -Math.sin(rad) * 0.15, 0.3, 0.035, 0.04, BLACK, { ry: a, m: 'metal' });
      sph(Math.cos(rad) * 0.29, 0.03, -Math.sin(rad) * 0.29, 0.05, 0.05, 0.05, BLACK);
    }
    cyl(0, 0.07, 0, 0.05, 0.36, METAL, { m: 'metal' });
    box(0, 0.43, 0.02, 0.5, 0.08, 0.48, 'main', { m: 'fabric' });
    box(0, 0.55, -0.24, 0.46, 0.52, 0.06, 'main', { m: 'fabric', rx: -8 });
    for (const s of [-1, 1]) { box(s * 0.26, 0.5, 0.02, 0.03, 0.15, 0.03, BLACK); box(s * 0.26, 0.64, 0.04, 0.06, 0.03, 0.26, BLACK); }
  }, { tags: 'desk chair swivel task' }],
  ['filing-cabinet', 'Filing cabinet', 'Office', 0.45, 1.0, 0.6, '#9aa3a8', () => cabinetBody(0.45, 1.0, 0.6, { kick: 0.03, drawers: 3 }), { tags: 'drawers metal storage' }],
  ['shelf-wall', 'Wall shelf', 'Decor', 0.9, 0.04, 0.25, '#a9835c', () => { box(0, 0, 0, 0.9, 0.04, 0.25, 'main', { m: 'wood' }); }, { mount: 'wall', elev: 1.4, tags: 'floating shelf' }],
  ['console-table', 'Console table', 'Living', 1.2, 0.8, 0.35, '#7b5d45', () => {
    box(0, 0.77, 0, 1.2, 0.03, 0.35, 'main', { m: 'wood' }); box(0, 0.2, 0, 1.1, 0.02, 0.3, 'main', { m: 'wood' }); legs(1.2, 0.35, 0.77, 0.02, 0.035, BLACK, true);
  }, { tags: 'hallway entry table' }],

  // Kitchen
  ['cabinet', 'Base cabinet', 'Kitchen', 0.6, 0.9, 0.6, '#c2c7bb', () => cabinetBody(0.6, 0.9, 0.6, { top: '#e8e4dc' }), { tags: 'kitchen counter cupboard' }],
  ['cabinet-double', 'Base cabinet 120', 'Kitchen', 1.2, 0.9, 0.6, '#c2c7bb', () => cabinetBody(1.2, 0.9, 0.6, { top: '#e8e4dc', doors: 2 }), { tags: 'kitchen counter cupboard' }],
  ['cabinet-drawers', 'Drawer cabinet', 'Kitchen', 0.6, 0.9, 0.6, '#c2c7bb', () => cabinetBody(0.6, 0.9, 0.6, { top: '#e8e4dc', drawers: 3 }), { tags: 'kitchen counter drawers' }],
  ['cabinet-wall', 'Wall cabinet', 'Kitchen', 0.6, 0.7, 0.35, '#c2c7bb', () => cabinetBody(0.6, 0.7, 0.35, { kick: 0 }), { mount: 'wall', elev: 1.45, tags: 'kitchen upper cupboard' }],
  ['cabinet-tall', 'Pantry cabinet', 'Kitchen', 0.6, 2.1, 0.6, '#c2c7bb', () => cabinetBody(0.6, 2.1, 0.6, { kick: 0.1, doors: 1 }), { tags: 'kitchen larder tall cupboard' }],
  ['kitchen-sink', 'Sink cabinet', 'Kitchen', 0.8, 0.9, 0.6, '#c2c7bb', () => {
    cabinetBody(0.8, 0.9, 0.6, { top: '#e8e4dc', doors: 2 }); box(0, 0.86, 0.04, 0.5, 0.045, 0.38, '#9ea6ab', { m: 'metal' }); faucet(0, 0.9, -0.22);
  }, { tags: 'kitchen sink tap' }],
  ['stove', 'Cooker', 'Kitchen', 0.6, 0.9, 0.6, '#d9dcdf', () => {
    box(0, 0, 0, 0.6, 0.86, 0.6, 'main', { m: 'metal' }); box(0, 0.86, 0, 0.6, 0.04, 0.6, BLACK, { m: 'gloss' });
    box(0, 0.12, 0.3, 0.5, 0.48, 0.012, '#1d2124', { m: 'glass' }); box(0, 0.7, 0.305, 0.5, 0.025, 0.03, STEEL, { m: 'metal' });
    for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) cyl(x, 0.9, z, 0.18, 0.006, '#3c3f42');
  }, { tags: 'oven range hob cooktop' }],
  ['fridge', 'Refrigerator', 'Kitchen', 0.75, 1.8, 0.7, '#e9ebec', () => {
    box(0, 0, 0, 0.75, 1.8, 0.7, 'main', { m: 'metal' }); box(0, 1.18, 0.351, 0.74, 0.01, 0.005, '#9aa0a4');
    handle(-0.3, 1.4, 0.37, true, 0.35); handle(-0.3, 0.75, 0.37, true, 0.45);
  }, { tags: 'refrigerator freezer' }],
  ['dishwasher', 'Dishwasher', 'Kitchen', 0.6, 0.85, 0.6, '#d9dcdf', () => {
    box(0, 0, 0, 0.6, 0.85, 0.6, 'main', { m: 'metal' }); box(0, 0.75, 0.301, 0.58, 0.08, 0.005, BLACK); handle(0, 0.7, 0.31, false, 0.35);
  }, { tags: 'appliance' }],
  ['microwave', 'Microwave', 'Kitchen', 0.5, 0.3, 0.38, '#2d3033', () => {
    box(0, 0, 0, 0.5, 0.3, 0.38, 'main', { m: 'metal' }); box(-0.06, 0.04, 0.19, 0.34, 0.22, 0.005, '#0e1316', { m: 'glass' });
  }, { elev: 0.9, tags: 'appliance' }],
  ['range-hood', 'Cooker hood', 'Kitchen', 0.6, 0.7, 0.5, '#c9cdd1', () => {
    box(0, 0, 0, 0.6, 0.08, 0.5, 'main', { m: 'metal' }); box(0, 0.08, -0.07, 0.3, 0.62, 0.25, 'main', { m: 'metal' });
  }, { mount: 'wall', elev: 1.55, tags: 'extractor vent' }],
  ['kitchen-island', 'Kitchen island', 'Kitchen', 1.8, 0.92, 0.9, '#5b6e6a', () => {
    box(0, 0.08, -0.08, 1.7, 0.8, 0.7, 'main', { m: 'wood' }); box(0, 0, -0.08, 1.64, 0.08, 0.64, BLACK);
    box(0, 0.88, 0, 1.8, 0.04, 0.9, '#efece6', { m: 'gloss' });
  }, { tags: 'counter breakfast bar' }],
  ['washing-machine', 'Washing machine', 'Bathroom', 0.6, 0.85, 0.6, '#f0f1f2', () => {
    box(0, 0, 0, 0.6, 0.85, 0.6, 'main', { m: 'gloss' }); cyl(0, 0.4, 0.3, 0.38, 0.02, '#a9b3b8', { rx: 90, m: 'metal' }); cyl(0, 0.4, 0.31, 0.3, 0.02, '#1f2a30', { rx: 90, m: 'glass' });
    box(0, 0.74, 0.301, 0.56, 0.08, 0.005, '#d6d8da');
  }, { tags: 'laundry washer dryer appliance' }],

  // Bathroom
  ['toilet', 'Toilet', 'Bathroom', 0.4, 0.78, 0.68, '#f7f7f5', () => {
    box(0, 0.4, -0.255, 0.4, 0.38, 0.17, 'main', { m: 'ceramic' });
    cyl(0, 0, 0.03, 0.26, 0.3, 'main', { dz: 0.36, t: 1.3, m: 'ceramic' }); cyl(0, 0.3, 0.05, 0.38, 0.1, 'main', { dz: 0.48, m: 'ceramic' });
    cyl(0, 0.4, 0.06, 0.37, 0.02, '#ffffff', { dz: 0.46, m: 'ceramic' });
  }, { mount: 'wall', tags: 'wc loo' }],
  ['sink', 'Wash basin', 'Bathroom', 0.55, 0.85, 0.45, '#f4f6f5', () => {
    cyl(0, 0, -0.05, 0.18, 0.7, 'main', { t: 0.8, m: 'ceramic' }); box(0, 0.7, 0, 0.55, 0.15, 0.45, 'main', { m: 'ceramic' });
    box(0, 0.79, 0.03, 0.42, 0.07, 0.3, '#dfe6e8', { m: 'ceramic' }); faucet(0, 0.85, -0.17);
  }, { mount: 'wall', tags: 'basin pedestal sink' }],
  ['bath-vanity', 'Vanity unit', 'Bathroom', 1.0, 0.85, 0.5, '#7d8f86', () => {
    cabinetBody(1.0, 0.85, 0.5, { kick: 0.1, doors: 2, top: '#f5f5f2' }); box(0, 0.82, 0.03, 0.5, 0.04, 0.32, '#dfe6e8', { m: 'ceramic' }); faucet(0, 0.85, -0.17);
  }, { mount: 'wall', tags: 'basin sink cabinet' }],
  ['bathtub', 'Bathtub', 'Bathroom', 1.7, 0.58, 0.75, '#f8f9f9', () => {
    box(0, 0, 0, 1.7, 0.58, 0.75, 'main', { m: 'ceramic' }); box(0, 0.25, 0, 1.56, 0.34, 0.6, '#dfe9ed', { m: 'ceramic' });
    box(-0.78, 0.58, 0, 0.06, 0.08, 0.05, STEEL, { m: 'metal' }); box(-0.73, 0.62, 0, 0.1, 0.03, 0.03, STEEL, { m: 'metal' });
  }, { tags: 'bath tub' }],
  ['shower', 'Shower', 'Bathroom', 0.9, 2.0, 0.9, '#f2f4f4', () => {
    box(0, 0, 0, 0.9, 0.06, 0.9, 'main', { m: 'ceramic' });
    box(0.445, 0.06, 0, 0.01, 1.94, 0.9, '#cfe3ea', { m: 'glass' }); box(0, 0.06, 0.445, 0.9, 1.94, 0.01, '#cfe3ea', { m: 'glass' });
    cyl(-0.35, 0.06, -0.4, 0.025, 1.9, STEEL, { m: 'metal' }); cyl(-0.25, 1.9, -0.36, 0.2, 0.02, STEEL, { m: 'metal' });
  }, { tags: 'shower cubicle enclosure' }],
  ['towel-rail', 'Towel radiator', 'Bathroom', 0.5, 0.9, 0.06, '#e9eaea', () => {
    for (const s of [-1, 1]) cyl(s * 0.23, 0, 0, 0.035, 0.9, 'main', { m: 'metal' });
    for (let y = 0.08; y < 0.9; y += 0.1) cyl(0, y - 0.23, 0, 0.022, 0.46, 'main', { rz: 90, m: 'metal' });
  }, { mount: 'wall', elev: 0.4, tags: 'heater rail' }],
  ['mirror', 'Wall mirror', 'Decor', 0.6, 0.9, 0.03, '#b9965a', () => {
    box(0, 0, 0, 0.6, 0.9, 0.03, 'main', { m: 'metal' }); box(0, 0.04, 0.012, 0.52, 0.82, 0.01, '#dbe8ee', { m: 'glass' });
  }, { mount: 'wall', elev: 1.0, tags: 'mirror glass' }],

  // Decor & lighting
  ['plant', 'Indoor plant', 'Decor', 0.5, 1.2, 0.5, '#66816a', () => {
    cyl(0, 0, 0, 0.3, 0.36, '#c9a17c', { t: 1.25, m: 'ceramic' }); cyl(0, 0.34, 0, 0.34, 0.02, '#4a3b2d');
    sph(0, 0.75, 0, 0.42, 0.55, 0.42, 'main'); sph(0.1, 0.98, 0.05, 0.3, 0.38, 0.3, 'main'); sph(-0.08, 0.55, -0.05, 0.36, 0.3, 0.36, 'main');
  }, { tags: 'plant tree green pot' }],
  ['plant-small', 'Potted plant', 'Decor', 0.3, 0.55, 0.3, '#5b7d5b', () => {
    cyl(0, 0, 0, 0.2, 0.22, '#e9e4dc', { t: 1.2, m: 'ceramic' }); sph(0, 0.36, 0, 0.3, 0.34, 0.3, 'main');
  }, { tags: 'plant pot succulent' }],
  ['wall-art', 'Framed art', 'Decor', 0.9, 0.6, 0.03, '#d58a6a', () => {
    box(0, 0, 0, 0.9, 0.6, 0.03, '#2f2f2f'); box(0, 0.04, 0.012, 0.82, 0.52, 0.01, 'main'); box(-0.1, 0.12, 0.018, 0.35, 0.3, 0.005, '#3e6b7a');
  }, { mount: 'wall', elev: 1.3, tags: 'painting picture frame poster' }],
  ['clock', 'Wall clock', 'Decor', 0.35, 0.35, 0.05, '#f4f1ea', () => {
    cyl(0, 0.175 - 0.025, 0.0, 0.35, 0.05, BLACK, { rx: 90 }); cyl(0, 0.175 - 0.025, 0.006, 0.31, 0.05, 'main', { rx: 90 });
  }, { mount: 'wall', elev: 1.8, tags: 'time' }],
  ['curtains', 'Curtains', 'Decor', 1.6, 2.4, 0.12, '#cdbfa8', () => {
    cyl(0, 2.37 - 0.85, 0, 0.03, 1.7, METAL, { rz: 90, m: 'metal' });
    for (let i = 0; i < 8; i++) { const side = i < 4 ? -1 : 1, k = i % 4; box(side * (0.8 - 0.06 - k * 0.09), 0, (k % 2 ? 0.02 : -0.02), 0.1, 2.33, 0.04, 'main', { m: 'fabric' }); }
  }, { mount: 'wall', tags: 'drapes window blinds' }],
  ['floor-lamp', 'Floor lamp', 'Lighting', 0.4, 1.65, 0.4, '#f3e9d2', () => {
    cyl(0, 0, 0, 0.3, 0.03, BLACK, { m: 'metal' }); cyl(0, 0.03, 0, 0.03, 1.32, BLACK, { m: 'metal' }); cyl(0, 1.35, 0, 0.4, 0.3, 'main', { t: 0.7, m: 'light' });
  }, { tags: 'lamp light standing' }],
  ['table-lamp', 'Table lamp', 'Lighting', 0.3, 0.5, 0.3, '#f6eedc', () => {
    cyl(0, 0, 0, 0.15, 0.26, '#7c9a92', { t: 0.6, m: 'ceramic' }); cyl(0, 0.26, 0, 0.3, 0.22, 'main', { t: 0.7, m: 'light' });
  }, { elev: 0.55, tags: 'lamp light desk bedside' }],
  ['pendant-light', 'Pendant light', 'Lighting', 0.45, 0.65, 0.45, '#2d3133', () => {
    cyl(0, 0, 0, 0.45, 0.25, 'main', { t: 0.35, m: 'metal' }); sph(0, 0.04, 0, 0.12, 0.12, 0.12, '#fff3d6', { m: 'light' }); cyl(0, 0.25, 0, 0.012, 0.4, BLACK);
  }, { mount: 'ceiling', tags: 'lamp hanging ceiling light chandelier' }],
  ['ceiling-fan', 'Ceiling fan', 'Lighting', 1.2, 0.35, 1.2, '#f2f2ef', () => {
    cyl(0, 0.0, 0, 0.22, 0.12, 'main', { m: 'metal' }); cyl(0, 0.12, 0, 0.03, 0.23, 'main', { m: 'metal' });
    for (let i = 0; i < 4; i++) { const a = i * 90 + 45, rad = a * Math.PI / 180; box(Math.cos(rad) * 0.35, 0.05, -Math.sin(rad) * 0.35, 0.5, 0.012, 0.12, '#b38e64', { ry: a, m: 'wood' }); }
  }, { mount: 'ceiling', tags: 'fan ceiling cooling' }],

  // Kids & leisure
  ['toy-box', 'Toy chest', 'Kids', 0.8, 0.45, 0.45, '#e3b25c', () => { box(0, 0, 0, 0.8, 0.42, 0.45, 'main', { m: 'wood' }); box(0, 0.42, 0, 0.82, 0.03, 0.47, '#f2efe8', { m: 'wood' }); }, { tags: 'storage toys trunk' }],
  ['piano', 'Upright piano', 'Leisure', 1.5, 1.25, 0.6, '#1c1c1e', () => {
    box(0, 0, -0.1, 1.5, 1.25, 0.4, 'main', { m: 'gloss' }); box(0, 0.7, 0.15, 1.5, 0.08, 0.3, 'main', { m: 'gloss' });
    box(0, 0.78, 0.18, 1.3, 0.015, 0.16, '#fafaf8'); for (const s of [-1, 1]) box(s * 0.72, 0, 0.15, 0.06, 0.7, 0.3, 'main', { m: 'gloss' });
  }, { mount: 'wall', tags: 'music instrument keyboard' }],
  ['treadmill', 'Treadmill', 'Leisure', 0.8, 1.35, 1.8, '#30343a', () => {
    box(0, 0, 0.1, 0.8, 0.2, 1.6, 'main', { m: 'metal' }); box(0, 0.2, 0.1, 0.5, 0.01, 1.45, BLACK);
    for (const s of [-1, 1]) box(s * 0.36, 0.2, -0.72, 0.05, 1.1, 0.05, 'main', { m: 'metal', rx: 10 });
    box(0, 1.25, -0.82, 0.78, 0.1, 0.25, 'main', { m: 'metal' });
  }, { tags: 'gym fitness exercise' }],

  // Structure
  ['stairs', 'Straight staircase', 'Structure', 1.0, 2.7, 3.6, '#d7c6ae', () => straightStairs(1.0, 2.7, 3.6, 15), { tags: 'stairs staircase steps flight', path: [[0, 0.05, 2.3], [0, 0.18, 1.68], [0, 2.7, -1.8], [0, 2.75, -2.4]] }],
  ['stairs-short', 'Short stairs', 'Structure', 1.0, 0.9, 1.2, '#d7c6ae', () => straightStairs(1.0, 0.9, 1.2, 5), { tags: 'stairs steps platform split level', path: [[0, 0.05, 1.1], [0, 0.18, 0.48], [0, 0.9, -0.6], [0, 0.95, -1.1]] }],
  ['stairs-l', 'L-shaped staircase', 'Structure', 2.0, 2.7, 2.4, '#d7c6ae', () => {
    const steps = 15, rise = 2.7 / steps;
    for (let i = 0; i < 7; i++) box(0.5, 0, 1.2 - (i + 0.5) * 0.2, 1.0, (i + 1) * rise, 0.2, 'main', { m: 'wood' });
    box(0.5, 0, -0.7, 1.0, 8 * rise, 1.0, 'main', { m: 'wood' });
    for (let j = 0; j < 7; j++) box(-(j + 0.5) * (1 / 7), 0, -0.7, 1 / 7, (9 + j) * rise, 1.0, 'main', { m: 'wood' });
    const len1 = Math.hypot(7 * rise, 1.4), a1 = Math.atan2(7 * rise, 1.4) * 180 / Math.PI;
    box(0.02, 0.9 + 4 * rise - 0.025, 0.5, 0.05, 0.05, len1, BLACK, { rx: a1, m: 'metal' });
    const len2 = Math.hypot(7 * rise, 1.0), a2 = Math.atan2(7 * rise, 1.0) * 180 / Math.PI;
    box(-0.5, 0.9 + 12 * rise - 0.025, -0.22, len2, 0.05, 0.05, BLACK, { rz: -a2, m: 'metal' });
  }, { tags: 'stairs staircase landing quarter turn', path: [[0.5, 0.05, 1.7], [0.5, 0.18, 1.1], [0.5, 1.44, -0.2], [0.5, 1.44, -0.7], [0, 1.62, -0.7], [-1, 2.7, -0.7], [-1.5, 2.75, -0.7]] }],
  ['stairs-spiral', 'Spiral staircase', 'Structure', 1.6, 2.7, 1.6, '#c7ccd1', () => {
    const steps = 14, rise = 2.7 / steps;
    cyl(0, 0, 0, 0.12, 2.7, BLACK, { m: 'metal' });
    for (let i = 0; i < steps; i++) {
      const a = i * 25, rad = a * Math.PI / 180, y = (i + 1) * rise - 0.04;
      box(Math.cos(rad) * 0.42, y, -Math.sin(rad) * 0.42, 0.72, 0.04, 0.3, 'main', { ry: a, m: 'metal' });
      box(Math.cos(rad) * 0.77, y + 0.04, -Math.sin(rad) * 0.77, 0.025, 0.9, 0.025, BLACK, { m: 'metal' });
    }
  }, { tags: 'stairs staircase helical circular', path: [[0.45, 0.05, 0.9], [0.45, 0.05, 0.25], ...Array.from({ length: 14 }, (_, i) => { const a = i * 25 * Math.PI / 180; return [Math.cos(a) * 0.45, (i + 1) * 2.7 / 14, -Math.sin(a) * 0.45]; }), [Math.cos(13 * 25 * Math.PI / 180) * 0.45 - 0.5 * Math.sin(13 * 25 * Math.PI / 180), 2.75, -Math.sin(13 * 25 * Math.PI / 180) * 0.45 - 0.5 * Math.cos(13 * 25 * Math.PI / 180)]] }],
  ['railing', 'Railing', 'Structure', 1.2, 1.0, 0.05, '#2b2d30', () => {
    box(0, 0.95, 0, 1.2, 0.05, 0.05, 'main', { m: 'metal' }); box(0, 0.1, 0, 1.2, 0.03, 0.03, 'main', { m: 'metal' });
    for (let x = -0.58; x <= 0.59; x += 0.116) box(x, 0, 0, 0.02, 0.95, 0.02, 'main', { m: 'metal' });
  }, { tags: 'balustrade banister handrail fence' }],
  ['column', 'Column', 'Structure', 0.4, 2.7, 0.4, '#efede8', () => box(0, 0, 0, 0.4, 2.7, 0.4, 'main'), { tags: 'pillar post structural' }],
  ['column-round', 'Round column', 'Structure', 0.35, 2.7, 0.35, '#efede8', () => cyl(0, 0, 0, 0.35, 2.7, 'main'), { tags: 'pillar post structural' }],
  ['partition', 'Room divider', 'Structure', 1.6, 1.8, 0.04, '#d8cbb5', () => {
    for (let i = 0; i < 4; i++) box(-0.6 + i * 0.4, 0.04, 0, 0.38, 1.76, 0.03, 'main', { m: 'fabric', ry: i % 2 ? 8 : -8 });
  }, { tags: 'screen divider panel' }],
  ['radiator', 'Radiator', 'Structure', 1.0, 0.6, 0.1, '#f3f3f1', () => {
    for (let x = -0.47; x <= 0.48; x += 0.0625) box(x, 0, 0, 0.045, 0.6, 0.1, 'main', { m: 'metal' });
  }, { mount: 'wall', elev: 0.15, tags: 'heater heating' }],
  ['ac-unit', 'Air conditioner', 'Structure', 0.9, 0.3, 0.25, '#f5f6f6', () => {
    box(0, 0, 0, 0.9, 0.3, 0.25, 'main', { m: 'gloss' }); box(0, 0.03, 0.126, 0.8, 0.04, 0.005, '#bfc5c9');
  }, { mount: 'wall', elev: 2.1, tags: 'ac aircon split cooling hvac' }],
  ['object-box', 'Scanned object', 'Structure', 1.0, 1.0, 1.0, '#b7c4bd', () => {
    box(0, 0, 0, 1.0, 1.0, 1.0, 'main', { m: 'fabric' });
  }, { tags: 'scan detected unknown box placeholder' }],
  ['built-in-closet', 'Built-in closet', 'Structure', 2.0, 2.4, 0.65, '#efede8', () => cabinetBody(2.0, 2.4, 0.65, { kick: 0.05, doors: 4 }), { tags: 'closet wardrobe built in storage wall' }],
];

export const categories = ['Living', 'Dining', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Kids', 'Electronics', 'Lighting', 'Decor', 'Leisure', 'Structure'];

export function buildCatalog() {
  const items = defs.map(([type, name, category, w, h, d, color, build, opts = {}]) => {
    parts.length = 0;
    build();
    if (!categories.includes(category)) throw new Error(`Unknown category ${category}`);
    return {
      type, name, category, w, h, d, color,
      mount: opts.mount ?? 'floor', elev: opts.elev ?? 0, tags: opts.tags ?? '',
      // Walking path (item space) for staircases: drawn in 3D between connected floors.
      path: (opts.path ?? []).flat().map(r3),
      parts: parts.map(p => {
        const out = { s: p.s, x: r3(p.x), y: r3(p.y), z: r3(p.z), w: r3(p.w), h: r3(p.h), d: r3(p.d), c: p.c, m: p.m ?? '' };
        if (p.s === 'cyl') out.t = r3(p.t ?? 1);
        for (const k of ['rx', 'ry', 'rz']) if (p[k]) out[k] = r3(p[k]);
        return out;
      }),
    };
  });
  const types = new Set();
  for (const item of items) {
    if (!/^[a-z0-9-]{2,40}$/.test(item.type) || types.has(item.type)) throw new Error(`Bad or duplicate type ${item.type}`);
    types.add(item.type);
  }
  return { version: 1, categories, items };
}
