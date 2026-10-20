# RealTweak Studio

Browser floor-plan editor with a shared 2D/3D room model and live Firebase sync with the RealTweak AR app.

## Run

Requires Node.js 22+.

```bash
npm ci
npm run dev
```

Release build: `npm run build`, then `npm run preview`.

`.env.local` holds the public web-app config for Firebase project `realtweak` (ignored by Git). On another machine copy
`.env.example` to `.env.local` and fill it from Firebase Project Settings → Your apps. Never put service-account keys in Vite variables.

## Features

* **Rooms**: templates (rectangle, L, U, T) with ceiling height, freehand outline drawing, or a room scanned on the phone.
  Drag round **corner handles** to reshape (snaps to right angles), double-click a wall to add a corner, type exact
  wall lengths/corner coordinates, change ceiling height, add interior walls, doors and windows (size, sill, position).
* **82 models** generated from one catalog shared with the AR app: sofas, sectionals, beds, bunk beds, wardrobes,
  kitchens (cabinets, island, sink, cooker, fridge, hood), bathrooms (toilet, basin, vanity, bath, shower), office,
  lighting (incl. pendants and ceiling fans at ceiling height), decor, electronics, and structure — straight,
  L-shaped and spiral **staircases**, railings, columns, radiators, AC units, built-in closets.
  Isometric thumbnails, top-down plan symbols and 3D models are all derived from the same parts.
* **Floors & plans in one code**: ＋ Floor or plan adds a floor stacked on the building or a separate plan (garage,
  annex). The floor below shows faintly while you draw; staircases stretch to the floor above, the upper slab gets a
  stairwell, and 3D "All floors" shows the building with a glowing route up every staircase (separate plans beside it).
* **2D plan** with wall dimensions, rotate handle, grid snap, pan/zoom; wall-mounted items snap to walls.
* **3D view** with shadows, wood floor, dollhouse cut-away walls, opening doors/windows, drag-to-move in 3D,
  and an overlay of the phone's raw scan ("Show scan mesh").
* **Cloud**: enter a room code (`ABCD-EFGH`), save (Ctrl/Cmd S) or turn on **Live sync**. Concurrent phone and browser
  edits are merged per item. The details panel lists phones viewing the room and whether they show the latest save.
* Undo/redo, local drafts per room, JSON import/export, SVG/PNG export, print.

## Catalog

Edit `catalog/items.mjs`, then:

```bash
npm run catalog
```

This rewrites `src/catalog.json` and the Unity copy (`../RealTweak_AR/Assets/RealTweak/Resources/RealTweakCatalog.json`).
Type ids are stored in rooms — never rename an existing type.

## Firebase release setup

1. Authentication → enable **Anonymous**. Add your hosting domain to authorized domains.
2. Optional: App Check (reCAPTCHA Enterprise) — set `VITE_APPCHECK_SITE_KEY`; enforce after staging verification.
3. Storage CORS for the website origin (needed for "Show scan mesh"):
   `gsutil cors set cors.json gs://<bucket>` with `[{"origin":["https://<your-site>"],"method":["GET"],"maxAgeSeconds":3600}]`.
4. Test, then deploy rules and hosting (staging first):

```bash
npm test
npm run test:rules
npm run build
npx firebase deploy --only firestore:rules,storage,hosting --project realtweak
```

The Storage rule checks Firestore for the room; accept the cross-service permission prompt on first deploy.
Rooms created by the previous prototype (4-digit codes) stay readable and editable; new rooms get 8-character codes.

### Trust model

Anyone with a room code can view and edit that room (by design). Rules deny listing/deleting rooms, validate document
shape and limits, enforce revision progression and restrict which fields change. Nested items are validated by both
clients, not exhaustively by rules — for a broad public launch add App Check enforcement, rate limiting and backups.

## Tests

```bash
npm test          # 49 unit/DOM/3D tests
npm run test:rules  # 14 Firestore emulator tests (needs Java)
```

See [TESTING.md](TESTING.md) for manual checks and [UNITY_CONTRACT.md](UNITY_CONTRACT.md) for the shared schema.
