import * as THREE from 'three';

// Window dimensions are in meters, with space reserved for the wall above.
export function windowDimensions(wallHeight) {
  const bottom = Math.min(.65, wallHeight * .25);
  const headroom = Math.min(.2, wallHeight * .15);
  return { bottom, height: Math.min(1.3, wallHeight - bottom - headroom) };
}

export function createWindowModel({ width, height, depth, id, selected = false }) {
  const group = new THREE.Group();
  group.name = 'Window';
  const rail = Math.min(.055, width / 8, height / 8);
  const frameDepth = Math.max(.065, depth + .025);
  const frameColor = selected ? '#4d988b' : '#eceee9';
  const part = (name, w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.userData.itemId = id;
    group.add(mesh);
  };
  const frame = () => new THREE.MeshStandardMaterial({ color: frameColor, roughness: .45 });
  part('Left jamb', rail, height, frameDepth, -width / 2 + rail / 2, height / 2, 0, frame());
  part('Right jamb', rail, height, frameDepth, width / 2 - rail / 2, height / 2, 0, frame());
  part('Top rail', width - 2 * rail, rail, frameDepth, 0, height - rail / 2, 0, frame());
  part('Bottom rail', width - 2 * rail, rail, frameDepth, 0, rail / 2, 0, frame());
  part('Center mullion', rail, height - 2 * rail, frameDepth, 0, height / 2, 0, frame());
  const paneWidth = (width - 3 * rail) / 2;
  for (const side of [-1, 1]) {
    part(side < 0 ? 'Left glass' : 'Right glass',
      paneWidth, height - 2 * rail, .012,
      side * (paneWidth + rail) / 2, height / 2, 0,
      new THREE.MeshStandardMaterial({
        color: '#91bfd0', transparent: true, opacity: .32,
        roughness: .12, metalness: .08, depthWrite: false,
      }));
  }
  part('Window sill', width + .08, rail, frameDepth + .12, 0, -rail / 2, 0, frame());
  return group;
}
