// Plan symbols (top view) and catalog thumbnails (isometric view) generated from catalog parts,
// so the 2D plan, the thumbnails, the 3D view and the Unity app all show the same model.
import {itemDef} from './model.js';

const DEG = Math.PI / 180;
function rotation(p) {
  // Three.js XYZ Euler order: M = Rx * Ry * Rz.
  const [a, b, c] = [(p.rx ?? 0) * DEG, (p.ry ?? 0) * DEG, (p.rz ?? 0) * DEG];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}
const apply = (m, v) => [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];

/** Faces of a part in item space: arrays of [x,y,z] points. */
function faces(p, segments = 16) {
  const m = rotation(p), place = v => { const r = apply(m, v); return [r[0] + p.x, r[1] + p.y, r[2] + p.z]; };
  const hw = p.w / 2, hh = p.h / 2, hd = p.d / 2;
  if (p.s === 'box') {
    const c = [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd], [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]].map(place);
    return [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]].map(f => f.map(i => c[i]));
  }
  if (p.s === 'cyl') {
    const t = p.t > 0 ? p.t : 1, ring = (y, k) => Array.from({length:segments}, (_, i) => { const a = i / segments * Math.PI * 2; return place([Math.cos(a) * hw * k, y, Math.sin(a) * hd * k]); });
    const bottom = ring(-hh, 1), top = ring(hh, t), out = [top, [...bottom].reverse()];
    for (let i = 0; i < segments; i++) { const j = (i + 1) % segments; out.push([bottom[i], bottom[j], top[j], top[i]]); }
    return out;
  }
  const lat = 8, lon = 12, pt = (i, j) => { const th = i / lat * Math.PI, ph = j / lon * Math.PI * 2; return place([Math.sin(th) * Math.cos(ph) * hw, Math.cos(th) * hh, Math.sin(th) * Math.sin(ph) * hd]); };
  const out = [];
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) out.push([pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j)]);
  return out;
}

function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const symbolCache = new Map();
/** Top-view outline of each part in item space (x right, z down in SVG), lowest part first. */
export function planSymbol(type) {
  if (symbolCache.has(type)) return symbolCache.get(type);
  const def = itemDef(type);
  const shapes = def.parts.map(p => {
    const pts = faces(p, 20).flat();
    return {top:Math.max(...pts.map(v => v[1])), color:p.c, glass:p.m === 'glass', points:hull(pts.map(v => [v[0], v[2]]))};
  }).filter(s => s.points.length >= 3).sort((a, b) => a.top - b.top);
  const symbol = shapes.length ? shapes : [{top:def.h, color:'main', points:[[-def.w / 2, -def.d / 2], [def.w / 2, -def.d / 2], [def.w / 2, def.d / 2], [-def.w / 2, def.d / 2]]}];
  symbolCache.set(type, symbol);
  return symbol;
}

export function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16), ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * factor)));
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

const thumbCache = new Map();
/** Isometric SVG thumbnail rendered with a painter's algorithm. */
export function thumbnail(type, color) {
  const key = `${type}|${color ?? ''}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const def = itemDef(type), main = color ?? def.color;
  const yawA = -35 * DEG, tilt = 28 * DEG;
  const view = ([x, y, z]) => {
    const x1 = x * Math.cos(yawA) + z * Math.sin(yawA), z1 = -x * Math.sin(yawA) + z * Math.cos(yawA);
    return [x1, y * Math.cos(tilt) - z1 * Math.sin(tilt), y * Math.sin(tilt) + z1 * Math.cos(tilt)];
  };
  const light = [-.35, .8, .5], len = Math.hypot(...light), L = light.map(v => v / len);
  const polys = [];
  for (const p of def.parts) {
    const base = p.c === 'main' ? main : p.c;
    for (const f of faces(p, 14)) {
      const v = f.map(view);
      const e1 = v[1].map((c, i) => c - v[0][i]), e2 = v[2].map((c, i) => c - v[0][i]);
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const nl = Math.hypot(...n) || 1; n = n.map(c => c / nl);
      const lit = p.m === 'light' ? 1.08 : .62 + .45 * Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      polys.push({depth:v.reduce((s, q) => s + q[2], 0) / v.length, pts:v, fill:shade(base, lit), opacity:p.m === 'glass' ? .45 : 1});
    }
  }
  polys.sort((a, b) => a.depth - b.depth);
  const all = polys.flatMap(p => p.pts), xs = all.map(q => q[0]), ys = all.map(q => -q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), pad = Math.max(maxX - minX, maxY - minY) * .08;
  const body = polys.map(p => `<polygon points="${p.pts.map(q => `${q[0].toFixed(3)},${(-q[1]).toFixed(3)}`).join(' ')}" fill="${p.fill}"${p.opacity < 1 ? ` fill-opacity="${p.opacity}"` : ''} stroke="${p.fill}" stroke-width="${(pad / 12).toFixed(4)}" stroke-linejoin="round"/>`).join('');
  const svg = `<svg viewBox="${(minX - pad).toFixed(3)} ${(minY - pad).toFixed(3)} ${(maxX - minX + 2 * pad).toFixed(3)} ${(maxY - minY + 2 * pad).toFixed(3)}" aria-hidden="true">${body}</svg>`;
  thumbCache.set(key, svg);
  return svg;
}
