// SVG floor-plan renderer. Pure string building so it is testable without a browser.
import {itemDef,itemSize,perimeterEdge,wallLength} from './model.js';
import {planSymbol,shade} from './symbols.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const LAYER = {rug:0, floor:1, wall:2, ceiling:3};
const layerOf = f => f.type.startsWith('rug') ? LAYER.rug : LAYER[itemDef(f.type).mount] ?? 1;

function furnitureSvg(f, selected, zoom) {
  const {w, d} = itemSize(f), def = itemDef(f.type), active = f.id === selected, ceiling = def.mount === 'ceiling';
  const sx = w / def.w, sz = d / def.d;
  const shapes = planSymbol(f.type).map(s => {
    const fill = s.color === 'main' ? f.color : s.color;
    return `<polygon points="${s.points.map(([x, z]) => `${(x * sx).toFixed(3)},${(z * sz).toFixed(3)}`).join(' ')}" fill="${fill}" fill-opacity="${s.glass ? .35 : 1}" stroke="${shade(fill, .72)}" stroke-width="${(.008 / zoom).toFixed(4)}" stroke-linejoin="round"/>`;
  }).join('');
  const outline = `<rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="transparent" stroke="${active ? '#2c8e79' : 'none'}" stroke-width="${.04 / zoom}" stroke-dasharray="${active ? `${.08 / zoom} ${.05 / zoom}` : ''}"/>`;
  const handle = active ? `<g data-rotate="${esc(f.id)}" style="cursor:alias"><line x1="0" y1="${-d / 2}" x2="0" y2="${-d / 2 - .32 / zoom}" stroke="#2c8e79" stroke-width="${.02 / zoom}"/><circle cx="0" cy="${-d / 2 - .32 / zoom}" r="${.075 / zoom}" fill="#fff" stroke="#2c8e79" stroke-width="${.025 / zoom}"/></g>` : '';
  return `<g data-item="${esc(f.id)}" transform="translate(${f.position.x} ${f.position.z}) rotate(${-f.rotation.y * 180 / Math.PI})" style="cursor:grab" opacity="${ceiling ? .45 : 1}"><g>${shapes}</g>${outline}${handle}</g>`;
}

function dimensionLabels(room, zoom) {
  const v = room.floor.vertices, size = .15 / Math.max(.6, Math.min(zoom, 1.6));
  return v.map((a, i) => {
    const b = v[(i + 1) % v.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < .25) return '';
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    // Outward normal for a polygon of unknown winding: test which side is outside.
    let nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    const cx = v.reduce((s, p) => s + p.x, 0) / v.length, cz = v.reduce((s, p) => s + p.z, 0) / v.length;
    if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
    let angle = Math.atan2(b.z - a.z, b.x - a.x) * 180 / Math.PI;
    if (angle > 90) angle -= 180; if (angle < -90) angle += 180;
    const x = mx + nx * .38, z = mz + nz * .38;
    return `<text x="${x}" y="${z}" transform="rotate(${angle} ${x} ${z})" dy="${size * .35}" font-size="${size}">${len.toFixed(2)} m</text>`;
  }).join('');
}

/** Faint outline of the floor below, with its staircases, to line up walls between storeys. */
function ghostSvg(ghost, zoom) {
  const dash = `${.12 / zoom} ${.08 / zoom}`;
  const outline = `<polygon points="${ghost.floor.vertices.map(p => `${p.x},${p.z}`).join(' ')}" fill="none" stroke="#8a9a8c" stroke-width="${.03 / zoom}" stroke-dasharray="${dash}" opacity=".7"/>`;
  const walls = ghost.walls.map(w => `<line x1="${w.startPoint.x}" y1="${w.startPoint.z}" x2="${w.endPoint.x}" y2="${w.endPoint.z}" stroke="#9aa79b" stroke-width="${w.thickness}" opacity=".25"/>`).join('');
  const stairs = ghost.furniture.filter(f => itemDef(f.type).path?.length).map(f => {
    const {w, d} = itemSize(f);
    return `<g transform="translate(${f.position.x} ${f.position.z}) rotate(${-f.rotation.y * 180 / Math.PI})"><rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="#e0913a22" stroke="#e0913a" stroke-width="${.025 / zoom}" stroke-dasharray="${dash}"/><text y="${.05}" font-size="${.16 / Math.max(.6, Math.min(zoom, 1.6))}" text-anchor="middle" fill="#b5702a" font-family="sans-serif">stairs from below</text></g>`;
  }).join('');
  return `<g pointer-events="none">${outline}${walls}${stairs}</g>`;
}

