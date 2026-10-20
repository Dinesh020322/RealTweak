import './style.css';
import {catalog,categories,clone,code,formatCode,createRoom,demoRoom,validateRoom,addItem,History,area,warnings,itemDef,itemSize,shapes,
  moveCorner,insertCorner,removeCorner,setEdgeLength,setRoomHeight,reshapeFloor,perimeterEdge,wallLength,mergeRooms,hasChanges,openingSize,
  levelView,withLevel,levelInfo,levelCount,addLevel,removeLevel,levelAbove,levelBelow,fitStairs,stairPath} from './model.js';
import {renderPlan} from './plan2d.js';
import {thumbnail} from './symbols.js';
import * as cloud from './cloud.js';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const DEG = 180 / Math.PI;
// `house` is the whole project (all floors); `room` is the floor being edited (see levelView).
let house = demoRoom(), level = 0, room = levelView(house, 0), base = clone(house), history = new History(house), all3d = true, selected = null, category = 'All', tool = 'select', pendingType = null, wallStart = null, draft = [], mode = '2d', view3d = null;
let linked = false, dirty = false, saving = false, loading = false, remote = null, unsubscribe = null, unsubscribeDevices = null, devices = [];
let zoom = 1, center = {x:0, z:0}, drag = null, meshGeneration = 0, workspaceGeneration = 0, autosyncTimer = null, newShape = 'rectangle';
const storageKey = 'realtweak:active:v2';

// ---------------------------------------------------------------- drafts on this device
const draftsButton = document.createElement('button');
draftsButton.id = 'drafts'; draftsButton.className = 'wide'; draftsButton.textContent = '▤ Saved drafts on this device';
$('build-panel').append(draftsButton);
const draftsDialog = document.createElement('dialog');
draftsDialog.innerHTML = '<button class="close" aria-label="Close dialog">×</button><span class="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Your local drafts</h2><p>Drafts are stored in this browser. Export a JSON file to back them up or move them to another device.</p><div id="draft-list"></div>';
document.body.append(draftsDialog);
draftsButton.onclick = () => {
  if (saving || loading) return;
  try {
    persist(); const drafts = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i); if (!key.startsWith('realtweak:draft:')) continue;
      try { const d = JSON.parse(localStorage.getItem(key)); validateRoom(d.room); drafts.push(d); } catch { /* Keep unreadable draft in storage for manual recovery. */ }
    }
    $('draft-list').innerHTML = drafts.map(d => `<button class="wide" data-draft="${esc(d.room.roomId)}">${esc(d.room.name)} <span class="muted">· ${esc(formatCode(d.room.roomId))} · ${d.dirty ? 'unsynced changes' : d.linked ? 'connected' : 'local'}</span></button>`).join('') || '<p>No saved drafts yet.</p>';
    draftsDialog.showModal();
  } catch { message('Your browser does not allow draft storage. Export your room JSON instead.', true); }
};
draftsDialog.addEventListener('click', e => {
  const id = e.target.closest('[data-draft]')?.dataset.draft; if (!id) return;
  try {
    const d = JSON.parse(localStorage.getItem(`realtweak:draft:${id}`)), restored = validateRoom(d.room), restoredBase = validateRoom(d.base);
    replaceRoom(restored, false); base = restoredBase; linked = !!d.linked; dirty = !!d.dirty; persist(); render(); listen(); draftsDialog.close();
    message('Draft restored. Cloud changes will be merged when you save.');
  } catch (err) { message(`Could not restore draft: ${err.message}`, true); }
});

function message(text, error = false) { $('notice-text').textContent = text; $('notice').classList.toggle('error', error); }
function persist() {
  try {
    const data = JSON.stringify({room:house, base, linked, dirty});
    localStorage.setItem(storageKey, data); localStorage.setItem(`realtweak:draft:${room.roomId}`, data);
  } catch { message('This browser could not store your draft. Export a JSON backup before closing.', true); }
}
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  if (saved) { house = validateRoom(saved.room); room = levelView(house, 0); base = validateRoom(saved.base); linked = !!saved.linked; dirty = !!saved.dirty; history.reset(house); message('Your previous workspace has been restored from this device.'); }
} catch { message('The stored draft could not be read. A fresh demo is open; import a backup if you have one.', true); }
try { $('autosync').checked = localStorage.getItem('realtweak:autosync') === '1'; } catch { /* Storage blocked: default off. */ }

// ---------------------------------------------------------------- editing primitives
function fit() {
  const v = room.floor.vertices;
  center = {x:(Math.min(...v.map(p => p.x)) + Math.max(...v.map(p => p.x))) / 2, z:(Math.min(...v.map(p => p.z)) + Math.max(...v.map(p => p.z))) / 2};
  zoom = 1; renderPlanView(); view3d?.fit();
}
function changed() {
  room = validateRoom(room);
  house = validateRoom({...withLevel(house, level, room), name:room.name});
  room = levelView(house, level);
  dirty = true; history.push(house); persist(); render(); scheduleAutosync();
}
/** Applies a project-level edit (adding/removing/renaming floors). */
function houseChanged(next, nextLevel = level) {
  try { house = validateRoom(next); } catch (e) { message(e.message, true); return false; }
  enterLevel(nextLevel, false);
  dirty = true; history.push(house); persist(); render(); scheduleAutosync();
  return true;
}
function enterLevel(i, redraw = true) {
  level = Math.max(0, Math.min(i, levelCount(house) - 1));
  room = levelView(house, level);
  if (redraw) { selected = null; wallStart = null; draft = []; fit(); render(); }
}
function commit(action) {
  const before = clone(room);
  try { action(); changed(); return true; } catch (e) { room = before; message(e.message, true); render(); return false; }
}
function setTool(next, type = null) {
  tool = next; pendingType = type; wallStart = null; draft = [];
  if (next !== 'select') mode2d();
  const hints = {place:`Click inside the plan to place: ${type ? itemDef(type).name : ''}`, wall:'Click two points to draw an interior wall', door:'Click a wall to add a door', window:'Click a wall to add a window', draw:'Click to add corners · click the first corner (or press Enter) to finish'};
  $('tool-hint').textContent = hints[next] ?? 'Drag furniture to move · Drag corners to reshape · Scroll to zoom';
  renderCatalog(); renderPlanView();
}
const selectedItem = () => room.furniture.find(f => f.id === selected);
const kindOf = id => id?.includes(':') ? id.split(':')[0] : id ? 'item' : 'room';
const indexOf = id => Number(id.split(':')[1]);

