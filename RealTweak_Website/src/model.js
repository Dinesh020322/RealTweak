// Room domain model shared by the 2D plan, the 3D view and cloud sync.
// Canonical coordinates are web/Three.js: right-handed, meters, +Y up. See UNITY_CONTRACT.md.
import catalogData from './catalog.json' with {type:'json'};

export const clone = value => structuredClone(value);
export const catalog = catalogData.items;
export const categories = catalogData.categories;
const byType = new Map(catalog.map(item => [item.type, item]));
const FALLBACK = {type:'unknown', name:'Unknown object', category:'Other', w:1, h:1, d:1, color:'#a4afa9', mount:'floor', elev:0, parts:[]};
export const itemDef = type => byType.get(type) ?? {...FALLBACK, type, name:String(type)};

// ---------------------------------------------------------------- room codes
// New codes: 8 characters without look-alikes (no 0/O, 1/I/L), shown as ABCD-EFGH.
// 31^8 ≈ 8.5e11 combinations; codes are bearer capabilities, so rules forbid listing rooms.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SHORT_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export function newCode() {
  const out = [];
  while (out.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 248 && out.length < 8) out.push(CODE_ALPHABET[byte % 31]); // 248 = 8*31, avoids modulo bias
    }
  }
  return out.join('');
}
/** Normalizes user input. Short codes are case-insensitive; legacy codes keep their case. */
export function code(value) {
  const raw = String(value ?? '').trim();
  const compact = raw.replace(/[\s-]/g, '');
  if (compact.length === 8 && SHORT_CODE.test(compact.toUpperCase())) return compact.toUpperCase();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(raw)) throw new Error('Enter the room code shown on your phone (for example ABCD-EFGH).');
  return raw;
}
export const isShortCode = value => SHORT_CODE.test(value);
export const formatCode = value => isShortCode(value) ? `${value.slice(0, 4)}-${value.slice(4)}` : value;

