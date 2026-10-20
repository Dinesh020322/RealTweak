// Builds Three.js furniture from the shared catalog parts (same parts the Unity app uses).
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {itemDef} from './model.js';

const DEG = Math.PI / 180;
const geometries = new Map(), materials = new Map();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(.5, 20, 14);

function cylinder(t) {
  const key = `cyl:${t}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.CylinderGeometry(.5 * t, .5, 1, 28));
  return geometries.get(key);
}
function rounded(w, h, d) {
  const key = `rb:${w}:${h}:${d}`;
  if (!geometries.has(key)) geometries.set(key, new RoundedBoxGeometry(w, h, d, 3, Math.min(.035, Math.min(w, h, d) / 3)));
  return geometries.get(key);
}
export function material(color, kind = '') {
  const key = `${color}|${kind}`;
  if (materials.has(key)) return materials.get(key);
  const params = {color, roughness:.7, metalness:0};
  if (kind === 'wood') params.roughness = .62;
  if (kind === 'fabric') params.roughness = .95;
  if (kind === 'metal') Object.assign(params, {metalness:.55, roughness:.35});
  if (kind === 'gloss') params.roughness = .22;
  if (kind === 'ceramic') params.roughness = .28;
  if (kind === 'glass') Object.assign(params, {transparent:true, opacity:.35, roughness:.05, metalness:.1, depthWrite:false});
  if (kind === 'light') Object.assign(params, {emissive:new THREE.Color(color), emissiveIntensity:.55});
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.shared = true;
  materials.set(key, m);
  return m;
}

/** A Group whose origin is the item's bottom-centre, in item units (before item scale). */
export function buildModel(type, color, id) {
  const def = itemDef(type), group = new THREE.Group();
  group.name = def.name;
  const parts = def.parts.length ? def.parts : [{s:'box', x:0, y:def.h / 2, z:0, w:def.w, h:def.h, d:def.d, c:'main', m:''}];
  for (const p of parts) {
    let geometry, scaled = true;
    if (p.s === 'box' && p.m === 'fabric') { geometry = rounded(p.w, p.h, p.d); scaled = false; }
    else if (p.s === 'box') geometry = unitBox;
    else if (p.s === 'cyl') geometry = cylinder(p.t > 0 ? p.t : 1);
    else geometry = unitSphere;
    const mesh = new THREE.Mesh(geometry, material(p.c === 'main' ? color : p.c, p.m));
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.set((p.rx ?? 0) * DEG, (p.ry ?? 0) * DEG, (p.rz ?? 0) * DEG, 'XYZ');
    if (scaled) mesh.scale.set(p.w, p.h, p.d);
    mesh.castShadow = p.m !== 'glass' && p.m !== 'light';
    mesh.receiveShadow = true;
    mesh.userData.itemId = id;
    group.add(mesh);
  }
  return group;
}
