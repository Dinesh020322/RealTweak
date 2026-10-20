import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {inside,openingSize,wallLength,perimeterEdge,itemSize,itemDef,footprint,levelView,levelInfo,levelCount,levelAbove,levelBelow,stackedLevels,stairPath} from './model.js';
import {buildModel,material} from './models3d.js';
import {createWindowModel} from './windowModel.js';

function woodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const tones = ['#d8c3a0', '#cfb893', '#dcc8a7', '#d3bd98', '#c9b28b'];
  for (let row = 0; row < 8; row++) {
    let x = -(row % 3) * 90;
    while (x < 512) {
      const len = 160 + ((row * 37 + x) % 5) * 30;
      g.fillStyle = tones[(row + Math.abs(x)) % tones.length]; g.fillRect(x, row * 64, len, 64);
      g.strokeStyle = 'rgba(90,70,40,.18)'; g.lineWidth = 2; g.strokeRect(x, row * 64, len, 64);
      for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(120,90,50,.06)'; g.beginPath(); g.moveTo(x, row * 64 + 10 + k * 13); g.lineTo(x + len, row * 64 + 14 + k * 12); g.stroke(); }
      x += len;
    }
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1 / 1.6, 1 / 1.6); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export class View3D {
  constructor(host, {onSelect, onMove} = {}) {
    this.host = host; this.onSelect = onSelect; this.onMove = onMove;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#eceae3');
    this.renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    host.append(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 1, .02, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .12; this.controls.maxPolarAngle = Math.PI * .495; this.controls.minDistance = .5; this.controls.maxDistance = 80;
    this.controls.addEventListener('change', () => this.requestRender());
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8a7e, 1.6));
    this.sun = new THREE.DirectionalLight(0xfff4e5, 2.2);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = .02;
    this.scene.add(this.sun, this.sun.target);
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(200, 48), new THREE.MeshStandardMaterial({color:'#e3e1d9', roughness:1}));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -.02; this.ground.receiveShadow = true; this.scene.add(this.ground);
    this.floorTexture = woodTexture();
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.walls = [];
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.raycaster = new THREE.Raycaster();
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', e => this.pointerDown(e));
    canvas.addEventListener('pointermove', e => this.pointerMove(e));
    canvas.addEventListener('pointerup', e => this.pointerUp(e));
    canvas.addEventListener('pointercancel', () => { if (this.drag) { this.drag.object.position.copy(this.drag.start); this.drag = null; this.controls.enabled = true; this.requestRender(); } });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); host.dispatchEvent(new CustomEvent('viewerror')); });
    this.loop = () => { this.frame = null; if (this.controls.update()) this.requestRender(); this.render(); };
  }
  ndc(e) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
  pick(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    return this.raycaster.intersectObjects(this.group.children, true).find(h => h.object.userData.itemId && h.object.visible && !h.object.userData.faded && !h.object.userData.route);
  }
  pointerDown(e) {
    this.down = {x:e.clientX, y:e.clientY};
    const hit = this.pick(e), id = hit?.object.userData.itemId;
    if (!id || id.includes(':') || id !== this.selected) return;
    const object = this.items.get(id), world = object.getWorldPosition(new THREE.Vector3());
    this.drag = {id, object, start:object.position.clone(), plane:new THREE.Plane(new THREE.Vector3(0, 1, 0), -world.y), offset:null};
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.drag.plane, point)) this.drag.offset = object.position.clone().sub(object.parent.worldToLocal(point));
    this.controls.enabled = false; this.renderer.domElement.setPointerCapture(e.pointerId);
  }
  pointerMove(e) {
    if (!this.drag?.offset) return;
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.drag.plane, point)) return;
    const local = this.drag.object.parent.worldToLocal(point).add(this.drag.offset);
    this.drag.object.position.set(local.x, this.drag.start.y, local.z); this.drag.moved = true;
    this.updateSelectionBox(); this.requestRender();
  }
  pointerUp(e) {
    const drag = this.drag; this.drag = null; this.controls.enabled = true;
    if (drag?.moved) { this.onMove?.(drag.id, drag.object.position.x, drag.object.position.z); return; }
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
    this.onSelect?.(this.pick(e)?.object.userData.itemId ?? null);
  }
  clear(group) {
    group.traverse(o => {
      if (o.geometry && !o.geometry.userData?.shared && o.userData.ownGeometry) o.geometry.dispose();
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!m.userData.shared) m.dispose();
    });
    group.clear();
  }
  wallBox(parent, w, h, d, x, y, z, mat, id) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.userData.ownGeometry = true; mesh.userData.itemId = id;
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  /** Single floor (the one being edited). */
  update(room, selected, fit = false) {
    this.room = room; this.selected = selected; this.house = null;
    this.clear(this.group); this.walls = []; this.items = new Map();
    this.buildLevel(this.group, room, selected, {x:0, y:0, z:0});
    this.finish(room.floor.vertices.map(p => ({x:p.x, z:p.z})), room.floor.center.y, fit);
  }
  /**
   * Whole project: connected floors stacked at their elevations with floor slabs (open above stairs)
   * and a glowing route up each staircase; separate plans side by side. Floors above `active` are ghosted.
   */
  updateHouse(house, active, selected, fit = false) {
    this.house = house; this.selected = selected;
    this.clear(this.group); this.walls = []; this.items = new Map();
    const order = stackedLevels(house), all = [];
    const bounds = i => { const v = levelView(house, i).floor.vertices; return {minX:Math.min(...v.map(p => p.x)), maxX:Math.max(...v.map(p => p.x))}; };
    const offsets = new Map(order.map(i => [i, {x:0, y:levelInfo(house, i).elevation, z:0}]));
    let cursor = Math.max(...order.map(i => bounds(i).maxX)) + 3;
    for (let i = 0; i < levelCount(house); i++) {
      if (!levelInfo(house, i).separate) continue;
      const b = bounds(i); offsets.set(i, {x:cursor - b.minX, y:0, z:0}); cursor += b.maxX - b.minX + 3;
    }
    const activeInfo = levelInfo(house, active), y0 = house.floor.center.y;
    for (let i = 0; i < levelCount(house); i++) {
      const room = levelView(house, i), off = offsets.get(i), info = levelInfo(house, i);
      const ghost = !info.separate && !activeInfo.separate && i !== active && info.elevation > activeInfo.elevation;
      const g = new THREE.Group(); g.name = info.name; g.position.set(off.x, off.y, off.z); this.group.add(g);
      // Openings in this floor's slab where stairs arrive from the floor below.
      const below = levelBelow(house, i), holes = below >= 0 ? levelView(house, below).furniture.filter(f => stairPath(f.type).length).map(footprint) : [];
      this.buildLevel(g, room, i === active ? selected : null, off, {slab:info.elevation > 0 && !info.separate, holes, ghost});
      this.label(g, info.name, room);
      for (const p of room.floor.vertices) all.push({x:p.x + off.x, z:p.z + off.z});
      const above = levelAbove(house, i);
      if (above >= 0) for (const f of room.furniture) if (stairPath(f.type).length) this.route(g, f, levelInfo(house, above).elevation - info.elevation);
    }
    this.finish(all, y0, fit);
  }
  finish(points, y0, fit) {
    this.updateSelectionBox();
    const xs = points.map(p => p.x), zs = points.map(p => p.z), span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 4);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    this.sun.position.set(cx + span * .6, y0 + span * 1.4, cz + span * .9); this.sun.target.position.set(cx, y0, cz);
    Object.assign(this.sun.shadow.camera, {left:-span, right:span, top:span, bottom:-span, near:.1, far:span * 5}); this.sun.shadow.camera.updateProjectionMatrix();
    this.ground.position.set(cx, y0 - .02, cz);
    if (fit) this.fit();
    this.requestRender();
  }
  buildLevel(parent, room, selected, offset, {slab = false, holes = [], ghost = false} = {}) {
    const vertices = room.floor.vertices, shape = new THREE.Shape(), y0 = room.floor.center.y;
    vertices.forEach((p, i) => i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z)); shape.closePath();
    for (const h of holes) { const hole = new THREE.Path(); h.forEach((p, i) => i ? hole.lineTo(p.x, -p.z) : hole.moveTo(p.x, -p.z)); hole.closePath(); shape.holes.push(hole); }
    const floorMat = new THREE.MeshStandardMaterial({map:this.floorTexture, roughness:.75, side:THREE.DoubleSide, transparent:ghost, opacity:ghost ? .25 : 1, depthWrite:!ghost});
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
    floor.userData.ownGeometry = true; floor.rotation.x = -Math.PI / 2; floor.position.y = y0 + .001; floor.receiveShadow = true; parent.add(floor);
    if (slab) {
      // Floor slab between storeys, extruded downwards from the floor surface.
      const geo = new THREE.ExtrudeGeometry(shape, {depth:.22, bevelEnabled:false});
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:'#dedbd2', roughness:.9, transparent:ghost, opacity:ghost ? .2 : 1, depthWrite:!ghost, side:THREE.DoubleSide}));
      mesh.userData.ownGeometry = true; mesh.rotation.x = Math.PI / 2; mesh.scale.y = -1; mesh.position.y = y0 - .002; mesh.castShadow = !ghost; mesh.receiveShadow = true;
      parent.add(mesh);
    }
    room.walls.forEach((w, wi) => this.buildWall(room, w, wi, selected, parent, offset, ghost));
    for (const f of room.furniture) {
      const model = buildModel(f.type, f.color, f.id);
      model.position.set(f.position.x, f.position.y, f.position.z);
      model.rotation.set(f.rotation.x, f.rotation.y, f.rotation.z);
      model.scale.set(f.scale.x, f.scale.y, f.scale.z);
      if (ghost) model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .22; o.material.depthWrite = false; o.castShadow = false; o.userData.faded = true; } });
      parent.add(model); this.items.set(f.id, model);
    }
  }
  /** Glowing route along a staircase's walking path, continuing onto the floor above. */
  route(parent, item, rise) {
    const path = stairPath(item.type); if (path.length < 2) return;
    const a = item.rotation.y, c = Math.cos(a), s = Math.sin(a);
    const pts = path.map(p => { const x = p.x * item.scale.x, z = p.z * item.scale.z; return new THREE.Vector3(item.position.x + x * c + z * s, item.position.y + p.y * item.scale.y + .12, item.position.z - x * s + z * c); });
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const glow = new THREE.MeshStandardMaterial({color:'#20b48f', emissive:new THREE.Color('#20b48f'), emissiveIntensity:.9, roughness:.4});
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 12), .035, 10, false), glow);
    tube.userData.ownGeometry = true; tube.userData.route = true; parent.add(tube);
    const start = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), glow); start.userData.ownGeometry = true; start.userData.route = true; start.position.copy(pts[0]); parent.add(start);
    const end = pts.at(-1), dir = end.clone().sub(pts.at(-2)).normalize();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.1, .25, 16), glow); arrow.userData.ownGeometry = true; arrow.userData.route = true;
    arrow.position.copy(end); arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); parent.add(arrow);
    const reach = item.scale.y * itemDef(item.type).h;
    if (Math.abs(rise - reach) > .15) {
      // The stair does not reach the floor above: an amber marker shows the missing height.
      const gap = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, Math.abs(rise - reach), 8), new THREE.MeshBasicMaterial({color:'#e0913a'}));
      gap.userData.ownGeometry = true; gap.userData.route = true; gap.position.set(end.x, item.position.y + (rise + reach) / 2, end.z); parent.add(gap);
    }
  }
  label(parent, text, room) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = 'rgba(40,92,78,.92)'; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, 512, 96, 30); else g.rect(0, 0, 512, 96); g.fill();
      g.fillStyle = '#fff'; g.font = '600 46px DM Sans, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 22), 256, 50);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c), depthTest:false, transparent:true}));
    const v = room.floor.vertices;
    // In front of the floor's front edge, just above floor level, so stacked labels never overlap.
    sprite.position.set((Math.min(...v.map(p => p.x)) + Math.max(...v.map(p => p.x))) / 2, room.floor.center.y + .45, Math.max(...v.map(p => p.z)) + .7);
    sprite.scale.set(1.9, .36, 1); sprite.renderOrder = 10; sprite.userData.route = true; parent.add(sprite);
  }
  buildWall(room, w, wi, selected, parent = this.group, offset = {x:0, y:0, z:0}, ghost = false) {
    const a = w.startPoint, b = w.endPoint, len = wallLength(w);
    if (len < .01) return;
    const g = new THREE.Group(), angle = -Math.atan2(b.z - a.z, b.x - a.x);
    g.position.set((a.x + b.x) / 2, a.y, (a.z + b.z) / 2); g.rotation.y = angle;
    const wallId = `wall:${wi}`, mat = new THREE.MeshStandardMaterial({color:selected === wallId ? '#8fbcae' : '#f7f5ef', roughness:.92, transparent:true, opacity:ghost ? .15 : 1, depthWrite:!ghost});
    const box = (width, height, x, y) => this.wallBox(g, width, height, w.thickness, x, y, 0, mat, ghost ? null : wallId);
    const cuts = room.openings.map((o, index) => ({...o, index})).filter(o => o.wall === wi)
      .map(o => ({...o, ...openingSize(o, w), from:Math.max(0, o.offset * len - o.width / 2), to:Math.min(len, o.offset * len + o.width / 2)})).sort((p, q) => p.from - q.from);
    let cursor = 0;
    for (const c of [...cuts, {from:len, to:len}]) {
      if (c.from > cursor) box(c.from - cursor, w.height, (cursor + c.from) / 2 - len / 2, w.height / 2);
      if (c.type) {
        const x = (c.from + c.to) / 2 - len / 2, width = c.to - c.from, top = c.sill + c.height, id = `opening:${c.index}`;
        if (c.sill > 0) box(width, c.sill, x, c.sill / 2);
        if (w.height > top) box(width, w.height - top, x, (top + w.height) / 2);
        if (ghost) { /* ghosted floors keep openings as plain gaps */ }
        else if (c.type === 'window') {
          const model = createWindowModel({width, height:c.height, depth:w.thickness, id, selected:selected === id});
          model.position.set(x, c.sill, 0); g.add(model);
        } else g.add(this.door(width, c.height, w.thickness, x, id, selected === id));
      }
      cursor = Math.max(cursor, c.to);
    }
    if (ghost) g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.userData.faded = true; } });
    // Outward normal: perpendicular to the wall, pointing away from the room interior.
    const mid = {x:(a.x + b.x) / 2 + offset.x, z:(a.z + b.z) / 2 + offset.z}, nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    const sign = inside({x:(a.x + b.x) / 2 + nx * .2, z:(a.z + b.z) / 2 + nz * .2}, room.floor.vertices) ? -1 : 1;
    if (!ghost) this.walls.push({group:g, material:mat, mid, normal:{x:nx * sign, z:nz * sign}, perimeter:perimeterEdge(room, w) >= 0});
    parent.add(g);
  }
  door(width, height, depth, x, id, selected) {
    const g = new THREE.Group(), frame = material(selected ? '#4d988b' : '#e9e6df', 'wood'), leaf = material(selected ? '#6fb3a5' : '#c7a57d', 'wood');
    const part = (w, h, d, px, py, pz, m) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.userData.ownGeometry = true; mesh.userData.itemId = id; mesh.position.set(px, py, pz); mesh.castShadow = true; g.add(mesh); };
    const f = .06;
    part(f, height, depth + .03, -width / 2 + f / 2, height / 2, 0, frame);
    part(f, height, depth + .03, width / 2 - f / 2, height / 2, 0, frame);
    part(width, f, depth + .03, 0, height - f / 2, 0, frame);
    const leafW = width - 2 * f, open = -.35;
    const hinge = new THREE.Group(); hinge.position.set(-width / 2 + f, 0, depth / 2); hinge.rotation.y = open; g.add(hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(leafW, height - f, .04), leaf); panel.userData.ownGeometry = true; panel.userData.itemId = id;
    panel.position.set(leafW / 2, (height - f) / 2, -.02); panel.castShadow = true; hinge.add(panel);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 8), material('#8d9196', 'metal')); knob.userData.ownGeometry = true; knob.position.set(leafW - .08, 1.0, .02); hinge.add(knob);
    g.position.x = x; return g;
  }
  updateSelectionBox() {
    if (this.box) { this.scene.remove(this.box); this.box.geometry.dispose(); this.box = null; }
    const object = this.items?.get(this.selected);
    if (!object) return;
    this.box = new THREE.BoxHelper(object, 0x2c8e79); this.scene.add(this.box);
  }
  cutaway() {
    // Dollhouse view: walls between the camera and the room become see-through.
    const cam = this.camera.position;
    for (const w of this.walls) {
      const facing = (cam.x - w.mid.x) * w.normal.x + (cam.z - w.mid.z) * w.normal.z > 0 && cam.y < 25;
      const opacity = w.perimeter && facing && this.cutawayEnabled !== false ? .12 : 1;
      if (w.material.opacity !== opacity) { w.material.opacity = opacity; w.material.depthWrite = opacity === 1; w.material.needsUpdate = true; }
      w.group.traverse(o => { if (o.isMesh) { o.userData.faded = opacity < 1; o.castShadow = opacity === 1; } });
    }
  }
  fit(view = 'perspective') {
    const b = new THREE.Box3().setFromObject(this.group), center = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.z, 3), aspect = Math.max(.3, this.host.clientWidth / Math.max(1, this.host.clientHeight));
    const distance = d * 1.15 / Math.min(1, aspect) / Math.tan(this.camera.fov * Math.PI / 360) * .55;
    this.controls.target.copy(center);
    const dir = view === 'top' ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(.75, .95, 1.05);
    this.camera.position.copy(center).add(dir.normalize().multiplyScalar(distance));
    this.controls.update(); this.resize();
  }
  setMesh(text) {
    if (text.length > 25 * 1024 * 1024) throw new Error('Scan is larger than the 25 MB limit.');
    this.clearMesh();
    this.scan = new OBJLoader().parse(text);
    this.scan.traverse(o => { if (o.isMesh) { o.material?.dispose?.(); o.material = new THREE.MeshBasicMaterial({color:'#2f8f7a', wireframe:true, transparent:true, opacity:.28}); } });
    this.scene.add(this.scan); this.requestRender();
  }
  clearMesh() { if (this.scan) { this.scene.remove(this.scan); this.scan.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); this.scan = null; } this.requestRender(); }
  resize() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.requestRender(); }
  requestRender() { this.frame ??= requestAnimationFrame(this.loop); }
  render() { this.cutaway(); this.renderer.render(this.scene, this.camera); }
  png() { this.render(); return this.renderer.domElement.toDataURL('image/png'); }
  itemSize(item) { return itemSize(item); }
}
