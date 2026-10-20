# Room synchronization contract (website ⇄ AR app)

Implemented on the website in `src/model.js`, `src/repository.js`, `src/cloud.js` and in Unity in
`Assets/RealTweak/Scripts/Core/RoomCodec.cs`, `RoomOps.cs` and `Runtime/CloudService.cs`. Keep them in step.

## Storage and discovery

| Path | Contents |
|---|---|
| `rooms/{code}` | Room document (schema 2, below) |
| `rooms/{code}/devices/{uid}` | AR device presence: `{platform, model, appliedRevision, seenAt}` — written by the phone, read by the website |
| `meshes/{code}.obj` | Raw scan samples as OBJ line segments (room-local web coordinates), uploaded once by the scanning phone |

**Codes.** New rooms use 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, displayed `ABCD-EFGH`. Input is
case-insensitive and ignores spaces/dashes. Legacy codes (4–64 `[A-Za-z0-9_-]`, case-sensitive) can still be
read and edited but not created. Codes are bearer capabilities; rooms can never be listed or deleted by clients.

Both clients sign in anonymously before any access.

## Schema 2

```json
{
  "schemaVersion": 2,
  "roomId": "ABCD2345",
  "name": "Living room",
  "revision": 4,
  "timestamp": 1700000000000,
  "source": "scan",
  "scan": {"method": "depth", "platform": "Android", "confidence": 0.86, "app": "2.0.0"},
  "meshPath": "meshes/ABCD2345.obj",
  "dimensions": {"x": 5, "y": 2.6, "z": 4.5},
  "floor": {"vertices": [{"x": -2.5, "y": 0, "z": -2.25}, "…"], "center": {"x": 0, "y": 0, "z": 0}, "area": 19.5},
  "walls": [{"startPoint": {"x": -2.5, "y": 0, "z": -2.25}, "endPoint": {"x": 2.5, "y": 0, "z": -2.25}, "height": 2.6, "thickness": 0.12}],
  "openings": [{"type": "door", "wall": 0, "offset": 0.3, "width": 0.9, "height": 2.1, "source": "scan"},
               {"type": "window", "wall": 1, "offset": 0.47, "width": 1.2, "sill": 0.9, "height": 1.2}],
  "furniture": [{"id": "uuid", "type": "sofa", "position": {"x": 1.3, "y": 0, "z": 1.7}, "rotation": {"x": 0, "y": 3.1416, "z": 0},
                 "scale": {"x": 1, "y": 1, "z": 1}, "color": "#879787", "timestamp": 1700000000000, "label": "Grey sofa", "source": "scan"}],
  "createdAt": "<server timestamp>",
  "updatedAt": "<server timestamp>"
}
```

* `source`, `scan`, `meshPath` are set only when the room is created (rules reject later changes).
* `furniture[].type` is a catalog type (`src/catalog.json`). Unknown types are preserved and shown as boxes.
* `openings[].height` / `sill` are optional; defaults: doors 2.1 m from the floor, windows 1.2 m high from a sill of min(0.9, wall height/3).
* Walls whose endpoints follow consecutive floor vertices are the **outline**; other walls are interior walls.
  Reshaping the floor rebuilds outline walls and re-attaches openings (see `reshapeFloor` / `RoomOps.ReshapeFloor`).
* Limits: 3–500 floor vertices, ≤ 500 walls, ≤ 300 furniture items, ≤ 100 openings, dimensions 0.5–100 m.

## Floors and plans (one code per project)

A document is a **house project**. Its top-level geometry (`dimensions, floor, walls, openings, furniture`) is the
**ground floor**, named by `levelName` (default "Ground floor"), so older clients still see a valid room.
`levels` (always written, possibly empty; at most 11) holds further floors:

```json
"levelName": "Ground floor",
"levels": [
  {"id": "a1b2c3d4e5f6", "name": "First floor", "elevation": 2.95, "separate": false,
   "dimensions": {"x": 7, "y": 2.7, "z": 5.5}, "floor": {"vertices": ["…"], "center": {"x": 0, "y": 0, "z": 0}},
   "walls": ["…"], "openings": ["…"], "furniture": ["…"]},
  {"id": "f6e5d4c3b2a1", "name": "Garage", "elevation": 0, "separate": true, "…": "…"}
]
```

* `separate: false` — stacked on the building at `elevation` meters above the ground floor (default: floor below +
  its ceiling height + 0.25 m slab). Stairs placed on a floor are stretched to reach the next stacked floor, which
  gets an opening in its slab; the 3D view draws a glowing route along each stair's catalog `path`.
* `separate: true` — an independent plan in the same project (garage, annex…), shown beside the building.
* Every floor uses the same geometry rules, coordinates and limits; furniture ids are unique across the project.
* The phone shows one floor at a time (picked from "Floor") and can scan a new floor into the same code.

## Coordinates

* Meters. Canonical stored coordinates are web / Three.js: right-handed, +Y up.
* Unity room-local = (x, y − floor.center.y, −z). Web yaw θ (radians, rotation about +Y) ↔ Unity yaw −θ (degrees).
* Item origin is the bottom-centre of its footprint; the model's front faces +Z (web).
* Catalog part rotations are XYZ Euler degrees (M = Rx·Ry·Rz); Unity uses `AngleAxis(−rx,X)·AngleAxis(−ry,Y)·AngleAxis(rz,Z)`.
* Scanned rooms are stored centred on their bounding box with walls axis-aligned; the scanning phone keeps the
  session transform. Other sessions place the room with Smart align, two corners, or by hand (no cloud anchors).

## Saving

Every save is a Firestore transaction that writes only the editable fields
(`schemaVersion, name, dimensions, floor, walls, furniture, openings, revision, timestamp, updatedAt`) with
`revision = previous + 1` and `timestamp > previous`. If the stored revision differs from the editor's base,
the client merges instead of failing:

* furniture by `id`: changed on one side → that side wins; changed on both → the saving side wins;
  deleted locally and unchanged remotely → deleted; added on either side → kept;
* the outline (floor + walls + openings) and name as units: local wins if it changed locally;
* floors (`levels`) by `id`, each merged like a room (plus `name`, `elevation`, `separate`); floors added on either
  side are kept, a floor deleted on one side is dropped unless the other side changed it.

Listeners apply remote revisions immediately when there are no local edits, otherwise they rebase the local
edits on top (same merge). The phone reports `appliedRevision` in `devices/{uid}` after applying a revision, so
the website can show "showing your latest save".