export function renderPlan(room, {bounds, zoom, selected, wallStart, draft, showCorners = true, ghost = null}) {
  const line = .018 / zoom, b = bounds;
  const poly = room.floor.vertices.map(p => `${p.x},${p.z}`).join(' ');
  const walls = room.walls.map((w, i) => {
    const sel = selected === `wall:${i}`, perimeter = perimeterEdge(room, w) >= 0;
    return `<line x1="${w.startPoint.x}" y1="${w.startPoint.z}" x2="${w.endPoint.x}" y2="${w.endPoint.z}" stroke="${sel ? '#3e9781' : perimeter ? '#59645a' : '#7d8879'}" stroke-width="${w.thickness}" stroke-linecap="square"/>`
      + `<line data-wall="${i}" x1="${w.startPoint.x}" y1="${w.startPoint.z}" x2="${w.endPoint.x}" y2="${w.endPoint.z}" stroke="transparent" stroke-width="${Math.max(.25 / zoom, w.thickness)}" style="cursor:pointer"/>`;
  }).join('');
  const openings = room.openings.map((o, i) => {
    const w = room.walls[o.wall], dx = w.endPoint.x - w.startPoint.x, dz = w.endPoint.z - w.startPoint.z, angle = Math.atan2(dz, dx) * 180 / Math.PI;
    const x = w.startPoint.x + dx * o.offset, z = w.startPoint.z + dz * o.offset, sel = selected === `opening:${i}`;
    const symbol = o.type === 'door'
      ? `<path d="M${-o.width / 2} 0v${o.width} A${o.width} ${o.width} 0 0 0 ${o.width / 2} 0" fill="${sel ? '#2c8e7922' : 'none'}" stroke-dasharray="${.04 / zoom} ${.03 / zoom}"/><line x1="${-o.width / 2}" y1="0" x2="${-o.width / 2}" y2="${o.width}"/>`
      : `<path d="M${-o.width / 2} -.035h${o.width}m0 .07h${-o.width}" fill="none"/>`;
    return `<g data-opening="${i}" transform="translate(${x} ${z}) rotate(${angle})" stroke="${sel ? '#248e7a' : '#7f8a74'}" stroke-width="${line}" style="cursor:pointer"><rect x="${-o.width / 2}" y="${-w.thickness / 2 - .015}" width="${o.width}" height="${w.thickness + .03}" fill="#fbfbf7"/>${symbol}</g>`;
  }).join('');
  const furniture = [...room.furniture].sort((p, q) => layerOf(p) - layerOf(q)).map(f => furnitureSvg(f, selected, zoom)).join('');
  const cornerActive = selected?.startsWith('corner:') || selected?.startsWith('wall:') || selected === null;
  const corners = showCorners ? room.floor.vertices.map((p, i) => {
    const sel = selected === `corner:${i}`, r = (sel ? .11 : cornerActive ? .085 : .06) / Math.max(.7, zoom);
    return `<circle data-corner="${i}" cx="${p.x}" cy="${p.z}" r="${r}" fill="${sel ? '#2c8e79' : '#ffffff'}" stroke="#2c8e79" stroke-width="${.025 / Math.max(.7, zoom)}" style="cursor:move"/>`;
  }).join('') : '';
  const draftPath = draft?.length ? `<polyline points="${draft.map(p => `${p.x},${p.z}`).join(' ')}" fill="none" stroke="#285c4e" stroke-width="${.04 / zoom}" stroke-dasharray="${.1 / zoom} ${.06 / zoom}"/>${draft.map(p => `<circle cx="${p.x}" cy="${p.z}" r="${.07 / zoom}" fill="#285c4e"/>`).join('')}` : '';
  const v = room.floor.vertices, minX = Math.min(...v.map(p => p.x)), maxX = Math.max(...v.map(p => p.x)), minZ = Math.min(...v.map(p => p.z)), maxZ = Math.max(...v.map(p => p.z));
  const font = .14 / Math.max(.6, Math.min(zoom, 1.6));
  return `<defs><pattern id="grid" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M.5 0H0V.5" fill="none" stroke="#e2e6dc" stroke-width="${.01 / zoom}"/></pattern><pattern id="wood" width=".4" height="1.6" patternUnits="userSpaceOnUse"><rect width=".4" height="1.6" fill="#efe7d6"/><path d="M0 0v1.6M0 .8h.4M.2 0v.4" stroke="#e1d6bf" stroke-width=".008"/></pattern></defs>`
    + `<rect x="${b.x}" y="${b.z}" width="${b.width}" height="${b.height}" fill="url(#grid)"/>`
    + `<polygon data-floor="1" points="${poly}" fill="url(#wood)"/>${ghost ? ghostSvg(ghost, zoom) : ''}${furniture}${walls}${openings}`
    + `<g fill="#6d7868" font-family="DM Sans, sans-serif" font-weight="600" text-anchor="middle">${dimensionLabels(room, zoom)}</g>`
    + `<g fill="#9aa392" font-size="${font}" font-family="sans-serif" text-anchor="middle"><text x="${(minX + maxX) / 2}" y="${minZ - .75}">${(maxX - minX).toFixed(2)} × ${(maxZ - minZ).toFixed(2)} m · ceiling ${room.dimensions.y.toFixed(2)} m</text></g>`
    + corners + draftPath
    + (wallStart ? `<circle cx="${wallStart.x}" cy="${wallStart.z}" r="${.08 / zoom}" fill="#285c4e"/>` : '');
}
export {wallLength};