// ---------------------------------------------------------------- validation
const number = (v, name, min = -1000, max = 1000) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid ${name}.`);
  return v;
};
function vector(v, name, min = -1000, max = 1000) {
  if (!v || typeof v !== 'object') throw new Error(`Missing ${name}.`);
  return {x:number(v.x, name, min, max), y:number(v.y ?? 0, name, min, max), z:number(v.z, name, min, max)};
}
export const yaw = rotation => rotation.y;
const HEX = /^#[0-9a-f]{6}$/i;

function legacyQuaternion(f, rotation) {
  // Legacy Unity quaternions are left-handed. Reflect X/Y to web coordinates.
  const q = {x:-rotation.x, y:-rotation.y, z:rotation.z, w:number(f.rotation.w, 'quaternion', -1, 1)};
  if (Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > .05) throw new Error('Invalid rotation quaternion.');
  if (Math.abs(q.x) < 1e-6 && Math.abs(q.z) < 1e-6) return {x:0, y:2 * Math.atan2(q.y, q.w), z:0};
  const m13 = 2 * (q.x * q.z + q.w * q.y);
  return {
    x:Math.atan2(2 * (q.w * q.x - q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y)),
    y:Math.asin(Math.max(-1, Math.min(1, m13))),
    z:Math.atan2(2 * (q.w * q.z - q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z)),
  };
}

export const MAX_LEVELS = 12;
/** Validates the geometry and furniture of one floor (the document itself, or an entry of `levels`). */
function validateLevelGeometry(raw, room, ids) {
  room.dimensions = vector(raw.dimensions, 'room dimensions', 0, 100);
  if (room.dimensions.x < .5 || room.dimensions.z < .5 || room.dimensions.y < .5) throw new Error('Room dimensions must be at least 0.5 m.');
  if (!raw.floor || !Array.isArray(raw.floor.vertices) || raw.floor.vertices.length < 3 || raw.floor.vertices.length > 500) throw new Error('A floor needs 3–500 vertices.');
  room.floor = {...raw.floor, vertices:raw.floor.vertices.map(v => vector(v, 'floor vertex'))};
  room.floor.center = vector(raw.floor.center ?? {x:0, y:0, z:0}, 'floor center');
  if (area(room.floor.vertices) < .1) throw new Error('The floor has no usable area.');
  if (!Array.isArray(raw.walls) || raw.walls.length > 500) throw new Error('Invalid walls.');
  room.walls = raw.walls.map(w => ({...w, startPoint:vector(w.startPoint, 'wall start'), endPoint:vector(w.endPoint, 'wall end'), height:number(w.height, 'wall height', .1, 20), thickness:number(w.thickness ?? .15, 'wall thickness', .01, 2)}));
  if (!Array.isArray(raw.furniture) || raw.furniture.length > 300) throw new Error('A floor can contain up to 300 objects.');
  room.furniture = raw.furniture.map(f => {
    if (typeof f.id !== 'string' || !/^[\w-]{1,100}$/.test(f.id) || ids.has(f.id)) throw new Error('Furniture IDs must be unique.');
    ids.add(f.id);
    if (typeof f.type !== 'string' || !/^[\w-]{1,40}$/.test(f.type)) throw new Error('Invalid furniture type.');
    let rotation = vector(f.rotation, 'rotation', -100, 100);
    if (f.rotation && 'w' in f.rotation) rotation = legacyQuaternion(f, rotation);
    const item = {...f, position:vector(f.position, 'position'), rotation, scale:vector(f.scale ?? {x:1, y:1, z:1}, 'scale', .05, 20), color:HEX.test(f.color) ? f.color : itemDef(f.type).color};
    if (item.label !== undefined) item.label = String(item.label).slice(0, 60);
    return item;
  });
  room.openings = raw.openings ?? [];
  if (!Array.isArray(room.openings) || room.openings.length > 100) throw new Error('Invalid door/window list.');
  room.openings = room.openings.map(o => {
    if (!['door', 'window'].includes(o.type) || !Number.isInteger(o.wall) || !room.walls[o.wall]) throw new Error('An opening must belong to a wall.');
    const result = {type:o.type, wall:o.wall, offset:number(o.offset, 'opening position', 0, 1), width:number(o.width, 'opening width', .3, 6)};
    if (o.height !== undefined) result.height = number(o.height, 'opening height', .2, 10);
    if (o.sill !== undefined) result.sill = number(o.sill, 'opening sill', 0, 10);
    if (o.source) result.source = String(o.source).slice(0, 10);
    const length = wallLength(room.walls[o.wall]);
    if (result.width > length + .001 || result.offset * length - result.width / 2 < -.01 || result.offset * length + result.width / 2 > length + .01) throw new Error('The opening must fit within its wall.');
    return result;
  });
}

/**
 * A room document is a house project. Its top-level geometry is the ground floor (so older apps
 * keep working) and `levels` holds further floors: stacked above (connected by stairs) or separate plans.
 */
export function validateRoom(raw, id = raw?.roomId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This file is not a room.');
  if (raw.schemaVersion && raw.schemaVersion > 2) throw new Error('This room uses a newer format. Update the website.');
  const room = clone(raw);
  room.roomId = code(id);
  room.name = String(raw.name || 'Scanned room').slice(0, 80);
  room.schemaVersion = 2;
  room.revision = number(raw.revision ?? 0, 'revision', 0, Number.MAX_SAFE_INTEGER);
  room.timestamp = number(raw.timestamp ?? 0, 'timestamp', 0, Number.MAX_SAFE_INTEGER);
  const ids = new Set();
  validateLevelGeometry(raw, room, ids);
  if (raw.levelName !== undefined) room.levelName = String(raw.levelName).slice(0, 40) || 'Ground floor';
  if (raw.levels !== undefined) {
    if (!Array.isArray(raw.levels) || raw.levels.length > MAX_LEVELS - 1) throw new Error(`A project can have up to ${MAX_LEVELS} floors and plans.`);
    const levelIds = new Set();
    room.levels = raw.levels.map(l => {
      if (!l || typeof l.id !== 'string' || !/^[\w-]{1,40}$/.test(l.id) || levelIds.has(l.id)) throw new Error('Floor IDs must be unique.');
      levelIds.add(l.id);
      const level = {id:l.id, name:String(l.name || 'Floor').slice(0, 40), elevation:number(l.elevation ?? 0, 'floor elevation', -20, 200), separate:!!l.separate};
      validateLevelGeometry(l, level, ids);
      return level;
    });
  }
  return room;
}

// ---------------------------------------------------------------- geometry
export const wallLength = w => Math.hypot(w.endPoint.x - w.startPoint.x, w.endPoint.z - w.startPoint.z);
export function area(vertices) {
  return Math.abs(vertices.reduce((s, p, i) => { const q = vertices[(i + 1) % vertices.length]; return s + p.x * q.z - q.x * p.z; }, 0) / 2);
}
export function inside(p, vertices) {
  let hit = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if (((a.z > p.z) !== (b.z > p.z)) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}
export function openingSize(opening, wall) {
  if (opening.type === 'door') return {sill:opening.sill ?? 0, height:Math.min(opening.height ?? 2.1, wall.height)};
  const sill = opening.sill ?? Math.min(.9, wall.height * .33);
  return {sill, height:Math.max(.2, Math.min(opening.height ?? 1.2, wall.height - sill - .1))};
}
export function itemSize(item) {
  const def = itemDef(item.type);
  return {w:def.w * item.scale.x, h:def.h * item.scale.y, d:def.d * item.scale.z};
}
export function footprint(item) {
  const {w, d} = itemSize(item), a = yaw(item.rotation), hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => ({x:item.position.x + x * Math.cos(a) + z * Math.sin(a), z:item.position.z - x * Math.sin(a) + z * Math.cos(a)}));
}
export function warnings(room) {
  return room.furniture.filter(f => itemDef(f.type).mount !== 'ceiling' && footprint(f).some(p => !inside(p, room.floor.vertices)))
    .map(f => `${f.label || itemDef(f.type).name} extends outside the room.`);
}
const near = (a, b, eps = .02) => Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps;

/** Index of the floor edge (vertex i → i+1) that a wall follows, or -1 for interior walls. */
export function perimeterEdge(room, wall) {
  const v = room.floor.vertices;
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    if ((near(wall.startPoint, a) && near(wall.endPoint, b)) || (near(wall.startPoint, b) && near(wall.endPoint, a))) return i;
  }
  return -1;
}

function updateFloorMetrics(room) {
  const v = room.floor.vertices, xs = v.map(p => p.x), zs = v.map(p => p.z);
  room.floor.area = area(v);
  room.floor.center = {x:(Math.min(...xs) + Math.max(...xs)) / 2, y:room.floor.center?.y ?? v[0].y ?? 0, z:(Math.min(...zs) + Math.max(...zs)) / 2};
  room.dimensions = {x:Math.max(.5, Math.max(...xs) - Math.min(...xs)), y:room.dimensions.y, z:Math.max(.5, Math.max(...zs) - Math.min(...zs))};
}

/**
 * Replaces the floor polygon and rebuilds the perimeter walls while keeping interior walls and
 * re-attaching doors/windows. `edgeMap(newEdge)` → {old, from, to}: where the new edge came from
 * as a fraction range of an old edge, so openings follow their wall.
 */
export function reshapeFloor(room, vertices, edgeMap) {
  if (vertices.length < 3) throw new Error('A room needs at least three corners.');
  if (area(vertices) < .5) throw new Error('That shape is too small to be a room.');
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    if (Math.hypot(a.x - b.x, a.z - b.z) < .1) throw new Error('Corners must be at least 10 cm apart.');
  }
  if (selfIntersects(vertices)) throw new Error('Walls cannot cross each other.');
  const oldEdges = room.walls.map(w => perimeterEdge(room, w));
  const template = room.walls.find((w, i) => oldEdges[i] >= 0) ?? {height:room.dimensions.y, thickness:.15};
  const heightOf = old => { const i = oldEdges.indexOf(old); return i >= 0 ? room.walls[i] : template; };
  const interior = room.walls.map((w, i) => ({w, i})).filter(({i}) => oldEdges[i] < 0);
  const y = vertices[0].y ?? room.floor.center.y ?? 0;
  const perimeter = vertices.map((a, k) => {
    const b = vertices[(k + 1) % vertices.length], src = heightOf(edgeMap(k)?.old ?? -1);
    return {startPoint:{x:a.x, y, z:a.z}, endPoint:{x:b.x, y, z:b.z}, height:src.height, thickness:src.thickness};
  });
  const openings = [];
  for (const o of room.openings) {
    const oldEdge = oldEdges[o.wall];
    if (oldEdge < 0) {
      const index = interior.findIndex(entry => entry.i === o.wall);
      openings.push({...o, wall:perimeter.length + index});
      continue;
    }
    for (let k = 0; k < perimeter.length; k++) {
      const m = edgeMap(k);
      if (!m || m.old !== oldEdge || o.offset < m.from - 1e-9 || o.offset > m.to + 1e-9) continue;
      const wall = perimeter[k], len = wallLength(wall), offset = (o.offset - m.from) / Math.max(1e-9, m.to - m.from);
      const width = Math.min(o.width, len - .05);
      if (width < .3) break; // The wall became too short; the opening is dropped.
      const half = width / 2 / len;
      openings.push({...o, wall:k, width, offset:Math.min(1 - half, Math.max(half, offset))});
      break;
    }
  }
  room.floor.vertices = vertices.map(p => ({x:p.x, y, z:p.z}));
  room.walls = [...perimeter, ...interior.map(e => e.w)];
  room.openings = openings;
  updateFloorMetrics(room);
  return room;
}
export function moveCorner(room, index, x, z) {
  const v = room.floor.vertices.map((p, i) => i === index ? {...p, x, z} : {...p});
  return reshapeFloor(room, v, k => ({old:k, from:0, to:1}));
}
/** Splits floor edge `edge` at fraction t, adding a draggable corner. */
export function insertCorner(room, edge, t = .5) {
  const v = room.floor.vertices, a = v[edge], b = v[(edge + 1) % v.length];
  const p = {x:a.x + (b.x - a.x) * t, y:a.y, z:a.z + (b.z - a.z) * t};
  const next = [...v.slice(0, edge + 1), p, ...v.slice(edge + 1)];
  return reshapeFloor(room, next, k => k < edge ? {old:k, from:0, to:1} : k === edge ? {old:edge, from:0, to:t} : k === edge + 1 ? {old:edge, from:t, to:1} : {old:k - 1, from:0, to:1});
}
export function removeCorner(room, index) {
  const v = room.floor.vertices;
  if (v.length <= 3) throw new Error('A room needs at least three corners.');
  const next = v.filter((_, i) => i !== index), n = v.length;
  // The merged edge keeps the openings of the first wall it replaces (stretched proportionally).
  return reshapeFloor(room, next, k => {
    const oldOf = j => j < index ? j : j + 1;
    const s = oldOf(k), e = oldOf((k + 1) % (n - 1));
    return {old:(s + 1) % n === e ? s : (index - 1 + n) % n, from:0, to:1};
  });
}
/** Changes the length of floor edge `edge` by moving its end corner along the wall direction. */
export function setEdgeLength(room, edge, length) {
  number(length, 'wall length', .2, 100);
  const v = room.floor.vertices, a = v[edge], bIndex = (edge + 1) % v.length, b = v[bIndex];
  const current = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / current, uz = (b.z - a.z) / current;
  const dx = a.x + ux * length - b.x, dz = a.z + uz * length - b.z;
  // Shift the end corner and keep the following wall parallel by moving the next corner too.
  const next = v.map((p, i) => i === bIndex || (i === (bIndex + 1) % v.length && v.length > 3) ? {...p, x:p.x + dx, z:p.z + dz} : {...p});
  return reshapeFloor(room, next, k => ({old:k, from:0, to:1}));
}
export function setRoomHeight(room, height) {
  number(height, 'ceiling height', 1.8, 10);
  room.dimensions.y = height;
  for (const w of room.walls) if (perimeterEdge(room, w) >= 0) w.height = height;
  for (const f of room.furniture) if (itemDef(f.type).mount === 'ceiling') f.position.y = Math.max(0, height - itemSize(f).h);
  return room;
}
export function selfIntersects(v) {
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const n = v.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
    const a = v[i], b = v[(i + 1) % n], c = v[j], d = v[(j + 1) % n];
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------- creation
const SHAPES = {
  rectangle:(w, d) => [[0, 0], [w, 0], [w, d], [0, d]],
  lshape:(w, d) => [[0, 0], [w, 0], [w, d * .5], [w * .55, d * .5], [w * .55, d], [0, d]],
  ushape:(w, d) => [[0, 0], [w * .33, 0], [w * .33, d * .45], [w * .67, d * .45], [w * .67, 0], [w, 0], [w, d], [0, d]],
  tshape:(w, d) => [[0, 0], [w, 0], [w, d * .45], [w * .68, d * .45], [w * .68, d], [w * .32, d], [w * .32, d * .45], [0, d * .45]],
};
export const shapes = Object.keys(SHAPES);
export function roomFromPolygon(name, points, height = 2.7) {
  const vertices = points.map(p => ({x:p.x, y:0, z:p.z}));
  const xs = vertices.map(p => p.x), zs = vertices.map(p => p.z);
  const room = {roomId:newCode(), name, revision:0, timestamp:0, source:'web',
    dimensions:{x:Math.max(...xs) - Math.min(...xs), y:height, z:Math.max(...zs) - Math.min(...zs)},
    floor:{vertices, center:{x:0, y:0, z:0}, area:area(vertices)},
    walls:vertices.map((p, i) => ({startPoint:p, endPoint:vertices[(i + 1) % vertices.length], height, thickness:.15})), furniture:[], openings:[]};
  updateFloorMetrics(room);
  if (selfIntersects(vertices)) throw new Error('Walls cannot cross each other.');
  return validateRoom(room);
}
export function createRoom(name = 'Untitled room', width = 6, depth = 5, shape = 'rectangle', height = 2.7) {
  number(width, 'width', 1, 50); number(depth, 'depth', 1, 50); number(height, 'ceiling height', 1.8, 10);
  const points = (SHAPES[shape] ?? SHAPES.rectangle)(width, depth).map(([x, z]) => ({x:x - width / 2, z:z - depth / 2}));
  return roomFromPolygon(name, points, height);
}
export function addItem(type, x = 0, z = 0, room = null) {
  if (!byType.has(type)) throw new Error('Unknown furniture.');
  const def = byType.get(type);
  const y = def.mount === 'ceiling' && room ? Math.max(0, room.dimensions.y - def.h) : def.elev;
  return {id:crypto.randomUUID(), type, position:{x, y:(room?.floor.center.y ?? 0) + y, z}, rotation:{x:0, y:0, z:0}, scale:{x:1, y:1, z:1}, color:def.color, timestamp:Date.now()};
}
export function demoRoom() {
  const r = createRoom('The quiet corner', 7, 5.5);
  r.roomId = 'DEMO';
  const place = (type, x, z, rot = 0, extra = {}) => { const f = addItem(type, x, z, r); f.rotation.y = rot; Object.assign(f, extra); r.furniture.push(f); return f; };
  place('rug', -.6, .2, 0, {scale:{x:1.3, y:1, z:1.4}});
  place('sofa', -.6, -2.1);
  place('coffee-table', -.6, -.7);
  place('armchair', 1.2, -.6, -Math.PI / 2);
  place('tv-stand', -.6, 2.5, Math.PI);
  place('tv', -.6, 2.55, Math.PI);
  place('bookshelf', -3.3, -.4, Math.PI / 2);
  place('plant', 3.0, -2.3);
  place('floor-lamp', -2.0, -2.35);
  place('table-round', 2.3, 1.6);
  place('chair', 2.3, 0.95);
  place('chair', 2.3, 2.25, Math.PI);
  place('pendant-light', 2.3, 1.6);
  r.openings = [{wall:3, type:'door', offset:.75, width:.9}, {wall:0, type:'window', offset:.6, width:2}, {wall:1, type:'window', offset:.35, width:1.4}];
  return validateRoom(r);
}

// ---------------------------------------------------------------- history & sync
export class History {
  constructor(room) { this.reset(room); }
  reset(room) { this.items = [clone(room)]; this.index = 0; }
  push(room) { this.items = this.items.slice(0, this.index + 1); this.items.push(clone(room)); if (this.items.length > 80) this.items.shift(); this.index = this.items.length - 1; }
  undo() { if (this.index > 0) this.index--; return clone(this.items[this.index]); }
  redo() { if (this.index < this.items.length - 1) this.index++; return clone(this.items[this.index]); }
}
export const SYNC_FIELDS = ['name', 'dimensions', 'floor', 'walls', 'furniture', 'openings', 'levels', 'levelName'];
export function savePatch(room, base, now = Date.now()) {
  const valid = validateRoom(room);
  const patch = {schemaVersion:2, name:valid.name, dimensions:valid.dimensions, floor:valid.floor, walls:valid.walls, furniture:valid.furniture, openings:valid.openings,
    revision:(base.revision ?? 0) + 1, timestamp:Math.max(now, (base.timestamp ?? 0) + 1)};
  // Always written (even empty) so deleting the last extra floor also removes it in Firestore.
  patch.levels = valid.levels ?? [];
  patch.levelName = valid.levelName ?? 'Ground floor';
  return patch;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Merges one floor: furniture per item id, outline (floor + walls + openings) as a unit, local wins on conflict. */
function mergeLevel(base, local, remote) {
  const merged = clone(remote);
  for (const key of ['name', 'dimensions', 'elevation', 'separate', 'levelName']) if (!same(local[key], base[key])) { if (local[key] === undefined) delete merged[key]; else merged[key] = clone(local[key]); }
  if (!same(local.floor, base.floor) || !same(local.walls, base.walls) || !same(local.openings, base.openings)) {
    merged.floor = clone(local.floor); merged.walls = clone(local.walls); merged.openings = clone(local.openings); merged.dimensions = clone(local.dimensions);
  }
  const baseItems = new Map(base.furniture.map(f => [f.id, f]));
  const localItems = new Map(local.furniture.map(f => [f.id, f]));
  const remoteItems = new Map(remote.furniture.map(f => [f.id, f]));
  const result = [];
  for (const f of remote.furniture) {
    const b = baseItems.get(f.id), l = localItems.get(f.id);
    if (!l) { if (!b || !same(b, f)) result.push(f); continue; } // deleted locally → drop unless changed remotely
    result.push(b && same(b, l) ? f : l);
  }
  for (const f of local.furniture) if (!remoteItems.has(f.id) && !baseItems.has(f.id)) result.push(f); // added locally
  merged.furniture = clone(result);
  return merged;
}

/**
 * Three-way merge used when the phone and the website edit the same project at the same time.
 * Floors (levels) are matched by id; each floor merges like a room. The saving side wins conflicts.
 */
export function mergeRooms(base, local, remote) {
  const merged = mergeLevel(base, local, remote);
  const b = new Map((base.levels ?? []).map(l => [l.id, l])), l = new Map((local.levels ?? []).map(x => [x.id, x]));
  const remoteIds = new Set((remote.levels ?? []).map(x => x.id));
  const levels = [];
  for (const r of remote.levels ?? []) {
    const bl = b.get(r.id), ll = l.get(r.id);
    if (!ll) { if (!bl || !same(bl, r)) levels.push(clone(r)); continue; }
    levels.push(bl ? mergeLevel(bl, ll, r) : clone(ll));
  }
  for (const x of local.levels ?? []) if (!remoteIds.has(x.id) && !b.has(x.id)) levels.push(clone(x));
  if (levels.length || remote.levels || local.levels) merged.levels = levels; else delete merged.levels;
  return merged;
}
export const hasChanges = (a, b) => SYNC_FIELDS.some(k => !same(a[k], b[k]));

// ---------------------------------------------------------------- floors (levels)
export const LEVEL_FIELDS = ['dimensions', 'floor', 'walls', 'openings', 'furniture'];
export const levelCount = house => 1 + (house.levels?.length ?? 0);
export function levelInfo(house, i) {
  if (!i) return {id:'ground', name:house.levelName || 'Ground floor', elevation:0, separate:false};
  const l = house.levels[i - 1];
  return {id:l.id, name:l.name, elevation:l.elevation, separate:l.separate};
}
/** Room-shaped copy of floor i (project metadata + that floor's geometry) that all editing tools work on. */
export function levelView(house, i) {
  const v = clone(house);
  delete v.levels;
  if (i) for (const k of LEVEL_FIELDS) v[k] = clone(house.levels[i - 1][k]);
  return v;
}
/** Returns the project with floor i replaced by the edited view. */
export function withLevel(house, i, view) {
  const h = clone(house);
  for (const k of LEVEL_FIELDS) { if (i) h.levels[i - 1][k] = clone(view[k]); else h[k] = clone(view[k]); }
  return h;
}
const levelHeight = (house, i) => i ? house.levels[i - 1].dimensions.y : house.dimensions.y;
/** Floors that belong to the main building, ordered bottom to top. */
export function stackedLevels(house) {
  return Array.from({length:levelCount(house)}, (_, i) => i).filter(i => !levelInfo(house, i).separate).sort((a, b) => levelInfo(house, a).elevation - levelInfo(house, b).elevation);
}
export function levelAbove(house, i) {
  if (levelInfo(house, i).separate) return -1;
  const order = stackedLevels(house), k = order.indexOf(i);
  return k >= 0 && k < order.length - 1 ? order[k + 1] : -1;
}
export function levelBelow(house, i) {
  if (levelInfo(house, i).separate) return -1;
  const order = stackedLevels(house), k = order.indexOf(i);
  return k > 0 ? order[k - 1] : -1;
}
const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
/** Adds a floor stacked on top of the building (copying an outline) or a separate plan. Returns its index. */
export function addLevel(house, {name, separate = false, copyFrom = 0, width = 6, depth = 5} = {}) {
  if (levelCount(house) >= MAX_LEVELS) throw new Error(`A project can have up to ${MAX_LEVELS} floors and plans.`);
  let src;
  if (copyFrom === null || copyFrom === undefined) src = createRoom('Plan', width, depth);
  else {
    src = levelView(house, copyFrom);
    src.walls = src.walls.filter(w => perimeterEdge(src, w) >= 0);
  }
  const top = stackedLevels(house).at(-1);
  const elevation = separate ? 0 : Math.round((levelInfo(house, top).elevation + levelHeight(house, top) + .25) * 100) / 100;
  const level = {id:shortId(), name:String(name || (separate ? 'Plan' : `Floor ${stackedLevels(house).length}`)).slice(0, 40), elevation, separate,
    dimensions:clone(src.dimensions), floor:clone(src.floor), walls:clone(src.walls), openings:[], furniture:[]};
  house.levels = [...(house.levels ?? []), level];
  return house.levels.length;
}
export function removeLevel(house, i) {
  if (!i) throw new Error('The ground floor cannot be removed.');
  house.levels.splice(i - 1, 1);
  if (!house.levels.length) delete house.levels;
  return house;
}
/** Stretches a staircase so its top reaches the floor above. Returns false if there is no floor above. */
export function fitStairs(house, i, item) {
  const above = levelAbove(house, i), def = itemDef(item.type);
  if (above < 0 || !def.path?.length) return false;
  const rise = levelInfo(house, above).elevation - levelInfo(house, i).elevation;
  if (rise <= .1) return false;
  item.scale = {...item.scale, y:Math.round(rise / def.h * 1000) / 1000};
  return true;
}
/** Walking path of a staircase in item space (meters before item scale), from its catalog definition. */
export function stairPath(type) {
  const p = itemDef(type).path ?? [];
  const out = [];
  for (let i = 0; i + 2 < p.length; i += 3) out.push({x:p[i], y:p[i + 1], z:p[i + 2]});
  return out;
}