// ---------------------------------------------------------------- catalog
function renderCatalog() {
  const query = $('search').value.trim().toLowerCase();
  const list = catalog.filter(c => (category === 'All' || c.category === category) && (!query || `${c.name} ${c.tags} ${c.category} ${c.type}`.toLowerCase().includes(query)));
  $('categories').innerHTML = ['All', ...categories.filter(c => catalog.some(i => i.category === c))].map(c => `<button class="${category === c ? 'active' : ''}" data-category="${c}">${c}</button>`).join('');
  $('category-title').textContent = category === 'All' ? 'All furniture' : category;
  $('catalog-count').textContent = `${list.length} pieces`;
  $('catalog').innerHTML = list.map(c => `<button class="catalog-card ${pendingType === c.type ? 'active' : ''}" data-type="${c.type}" aria-label="Place ${esc(c.name)}"><span class="thumb">${thumbnail(c.type)}</span><strong>${esc(c.name)}</strong><small>${c.w.toFixed(2)} × ${c.d.toFixed(2)} m</small></button>`).join('') || '<p class="small muted">No furniture matches. Try another search.</p>';
}

// ---------------------------------------------------------------- rendering
function render() {
  $('project-name').textContent = room.name; $('canvas-title').textContent = levelCount(house) > 1 ? `${room.name} · ${levelInfo(house, level).name}` : room.name;
  renderLevels();
  $('room-mode').textContent = linked ? `LIVE · ${formatCode(room.roomId)}` : room.roomId === 'DEMO' ? 'LOCAL DEMO' : 'LOCAL DRAFT';
  $('area').textContent = `${area(room.floor.vertices).toFixed(1)} m² floor area`;
  $('item-count').textContent = `${room.furniture.length} objects`;
  $('object-count').textContent = room.furniture.length;
  $('draft-status').textContent = saving ? 'Saving…' : dirty ? (linked ? 'Unsynced changes · draft stored locally' : 'Local draft · not uploaded') : linked ? `Synced · revision ${room.revision}` : 'Local workspace · not uploaded';
  $('save').textContent = saving ? 'Saving…' : linked ? (dirty ? 'Save to cloud' : 'Saved ✓') : 'Publish room';
  $('save').disabled = saving || loading;
  $('undo').disabled = history.index === 0; $('redo').disabled = history.index === history.items.length - 1;
  for (const id of ['new-room', 'open-room', 'import']) $(id).disabled = saving || loading;
  $('connection').textContent = !navigator.onLine ? 'Offline · local editing' : linked ? `Connected · ${formatCode(room.roomId)}` : cloud.configured ? 'Cloud ready' : 'Local workspace';
  $('reload-remote').hidden = !remote;
  $('objects').innerHTML = room.furniture.map(f => `<button class="object-row ${selected === f.id ? 'active' : ''}" data-id="${esc(f.id)}"><span class="object-dot" style="background:${f.color}"></span>${esc(f.label || itemDef(f.type).name)}${f.source === 'scan' ? '<span class="badge">scanned</span>' : ''}<span class="object-type">↗</span></button>`).join('') || '<p class="small muted">A blank canvas. Add your first piece from the library.</p>';
  $('warnings').innerHTML = [...new Set(warnings(room))].map(w => `<p>△ ${esc(w)}</p>`).join('');
  renderPhones(); renderProperties(); renderPlanView();
  if (mode === '3d') draw3d();
}
function draw3d(fitView = false) {
  if (!view3d) return;
  if (all3d && levelCount(house) > 1) view3d.updateHouse(house, level, selected, fitView); else view3d.update(room, selected, fitView);
}
function renderPhones() {
  if (!linked) { $('phone-status').textContent = 'Scan a room with the RealTweak AR app, enter its code here, and every saved change appears on the phone.'; return; }
  if (!devices.length) { $('phone-status').innerHTML = `No phone is viewing this room right now. Open the RealTweak AR app and enter <strong>${esc(formatCode(room.roomId))}</strong>.`; return; }
  $('phone-status').innerHTML = devices.map(d => {
    const current = d.appliedRevision >= room.revision;
    return `<span class="phone-row"><span class="phone-dot ${current ? 'ok' : ''}"></span>${esc(String(d.model || d.platform || 'Phone').slice(0, 40))} · ${current ? 'showing your latest save' : `on revision ${Number(d.appliedRevision) || 0}`}</span>`;
  }).join('');
}
function field(label, id, value, step = '.01', min = '-100', max = '100') {
  return `<label>${label}<input data-property="${id}" type="number" value="${value}" step="${step}" min="${min}" max="${max}"></label>`;
}
const SWATCHES = ['#f4f3ef', '#d9d4c7', '#b88b61', '#8c6b4f', '#5e4a39', '#879787', '#5b6e6a', '#8b98a3', '#3a4148', '#c49a6c', '#d08a5a', '#b55d4c'];
function renderProperties() {
  const kind = kindOf(selected), f = selectedItem();
  let title = 'Room overview', subtitle = 'A little space. A lot of possibility.', html = '';
  if (kind === 'item' && f) {
    const def = itemDef(f.type), size = itemSize(f);
    title = f.label || def.name; subtitle = f.source === 'scan' ? 'Detected by the phone scan. Adjust it to match reality.' : 'Every detail, just where you want it.';
    html = `<div class="fields"><label>Label<input id="item-label" value="${esc(f.label ?? '')}" maxlength="60" placeholder="${esc(def.name)}"></label>
      <div class="field-row">${field('X position (m)', 'x', f.position.x.toFixed(2))}${field('Z position (m)', 'z', f.position.z.toFixed(2))}</div>
      <div class="field-row">${field('Width (m)', 'width', size.w.toFixed(2), '.01', '.05', '30')}${field('Depth (m)', 'depth', size.d.toFixed(2), '.01', '.01', '30')}</div>
      <div class="field-row">${field('Height (m)', 'height', size.h.toFixed(2), '.01', '.005', '30')}${field('Rotation (°)', 'rotation', (f.rotation.y * DEG).toFixed(0), '1', '-360', '360')}</div>
      ${field('Elevation above floor (m)', 'y', (f.position.y - room.floor.center.y).toFixed(2), '.01', '-10', '20')}
      <label>Finish<input data-property="color" type="color" value="${f.color}"></label><div class="swatches">${SWATCHES.map(c => `<button class="swatch" data-swatch="${c}" style="background:${c}" aria-label="Finish ${c}"></button>`).join('')}</div></div>
      <div class="actions-row"><button id="rotate90">↻ 90°</button><button id="duplicate">Duplicate</button><button id="delete" class="danger">Remove</button></div>
      ${stairPath(f.type).length ? (() => { const above = levelAbove(house, level); return above >= 0
        ? `<div class="floor-card"><span class="eyebrow">CONNECTS FLOORS</span><p class="small">${esc(levelInfo(house, level).name)} → ${esc(levelInfo(house, above).name)} (${(levelInfo(house, above).elevation - levelInfo(house, level).elevation).toFixed(2)} m rise)</p><button id="fit-stairs" class="wide">Fit height to the floor above</button></div>`
        : '<p class="small muted">Add a floor above (＋ Floor or plan) to connect these stairs.</p>'; })() : ''}
      ${def.type === 'unknown' || !catalog.some(c => c.type === f.type) ? '<p class="small muted">Unknown model from a newer app version. It is kept and shown as a box.</p>' : ''}`;
  } else if (kind === 'wall' && room.walls[indexOf(selected)]) {
    const i = indexOf(selected), w = room.walls[i], edge = perimeterEdge(room, w);
    title = edge >= 0 ? `Wall ${edge + 1}` : 'Interior wall'; subtitle = edge >= 0 ? 'Part of the room outline.' : 'A free-standing wall inside the room.';
    html = `<div class="fields">${field('Length (m)', 'wallLength', wallLength(w).toFixed(2), '.01', '.2', '100')}
      <div class="field-row">${field('Height (m)', 'wallHeight', w.height.toFixed(2), '.05', '.1', '20')}${field('Thickness (m)', 'thickness', w.thickness.toFixed(2), '.01', '.01', '2')}</div>
      ${edge < 0 ? `<div class="field-row">${field('Start X', 'startX', w.startPoint.x.toFixed(2))}${field('Start Z', 'startZ', w.startPoint.z.toFixed(2))}</div><div class="field-row">${field('End X', 'endX', w.endPoint.x.toFixed(2))}${field('End Z', 'endZ', w.endPoint.z.toFixed(2))}</div>` : ''}</div>
      ${edge >= 0 ? `<p class="small muted">Changing the length moves the next corner along this wall. Double-click the wall on the plan to add a corner at that point.</p><button id="add-corner" class="wide">＋ Add corner in the middle</button>` : '<button id="delete" class="wide danger">Remove wall</button>'}`;
  } else if (kind === 'corner' && room.floor.vertices[indexOf(selected)]) {
    const i = indexOf(selected), p = room.floor.vertices[i];
    title = `Corner ${i + 1}`; subtitle = 'Drag it on the plan or type exact coordinates.';
    html = `<div class="fields"><div class="field-row">${field('X (m)', 'cornerX', p.x.toFixed(2))}${field('Z (m)', 'cornerZ', p.z.toFixed(2))}</div></div><button id="delete" class="wide danger" ${room.floor.vertices.length <= 3 ? 'disabled' : ''}>Remove corner</button>`;
  } else if (kind === 'opening' && room.openings[indexOf(selected)]) {
    const o = room.openings[indexOf(selected)], w = room.walls[o.wall], size = openingSize(o, w);
    title = o.type === 'door' ? 'Door' : 'Window'; subtitle = o.source === 'scan' ? 'Detected by the phone scan.' : 'Openings follow their wall when you reshape the room.';
    html = `<div class="fields"><div class="field-row">${field('Width (m)', 'openingWidth', o.width.toFixed(2), '.05', '.3', '6')}${field('Position (%)', 'offset', (o.offset * 100).toFixed(0), '1', '0', '100')}</div>
      <div class="field-row">${field('Height (m)', 'openingHeight', size.height.toFixed(2), '.05', '.2', '10')}${o.type === 'window' ? field('Sill height (m)', 'sill', size.sill.toFixed(2), '.05', '0', '10') : ''}</div></div><button id="delete" class="wide danger">Remove ${o.type}</button>`;
  } else {
    selected = null;
    const perimeter = room.floor.vertices.reduce((s, p, i, v) => s + Math.hypot(v[(i + 1) % v.length].x - p.x, v[(i + 1) % v.length].z - p.z), 0);
    const info = levelInfo(house, level), above = levelAbove(house, level), stairs = room.furniture.filter(f => stairPath(f.type).length).length;
    const floorCard = `<div class="floor-card"><span class="eyebrow">THIS FLOOR</span><div class="fields"><label>Floor name<input id="level-name-edit" value="${esc(info.name)}" maxlength="40"></label>
      ${level > 0 && !info.separate ? field('Floor height above ground (m)', 'levelElevation', info.elevation.toFixed(2), '.05', '-20', '200') : ''}
      ${level > 0 ? `<label class="check"><input type="checkbox" id="level-separate" ${info.separate ? 'checked' : ''}> Separate plan (not stacked on the building)</label>` : ''}</div>
      <p class="small muted">${info.separate ? 'Shown beside the building in 3D.' : above >= 0 ? `${stairs ? `${stairs} staircase${stairs > 1 ? 's' : ''} lead${stairs > 1 ? '' : 's'}` : 'Add a staircase here to lead'} up to ${esc(levelInfo(house, above).name)}.` : 'Top floor of the building.'}</p>
      ${level > 0 ? '<button id="delete-level" class="wide danger">Delete this floor</button>' : ''}</div>`;
    html = `${levelCount(house) > 1 || level > 0 ? floorCard : ''}<div class="fields"><label>Project name<input id="room-name" value="${esc(room.name)}" maxlength="80"></label>
      ${field('Ceiling height (m)', 'roomHeight', room.dimensions.y.toFixed(2), '.05', '1.8', '10')}
      <div class="field-row"><label>Floor area<div class="room-code-display">${area(room.floor.vertices).toFixed(2)} m²</div></label><label>Perimeter<div class="room-code-display">${perimeter.toFixed(2)} m</div></label></div></div>
      <p class="small muted" style="margin-top:15px">${linked ? 'Room code — enter it in the AR app' : 'Local room — publish to get a room code'}</p><div class="room-code-display big-code">${esc(formatCode(room.roomId))}</div>
      <div class="actions-row"><button id="copy-code" ${!linked ? 'disabled' : ''}>Copy code</button><button id="load-mesh" ${!linked ? 'disabled' : ''}>Show scan mesh</button></div>
      <p class="small muted" style="margin-top:10px">${room.source === 'scan' ? `Scanned on a phone${room.scan?.method ? ` (${esc(room.scan.method)})` : ''}. ` : ''}Anyone with a published code can edit. Share it only with people you trust.</p>`;
  }
  $('inspector-title').textContent = title; $('inspector-subtitle').textContent = subtitle; $('properties').innerHTML = html;
}
function bounds() {
  const v = room.floor.vertices, w = Math.max(...v.map(p => p.x)) - Math.min(...v.map(p => p.x)), h = Math.max(...v.map(p => p.z)) - Math.min(...v.map(p => p.z));
  const rect = $('plan').getBoundingClientRect(), aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
  const height = Math.max(h + 3, (w + 3) / aspect) / zoom, width = height * aspect;
  return {x:center.x - width / 2, z:center.z - height / 2, width, height};
}
function renderPlanView() {
  if (!$('plan').clientWidth) return;
  const b = bounds();
  $('plan').setAttribute('viewBox', `${b.x} ${b.z} ${b.width} ${b.height}`);
  const below = levelBelow(house, level);
  $('plan').innerHTML = renderPlan(room, {bounds:b, zoom, selected, wallStart, draft:tool === 'draw' ? draft : null, ghost:below >= 0 ? levelView(house, below) : null});
  $('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
}

// ---------------------------------------------------------------- pointer interaction (2D)
function point(event) { const p = $('plan').createSVGPoint(); p.x = event.clientX; p.y = event.clientY; const loc = p.matrixTransform($('plan').getScreenCTM().inverse()); return {x:loc.x, z:loc.y}; }
const snapped = value => $('snap').checked ? Math.round(value * 20) / 20 : Math.round(value * 100) / 100;
function snapToWall(item, p) {
  // Wall-mounted pieces (TV, cabinets, mirrors…) hug the nearest wall and face into the room.
  let best = null;
  room.walls.forEach(w => {
    const ax = w.startPoint.x, az = w.startPoint.z, dx = w.endPoint.x - ax, dz = w.endPoint.z - az, len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / len2)), qx = ax + dx * t, qz = az + dz * t, dist = Math.hypot(p.x - qx, p.z - qz);
    if (!best || dist < best.dist) best = {dist, qx, qz, dx, dz, w};
  });
  if (!best || best.dist > 1) return false;
  const len = Math.hypot(best.dx, best.dz); let nx = -best.dz / len, nz = best.dx / len;
  if ((p.x - best.qx) * nx + (p.z - best.qz) * nz < 0) { nx = -nx; nz = -nz; }
  const off = best.w.thickness / 2 + itemSize(item).d / 2 + .005;
  item.position.x = best.qx + nx * off; item.position.z = best.qz + nz * off; item.rotation = {x:0, y:Math.atan2(nx, nz), z:0};
  return true;
}
$('plan').addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.button !== 1) return;
  const p = point(e), t = e.target;
  const item = t.closest('[data-item]')?.dataset.item, wall = t.closest('[data-wall]')?.dataset.wall, opening = t.closest('[data-opening]')?.dataset.opening;
  const corner = t.closest('[data-corner]')?.dataset.corner, rotate = t.closest('[data-rotate]')?.dataset.rotate;
  if (e.button === 1 || e.shiftKey && tool === 'select' && !item) { drag = {kind:'pan', x:e.clientX, y:e.clientY, center:{...center}, bounds:bounds()}; $('plan').setPointerCapture(e.pointerId); return; }
  if (tool === 'place') {
    commit(() => {
      if (room.furniture.length >= 300) throw new Error('Room limit: 300 objects.');
      const f = addItem(pendingType, snapped(p.x), snapped(p.z), room);
      if (itemDef(f.type).mount === 'wall') snapToWall(f, p);
      if (stairPath(f.type).length) fitStairs(house, level, f);
      room.furniture.push(f); selected = f.id;
    });
    setTool('select'); return;
  }
  if (tool === 'draw') {
    const q = {x:snapped(p.x), z:snapped(p.z)};
    if (draft.length >= 3 && Math.hypot(q.x - draft[0].x, q.z - draft[0].z) < .3 / zoom) finishDraw();
    else { draft.push(q); renderPlanView(); }
    return;
  }
  if (tool === 'wall') {
    if (!wallStart) { wallStart = {x:snapped(p.x), y:room.floor.center.y, z:snapped(p.z)}; renderPlanView(); return; }
    const start = wallStart;
    commit(() => {
      const end = {x:snapped(p.x), y:start.y, z:snapped(p.z)};
      if (Math.hypot(start.x - end.x, start.z - end.z) < .1) throw new Error('A wall must be at least 0.1 m long.');
      room.walls.push({startPoint:start, endPoint:end, height:room.dimensions.y, thickness:.1}); selected = `wall:${room.walls.length - 1}`;
    });
    wallStart = null; renderPlanView(); return;
  }
  if (tool === 'door' || tool === 'window') {
    if (wall === undefined) { message('Click directly on a wall to place the opening.'); return; }
    commit(() => {
      const w = room.walls[wall], dx = w.endPoint.x - w.startPoint.x, dz = w.endPoint.z - w.startPoint.z, len = Math.hypot(dx, dz), width = tool === 'door' ? .9 : 1.2;
      if (len < width + .1) throw new Error('This wall is too short for that opening.');
      const offset = Math.max(width / 2 / len, Math.min(1 - width / 2 / len, ((p.x - w.startPoint.x) * dx + (p.z - w.startPoint.z) * dz) / (len * len)));
      room.openings.push({wall:Number(wall), type:tool, width, offset}); selected = `opening:${room.openings.length - 1}`;
    });
    setTool('select'); return;
  }
  if (rotate) { drag = {kind:'rotate', id:rotate, before:clone(room), moved:false}; $('plan').setPointerCapture(e.pointerId); return; }
  if (corner !== undefined) { selected = `corner:${corner}`; drag = {kind:'corner', index:Number(corner), before:clone(room), moved:false}; $('plan').setPointerCapture(e.pointerId); render(); return; }
  selected = item ?? (opening !== undefined ? `opening:${opening}` : wall !== undefined ? `wall:${wall}` : null);
  if (item) { const f = selectedItem(); drag = {kind:'item', id:item, offset:{x:p.x - f.position.x, z:p.z - f.position.z}, before:clone(room), moved:false}; $('plan').setPointerCapture(e.pointerId); }
  else if (!t.closest('[data-floor]') && opening === undefined && wall === undefined) { drag = {kind:'pan', x:e.clientX, y:e.clientY, center:{...center}, bounds:bounds()}; $('plan').setPointerCapture(e.pointerId); }
  render();
});
$('plan').addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.kind === 'pan') { const rect = $('plan').getBoundingClientRect(); center = {x:drag.center.x - (e.clientX - drag.x) / rect.width * drag.bounds.width, z:drag.center.z - (e.clientY - drag.y) / rect.height * drag.bounds.height}; renderPlanView(); return; }
  const p = point(e);
  if (drag.kind === 'corner') {
    const v = drag.before.floor.vertices, n = v.length, prev = v[(drag.index - 1 + n) % n], next = v[(drag.index + 1) % n];
    let x = snapped(p.x), z = snapped(p.z);
    // Keep right angles easy: snap to the neighbouring corners' axes.
    const tol = .15 / zoom;
    for (const q of [prev, next]) { if (Math.abs(x - q.x) < tol) x = q.x; if (Math.abs(z - q.z) < tol) z = q.z; }
    try { room = moveCorner(clone(drag.before), drag.index, x, z); drag.moved = true; renderPlanView(); } catch { /* Keep the last valid shape while dragging. */ }
    return;
  }
  const f = room.furniture.find(item => item.id === drag.id); if (!f) return;
  if (drag.kind === 'rotate') {
    let angle = Math.atan2(-(p.x - f.position.x), -(p.z - f.position.z));
    if ($('snap').checked && !e.altKey) angle = Math.round(angle / (Math.PI / 12)) * Math.PI / 12;
    f.rotation = {x:0, y:angle, z:0}; drag.moved = true; renderPlanView(); return;
  }
  f.position.x = snapped(p.x - drag.offset.x); f.position.z = snapped(p.z - drag.offset.z);
  if (itemDef(f.type).mount === 'wall') snapToWall(f, {x:p.x - drag.offset.x, z:p.z - drag.offset.z});
  drag.moved = true; renderPlanView();
});
function endDrag(cancel = false) {
  if (!drag) return;
  const previous = drag; drag = null;
  if (previous.kind === 'pan') return;
  if (cancel) { room = previous.before; render(); return; }
  if (previous.moved) { try { changed(); } catch (e) { room = previous.before; message(e.message, true); render(); } }
}
$('plan').addEventListener('pointerup', () => endDrag()); $('plan').addEventListener('pointercancel', () => endDrag(true));
$('plan').addEventListener('dblclick', e => {
  const wall = e.target.closest('[data-wall]')?.dataset.wall; if (wall === undefined) return;
  const w = room.walls[wall], edge = perimeterEdge(room, w); if (edge < 0) return;
  const a = room.floor.vertices[edge], b = room.floor.vertices[(edge + 1) % room.floor.vertices.length], p = point(e);
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(.05, Math.min(.95, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  if (commit(() => { insertCorner(room, edge, t); selected = `corner:${edge + 1}`; })) message('Corner added. Drag it to reshape the room.');
});
$('plan').addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(.3, Math.min(6, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); renderPlanView(); }, {passive:false});
new ResizeObserver(() => renderPlanView()).observe($('viewport'));
function finishDraw() {
  if (draft.length < 3) { message('Add at least three corners to make a room.', true); return; }
  const points = draft.map(p => ({x:p.x, y:room.floor.center.y, z:p.z}));
  if (commit(() => { reshapeFloor(room, points, () => null); selected = null; })) { message('Room outline updated. Openings were cleared; add doors and windows again.'); setTool('select'); fit(); }
}

// ---------------------------------------------------------------- panels & inspector
$('catalog').onclick = e => { const type = e.target.closest('[data-type]')?.dataset.type; if (type) setTool(pendingType === type ? 'select' : 'place', pendingType === type ? null : type); };
$('categories').onclick = e => { const c = e.target.closest('[data-category]')?.dataset.category; if (c) { category = c; renderCatalog(); } };
$('search').oninput = renderCatalog;
$('objects').onclick = e => { const id = e.target.closest('[data-id]')?.dataset.id; if (id) { selected = id; render(); } };
function removeSelected() {
  if (!selected) return;
  const kind = kindOf(selected), i = selected.includes(':') ? indexOf(selected) : -1;
  commit(() => {
    if (kind === 'wall') {
      if (perimeterEdge(room, room.walls[i]) >= 0) throw new Error('Outline walls cannot be removed. Remove or move a corner instead.');
      room.walls.splice(i, 1); room.openings = room.openings.filter(o => o.wall !== i).map(o => ({...o, wall:o.wall > i ? o.wall - 1 : o.wall}));
    } else if (kind === 'corner') removeCorner(room, i);
    else if (kind === 'opening') room.openings.splice(i, 1);
    else room.furniture = room.furniture.filter(f => f.id !== selected);
    selected = null;
  });
}
$('properties').addEventListener('change', e => {
  if (e.target.id === 'room-name') { commit(() => { room.name = e.target.value.trim() || 'Untitled room'; }); return; }
  if (e.target.id === 'level-name-edit') { const name = e.target.value.trim().slice(0, 40) || (level ? 'Floor' : 'Ground floor'); editLevel(h => { if (level) h.levels[level - 1].name = name; else h.levelName = name; }); return; }
  if (e.target.id === 'level-separate') { const sep = e.target.checked; editLevel(h => { h.levels[level - 1].separate = sep; if (sep) h.levels[level - 1].elevation = 0; }); draw3d(true); return; }
  if (e.target.dataset.property === 'levelElevation') {
    if (!e.target.checkValidity()) { message('Enter a value within the displayed limits.', true); renderProperties(); return; }
    const v = Number(e.target.value); editLevel(h => { h.levels[level - 1].elevation = v; }); draw3d(); return;
  }
  if (e.target.id === 'item-label') { commit(() => { const f = selectedItem(); const label = e.target.value.trim(); if (label) f.label = label.slice(0, 60); else delete f.label; }); return; }
  const prop = e.target.dataset.property; if (!prop) return;
  if (!e.target.checkValidity()) { message('Enter a value within the displayed limits.', true); renderProperties(); return; }
  const v = Number(e.target.value), kind = kindOf(selected);
  commit(() => {
    if (prop === 'roomHeight') { setRoomHeight(room, v); return; }
    if (kind === 'item') {
      const f = selectedItem(), def = itemDef(f.type);
      if (prop === 'x' || prop === 'z') f.position[prop] = v;
      else if (prop === 'y') f.position.y = room.floor.center.y + v;
      else if (prop === 'rotation') f.rotation = {x:0, y:v / DEG, z:0};
      else if (prop === 'color') f.color = e.target.value;
      else f.scale[{width:'x', depth:'z', height:'y'}[prop]] = v / def[{width:'w', depth:'d', height:'h'}[prop]];
      f.timestamp = Date.now();
    } else if (kind === 'wall') {
      const i = indexOf(selected), w = room.walls[i], edge = perimeterEdge(room, w);
      if (prop === 'wallLength') {
        if (edge >= 0) setEdgeLength(room, edge, v);
        else { const len = wallLength(w), k = v / len; w.endPoint = {...w.endPoint, x:w.startPoint.x + (w.endPoint.x - w.startPoint.x) * k, z:w.startPoint.z + (w.endPoint.z - w.startPoint.z) * k}; }
        if (edge >= 0) selected = `wall:${room.walls.findIndex(x => perimeterEdge(room, x) === edge)}`;
      } else if (prop === 'wallHeight') w.height = v;
      else if (prop === 'thickness') w.thickness = v;
      else w[prop.startsWith('start') ? 'startPoint' : 'endPoint'][prop.endsWith('X') ? 'x' : 'z'] = v;
    } else if (kind === 'corner') {
      const i = indexOf(selected), p = room.floor.vertices[i];
      moveCorner(room, i, prop === 'cornerX' ? v : p.x, prop === 'cornerZ' ? v : p.z);
    } else if (kind === 'opening') {
      const o = room.openings[indexOf(selected)];
      if (prop === 'openingWidth') o.width = v; else if (prop === 'openingHeight') o.height = v; else if (prop === 'sill') o.sill = v; else o.offset = v / 100;
    }
  });
});
$('properties').addEventListener('click', async e => {
  const id = e.target.id, swatch = e.target.dataset.swatch;
  if (swatch) { commit(() => { const f = selectedItem(); f.color = swatch; f.timestamp = Date.now(); }); return; }
  if (id === 'delete') removeSelected();
  if (id === 'rotate90') commit(() => { const f = selectedItem(); f.rotation = {x:0, y:(f.rotation.y + Math.PI / 2) % (Math.PI * 2), z:0}; f.timestamp = Date.now(); });
  if (id === 'duplicate') duplicate();
  if (id === 'delete-level' && level > 0) {
    const name = levelInfo(house, level).name;
    if (confirm(`Delete ${name} and everything on it? You can undo this.`)) { editLevel(h => removeLevel(h, level), level - 1); draw3d(true); message(`${name} deleted. Use undo to bring it back.`); }
  }
  if (id === 'fit-stairs') commit(() => { const f = selectedItem(); if (!fitStairs(house, level, f)) throw new Error('There is no floor above to connect to.'); f.timestamp = Date.now(); });
  if (id === 'add-corner') { const edge = perimeterEdge(room, room.walls[indexOf(selected)]); if (edge >= 0 && commit(() => { insertCorner(room, edge, .5); selected = `corner:${edge + 1}`; })) message('Corner added. Drag it to reshape the room.'); }
  if (id === 'copy-code') { try { await navigator.clipboard.writeText(formatCode(room.roomId)); message('Room code copied. Anyone you share it with can edit the room.'); } catch { message('Clipboard unavailable. Select and copy the code from the details panel.', true); } }
  if (id === 'load-mesh') {
    const generation = ++meshGeneration, roomId = room.roomId; e.target.disabled = true; message('Loading the uploaded scan…');
    try {
      const text = await (await cloud.scanBlob(room)).text();
      if (generation !== meshGeneration || room.roomId !== roomId) return;
      await mode3d(); if (view3d) { view3d.setMesh(text); message('The raw phone scan is shown as a green wireframe over your editable room.'); }
    } catch (err) { message(cloud.friendly(err), true); } finally { renderProperties(); }
  }
});
function duplicate() {
  const source = selectedItem(); if (!source) return;
  commit(() => { const f = clone(source); f.id = crypto.randomUUID(); f.position.x += .3; f.position.z += .3; f.timestamp = Date.now(); delete f.source; room.furniture.push(f); selected = f.id; });
}

// ---------------------------------------------------------------- views
function mode2d() {
  mode = '2d'; $('three').hidden = true; $('plan').hidden = false; renderLevels();
  $('view-2d').classList.add('active'); $('view-3d').classList.remove('active'); $('view-2d').setAttribute('aria-pressed', 'true'); $('view-3d').setAttribute('aria-pressed', 'false');
  renderPlanView();
}
async function mode3d() {
  try {
    if (!view3d) {
      const {View3D} = await import('./view3d.js');
      view3d = new View3D($('three'), {
        onSelect:id => {
          // Clicking furniture on another floor switches to that floor.
          const owner = id && !id.includes(':') ? Array.from({length:levelCount(house)}, (_, i) => i).find(i => levelView(house, i).furniture.some(f => f.id === id)) : level;
          if (owner !== undefined && owner !== level) enterLevel(owner, false);
          selected = id; render();
        },
        onMove:(id, x, z) => commit(() => { const f = room.furniture.find(i => i.id === id); f.position.x = snapped(x); f.position.z = snapped(z); if (itemDef(f.type).mount === 'wall') snapToWall(f, {x, z}); f.timestamp = Date.now(); }),
      });
    }
    setTool('select'); mode = '3d'; $('three').hidden = false; $('plan').hidden = true; renderLevels();
    $('view-3d').classList.add('active'); $('view-2d').classList.remove('active'); $('view-3d').setAttribute('aria-pressed', 'true'); $('view-2d').setAttribute('aria-pressed', 'false');
    view3d.resize(); draw3d(true);
    $('tool-hint').textContent = 'Drag to orbit · Right-drag to pan · Select a piece, then drag it to move';
  } catch { mode2d(); message('3D is unavailable on this device. You can continue designing in the 2D plan.', true); }
}
$('three').addEventListener('viewerror', () => { mode2d(); message('The graphics context was lost. Your draft is safe; reload to restore 3D.', true); });
$('view-2d').onclick = mode2d; $('view-3d').onclick = mode3d;
$('fit').onclick = fit;
$('zoom-in').onclick = () => { zoom = Math.min(6, zoom * 1.2); renderPlanView(); };
$('zoom-out').onclick = () => { zoom = Math.max(.3, zoom / 1.2); renderPlanView(); };
function undo() { house = history.undo(); enterLevel(level, false); dirty = true; selected = null; persist(); render(); scheduleAutosync(); }
function redo() { house = history.redo(); enterLevel(level, false); dirty = true; selected = null; persist(); render(); scheduleAutosync(); }
$('undo').onclick = undo; $('redo').onclick = redo;
$('select-tool').onclick = () => setTool('select');
for (const name of ['wall', 'door', 'window']) $(`${name}-tool`).onclick = () => setTool(name);
$('draw-room-tool').onclick = () => { setTool('draw'); message('Click the corners of your room on the plan. Click the first corner again to finish.'); };
function tabs(build) { $('build-panel').hidden = !build; $('furniture-panel').hidden = build; $('tab-build').setAttribute('aria-selected', String(build)); $('tab-furniture').setAttribute('aria-selected', String(!build)); }
$('tab-build').onclick = () => tabs(true); $('tab-furniture').onclick = () => tabs(false);
for (const dialog of document.querySelectorAll('dialog')) dialog.querySelector('.close').onclick = () => dialog.close();
$('open-room').onclick = () => { $('connect-error').textContent = ''; $('connect-dialog').showModal(); };
$('help').onclick = $('sync-info').onclick = () => $('guide-dialog').showModal();
function renderShapes() {
  const icons = {rectangle:'M4 4h32v24H4z', lshape:'M4 4h32v12H22v12H4z', ushape:'M4 4h10v12h12V4h10v24H4z', tshape:'M4 4h32v11H26v13H14V15H4z'};
  $('shape-picker').innerHTML = shapes.map(s => `<button type="button" role="radio" aria-checked="${s === newShape}" class="${s === newShape ? 'active' : ''}" data-shape="${s}"><svg viewBox="0 0 40 32" aria-hidden="true"><path d="${icons[s]}"/></svg>${{rectangle:'Rectangle', lshape:'L-shape', ushape:'U-shape', tshape:'T-shape'}[s]}</button>`).join('');
}
$('shape-picker').onclick = e => { const s = e.target.closest('[data-shape]')?.dataset.shape; if (s) { newShape = s; renderShapes(); } };
$('new-room').onclick = () => { renderShapes(); $('new-dialog').showModal(); };

// ---------------------------------------------------------------- floors & plans
function renderLevels() {
  const n = levelCount(house);
  $('levels').innerHTML = Array.from({length:n}, (_, i) => {
    const info = levelInfo(house, i);
    return `<button class="level ${i === level ? 'active' : ''}" data-level="${i}" title="${info.separate ? 'Separate plan' : `Floor at +${info.elevation.toFixed(2)} m`}">${info.separate ? '▭' : '▤'} ${esc(info.name)}${info.separate ? ' <small>separate</small>' : ''}</button>`;
  }).join('') + '<button class="level add" id="add-level">＋ Floor or plan</button>'
    + (mode === '3d' && n > 1 ? `<span class="separator"></span><button class="level ${all3d ? 'active' : ''}" id="toggle-all3d" aria-pressed="${all3d}">${all3d ? '◇ All floors' : '◇ This floor only'}</button>` : '');
}
$('levels').onclick = e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'add-level') {
    if (levelCount(house) >= 12) { message('A project can have up to 12 floors and plans.', true); return; }
    $('level-name').value = `Floor ${levelCount(house)}`; $('level-dialog').showModal(); return;
  }
  if (t.id === 'toggle-all3d') { all3d = !all3d; render(); draw3d(true); return; }
  if (t.dataset.level !== undefined) { setTool('select'); enterLevel(Number(t.dataset.level)); draw3d(true); message(`Editing ${levelInfo(house, level).name}.`); }
};
$('level-form').onsubmit = e => {
  e.preventDefault();
  const separate = $('level-form').querySelector('input[name=level-kind]:checked').value === 'separate';
  const next = clone(house);
  try {
    const index = addLevel(next, {name:$('level-name').value.trim(), separate, copyFrom:$('level-copy').checked ? level : null});
    if (houseChanged(next, index)) {
      $('level-dialog').close(); selected = null; fit(); render(); draw3d(true);
      message(separate ? 'Separate plan added. It appears beside the building in 3D.' : 'Floor added on top. Place a staircase on the floor below to connect them.');
    }
  } catch (err) { message(err.message, true); }
};
$('level-form').addEventListener('change', e => {
  if (e.target.name !== 'level-kind') return;
  const separate = e.target.value === 'separate';
  if (/^(Floor \d+|Plan \d+)$/.test($('level-name').value)) $('level-name').value = `${separate ? 'Plan' : 'Floor'} ${levelCount(house)}`;
});
function editLevel(edit, nextLevel = level) { const next = clone(house); try { edit(next); } catch (err) { message(err.message, true); return; } houseChanged(next, nextLevel); }

