# RealTweak

Scan a room on any AR phone, redesign it in the browser in 2D/3D, and see the result back in the real room — live.

| Part | Folder | Stack |
|---|---|---|
| **RealTweak Studio** (website) | [`RealTweak_Website`](RealTweak_Website) | Vite, Three.js, Firebase JS SDK |
| **RealTweak AR** (mobile app) | [`RealTweak_AR`](RealTweak_AR) | Unity 6000.0.32f1, AR Foundation 6.2 (ARCore + ARKit), URP, Firebase Unity SDK 12.10 |
| Shared contract | [`RealTweak_Website/UNITY_CONTRACT.md`](RealTweak_Website/UNITY_CONTRACT.md) | Firestore `rooms/{code}` schema 2 |

## How it fits together

```
 Phone (Unity)                         Firebase                          Browser (Studio)
 ─────────────                         ────────                          ────────────────
 Scan room ──► SmartScan reconstruct   rooms/{ABCD2345}  ◄── live ──►    2D plan + 3D view
 Review/adjust outline ──► Save ─────► (walls, doors,                    drag corners, add furniture,
 Live room ◄── listener ◄──────────────  furniture…)     ◄── Save ──     stairs, kitchens…
 Move/add/delete in AR ──► Save ─────►  devices/{uid}   ──► "showing your latest save"
                                       meshes/{code}.obj ──► "Show scan mesh"
```

* **One code per house project.** A project holds several floors (stacked, connected by stairs — shown in 3D with a glowing route between floors) and separate plans (garage, annex). The phone shows the floor you're on and can scan a new floor into the same code.
* **Room codes** are 8 characters without look-alikes, shown as `ABCD-EFGH` (31⁸ ≈ 8.5·10¹¹ codes). Anyone with the code can view and edit the room; rooms can't be listed.
* **Both sides can edit at the same time.** Saves run in a Firestore transaction and merge per furniture item (and the outline as one unit) instead of failing or overwriting.
* **Reopening works.** The app remembers the last room; unsaved phone edits are kept on the device and merged on the next open. The browser keeps local drafts too.
* **One furniture catalog.** `RealTweak_Website/catalog/items.mjs` defines 82 parametric models (living, dining, bedroom, kitchen, bathroom, office, kids, electronics, lighting, decor, staircases — straight, L-shaped, spiral — columns, radiators…). `npm run catalog` writes it to the website and to the Unity `Resources`, so both apps build identical geometry.

## SmartScan — RoomPlan-style capture without LiDAR

Apple's RoomPlan needs LiDAR. RealTweak's scanner works on **any ARCore/ARKit phone** and gets better when hardware allows:

| Device | Samples used |
|---|---|
| Any ARCore/ARKit phone | feature points, wall/floor/table planes |
| ARCore phones with Depth API (most Android phones since 2020, no depth sensor needed) | dense depth-from-motion hits (`TrackableType.Depth`) |
| LiDAR iPhone/iPad | LiDAR scene mesh + ARKit plane classes (table, seat, door…) |

Samples go into a 5 cm floor grid with per-cell height bands. The reconstructor (pure C#, [`RoomReconstructor.cs`](RealTweak_AR/Assets/RealTweak/Scripts/Core/RoomReconstructor.cs)) then:

1. finds the dominant wall orientation by maximizing histogram sharpness (so the plan comes out square),
2. extracts wall lines as supported histogram peaks,
3. splits the floor into rectangles along those lines and flood-fills the room from the path you walked, never crossing a well-scanned wall (doorways don't leak into the next room); wardrobe-sized pockets are filled,
4. traces a clean rectilinear outline, estimates ceiling height, finds **doors** (gap at every height + seeing through) and **windows** (wall below the sill, no depth in the glass band),
5. segments remaining blobs into furniture and classifies them by size and shape (bed, sofa, table, desk, wardrobe, bookcase, fridge, cabinet, chair, armchair, coffee table, nightstand, plant, or a generic "Scanned object").

A **corner mode** (tap each floor corner; edges are squared and snapped onto detected walls) handles bare walls that give few samples. After scanning, the **review screen** lets the user drag corners, set wall lengths and ceiling height, square up, add/remove doors and windows, and delete wrong detections — before the room is uploaded. The same editing is available later from the live room and on the website.

**Placing a saved room in a new session** (no cloud anchors needed): *Smart align* re-scans 2–3 walls and registers the saved outline against them (corner-pair search over 90° rotations + ICP, with a "Rotate 180°" for symmetric rooms); *Tap 2 corners*; or *Place by hand* (drag + twist). The result is pinned with an AR anchor.

## Quick start

**Website** (Node 22+): see [RealTweak_Website/README.md](RealTweak_Website/README.md).

```bash
cd RealTweak_Website && npm ci && npm run dev
```

**AR app**: open `RealTweak_AR` in Unity 6000.0.32f1 → menu **RealTweak ▸ Build App Scene** (already done; re-run after changing the builder) → **RealTweak ▸ Build Android APK**, or File ▸ Build Profiles for iOS. Details in [RealTweak_AR/README.md](RealTweak_AR/README.md).

## Tests

| Command | What it covers |
|---|---|
| `npm test` (website) | 49 tests: model, room-shape editing, merge, catalog, plan symbols, DOM editor flows, 3D scene builder |
| `npm run test:rules` (website, needs Java) | 14 Firestore emulator tests: rules, codes, floors, merge-on-save, listener delivery, device presence |
| `dotnet run` in `RealTweak_AR/CoreTests~` | 556 checks: floors, codes, codec, merge, room ops, SmartScan on 30 randomized synthetic rooms (outline ≤ 8 cm, door/window/furniture detection), alignment |

Synthetic scans are not a substitute for testing on phones. See [TESTING.md](RealTweak_Website/TESTING.md) for the device checklist.
