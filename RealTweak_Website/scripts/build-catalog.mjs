// Generates the shared furniture catalog for the website and the Unity AR app.
// Usage: npm run catalog
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../catalog/items.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = buildCatalog();
const json = JSON.stringify(catalog);
const targets = [
  resolve(root, 'src/catalog.json'),
  resolve(root, '../RealTweak_AR/Assets/RealTweak/Resources/RealTweakCatalog.json'),
];
for (const target of targets) {
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, json);
    console.log(`wrote ${target} (${catalog.items.length} items, ${catalog.items.reduce((n, i) => n + i.parts.length, 0)} parts)`);
  } catch (error) {
    // The Unity project is optional when the website is deployed on its own.
    if (target.includes('RealTweak_AR')) console.warn(`skipped Unity copy: ${error.message}`);
    else throw error;
  }
}