// ---------------------------------------------------------------- cloud sync
function listen() {
  unsubscribe?.(); unsubscribe = null; unsubscribeDevices?.(); unsubscribeDevices = null; devices = [];
  if (!linked || !cloud.configured) return;
  const id = room.roomId;
  unsubscribe = cloud.watchRoom(id, incoming => {
    if (room.roomId !== id) return;
    if (incoming.revision === base.revision && incoming.timestamp === base.timestamp) return;
    if (saving) { remote = incoming; return; }
    applyRemote(incoming);
  }, e => message(cloud.friendly(e), true));
  unsubscribeDevices = cloud.watchDevices(id, list => { if (room.roomId === id) { devices = list; renderPhones(); } });
}
function applyRemote(incoming) {
  remote = null;
  if (dirty) {
    // Rebase local edits on top of the phone's changes instead of blocking.
    house = validateRoom(mergeRooms(base, house, incoming)); house.revision = incoming.revision; house.timestamp = incoming.timestamp;
    base = clone(incoming); dirty = hasChanges(house, base);
    message('Changes from another device were merged into your design.');
  } else { house = incoming; base = clone(incoming); history.reset(house); message('Updated from another device.'); }
  enterLevel(level, false);
  if (selected && kindOf(selected) === 'item' && !selectedItem()) selected = null;
  persist(); render();
}
function replaceRoom(next, isLinked) {
  workspaceGeneration++; persist(); unsubscribe?.(); unsubscribe = null; unsubscribeDevices?.(); unsubscribeDevices = null; devices = [];
  house = next; level = 0; room = levelView(house, 0); base = clone(next); linked = isLinked; dirty = false; remote = null; selected = null; tool = 'select'; pendingType = null; wallStart = null; draft = [];
  meshGeneration++; view3d?.clearMesh(); history.reset(house); fit(); persist(); render(); renderCatalog(); listen();
}
$('new-form').onsubmit = e => {
  e.preventDefault(); if (saving || loading) return;
  try { replaceRoom(createRoom($('new-name').value, Number($('new-width').value), Number($('new-depth').value), newShape, Number($('new-height').value)), false); $('new-dialog').close(); message('Your new room is ready. Drag corners to adjust it, then publish to get a room code.'); }
  catch (err) { message(err.message, true); }
};
$('connect-form').onsubmit = async e => {
  e.preventDefault(); if (loading || saving) return;
  loading = true; const generation = workspaceGeneration, submit = e.submitter; if (submit) submit.disabled = true; $('connect-error').textContent = ''; render();
  try {
    const next = await cloud.loadRoom(code($('room-code').value));
    if (generation !== workspaceGeneration) return;
    replaceRoom(next, true); $('connect-dialog').close();
    message(next.source === 'scan' ? 'Scanned room connected. Adjust walls if needed, furnish it, and save — the phone updates live.' : 'Room connected. Save to send your changes to the phone.');
  } catch (err) { $('connect-error').textContent = cloud.friendly(err); }
  finally { loading = false; if (submit) submit.disabled = false; render(); }
};
async function save() {
  clearTimeout(autosyncTimer);
  if (saving || loading) return;
  if (!cloud.configured) { message('Firebase is not configured yet. Your draft is local; use Build → Export room JSON for a backup. See the README to enable cloud sync.', true); return; }
  if (room.roomId === 'DEMO') { message('Create a new room under Build (or enter a room code) before publishing. The demo is a practice space.', true); return; }
  if (linked && !dirty) { message('Everything is already saved.'); return; }
  saving = true; render();
  const submitted = clone(house), baseline = clone(base);
  try {
    const result = await cloud.saveRoom(submitted, baseline, !linked);
    if (room.roomId === submitted.roomId) {
      const localSinceSubmit = hasChanges(house, submitted);
      house = localSinceSubmit ? validateRoom(mergeRooms(submitted, house, result.room)) : result.room;
      house.revision = result.room.revision; house.timestamp = result.room.timestamp;
      enterLevel(level, false);
      base = clone(result.room); dirty = localSinceSubmit; linked = true; persist();
      if (!unsubscribe) listen();
      message(result.merged ? 'Saved. Edits made on the phone at the same time were merged.' : dirty ? 'Snapshot saved. Newer edits still need saving.' : `Saved. Phones viewing ${formatCode(room.roomId)} update automatically.`);
    } else if (result.room.roomId !== submitted.roomId) message(`Published as ${formatCode(result.room.roomId)}.`);
  } catch (err) { message(cloud.friendly(err), true); }
  finally {
    saving = false;
    if (remote) applyRemote(remote); else render();
    if (dirty) scheduleAutosync();
  }
}
$('save').onclick = save;
function scheduleAutosync() {
  clearTimeout(autosyncTimer);
  if (linked && $('autosync').checked && cloud.configured) autosyncTimer = setTimeout(save, 1200);
}
$('autosync').onchange = () => { try { localStorage.setItem('realtweak:autosync', $('autosync').checked ? '1' : '0'); } catch { /* Preference only. */ } if ($('autosync').checked && dirty) scheduleAutosync(); };
$('reload-remote').onclick = () => { if (remote) applyRemote(remote); };
function download(content, name, type) { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([content], {type})); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('export').onclick = () => download(JSON.stringify(house, null, 2), `realtweak-${room.roomId}.json`, 'application/json');
$('import').onclick = () => $('file').click();
$('file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Room JSON must be smaller than 2 MB. Meshes belong in Firebase Storage.');
    const imported = validateRoom(JSON.parse(await file.text()), 'IMPORT0');
    const fresh = createRoom(); imported.roomId = fresh.roomId; imported.revision = 0; imported.timestamp = 0; delete imported.meshUrl; delete imported.meshPath;
    replaceRoom(validateRoom(imported), false); message('Imported as a new local room. Publish to generate a separate shared room.');
  } catch (err) { message(`Import failed: ${err.message}`, true); } finally { e.target.value = ''; }
};
$('export-image').onclick = () => {
  if (mode === '3d' && view3d) { const a = document.createElement('a'); a.href = view3d.png(); a.download = `realtweak-${room.roomId}.png`; a.click(); return; }
  const copy = $('plan').cloneNode(true), b = bounds(); copy.setAttribute('width', '1600'); copy.setAttribute('height', String(Math.round(1600 * b.height / b.width)));
  download(new XMLSerializer().serializeToString(copy), `realtweak-${room.roomId}.svg`, 'image/svg+xml');
};
$('print').onclick = () => { mode2d(); window.print(); };

window.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && key === 'y') { e.preventDefault(); redo(); return; }
  if (mod && key === 's') { e.preventDefault(); save(); return; }
  if (mod && key === 'd') { e.preventDefault(); duplicate(); return; }
  if (e.key === 'Enter' && tool === 'draw') { finishDraw(); return; }
  if (e.key === 'Escape') { endDrag(true); selected = null; setTool('select'); render(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
  const f = selectedItem(); if (!f) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'r', 'R'].includes(e.key)) {
    e.preventDefault();
    commit(() => {
      const step = e.shiftKey ? .01 : .1;
      if (e.key === 'ArrowLeft') f.position.x -= step; if (e.key === 'ArrowRight') f.position.x += step;
      if (e.key === 'ArrowUp') f.position.z -= step; if (e.key === 'ArrowDown') f.position.z += step;
      if (key === 'r') f.rotation = {x:0, y:(f.rotation.y + (e.shiftKey ? -1 : 1) * Math.PI / 12) % (Math.PI * 2), z:0};
      f.timestamp = Date.now();
    });
  }
});
window.addEventListener('beforeunload', e => { if (dirty && linked) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('offline', () => { message('You are offline. Keep editing; your draft is saved on this device.'); render(); });
window.addEventListener('online', () => { message('Back online. Save when you are ready to send your edits.'); if (linked) listen(); render(); });
window.addEventListener('storage', e => { if (e.key === `realtweak:draft:${room.roomId}` && e.newValue) message('This draft was edited in another browser tab. Export this tab’s version before closing to keep both copies.', true); });

fit(); renderCatalog(); render();
if (linked && cloud.configured) {
  const generation = workspaceGeneration;
  cloud.loadRoom(room.roomId).then(incoming => {
    if (generation !== workspaceGeneration) return;
    if (incoming.revision !== base.revision || incoming.timestamp !== base.timestamp) applyRemote(incoming);
    listen();
  }).catch(e => { if (generation === workspaceGeneration) message(cloud.friendly(e), true); });
}
