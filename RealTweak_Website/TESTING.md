# Verification and release checks

## Automated

| Command | Coverage |
|---|---|
| `npm test` | Codes, validation, room templates, corner move/insert/remove, wall length, ceiling height, three-way merge, catalog integrity, plan symbols/thumbnails for every model, DOM flows (place, wall-snap, corner drag, wall length, draw outline, templates, drafts, keyboard), 3D wall/opening/furniture builder |
| `npm run test:rules` | Firestore emulator: create/edit by code, field allowlists, 8-character code creation only, legacy rooms still editable, stale revisions, limits, listener delivery to another device, **simultaneous phone + web saves merged**, scan metadata preserved, device presence |
| `dotnet run` in `../RealTweak_AR/CoreTests~` | Unity core: codec, merge, room ops, SmartScan on 30 randomized synthetic rooms, two-corner and Smart-align registration |
| Unity batch build | `RealTweak ▸ Build App Scene` and `Build Android APK` compile all runtime/editor code |

The emulator suite uses ports 18080/19150 and project `demo-realtweak`; it never touches production.

## Browser checklist

1. Demo loads; catalog shows 82 models with thumbnails; search "stairs" finds three staircases.
2. Place furniture, drag it, rotate with the handle, set exact size/elevation/finish; duplicate, remove, undo/redo.
3. Wall items (TV, cabinets, mirror) snap to the nearest wall facing into the room; ceiling items hang at ceiling height.
4. Drag a corner (right-angle snapping), double-click a wall to add a corner, remove a corner, type a wall length, change ceiling height.
5. Draw a room outline; create L/U/T rooms from templates.
6. 3D view: orbit, cut-away walls, select and drag furniture, doors/windows visible.
7. Reload: draft restored. Export/import JSON, SVG/PNG export, print.
8. Enter a room code from the phone; edit; Save → phone updates. Turn on Live sync.
9. Edit the same room on phone and browser at once → both changes survive.
10. Details panel shows the phone and "showing your latest save".
11. Offline editing keeps the draft; saving after reconnecting merges.
12. Narrow portrait and landscape widths, keyboard focus, dialogs.

## Device checklist (AR app)

Test on at least: one ARCore phone **with** Depth API, one ARCore phone **without** it, one iPhone without LiDAR, one with LiDAR.

1. Scan: floor found; wall outlines appear while walking; Finish produces an outline within a few cm of tape measurements; doors/windows/furniture detected or easily added/removed in review.
2. Corner mode on a bare, white-walled room.
3. Review: drag corners, wall ±5 cm, ceiling ±, square up, delete detections; Save shows the code; Share code opens the share sheet.
4. Website shows the room, scan mesh overlay, and phone presence.
5. Furniture added/moved/removed on the website appears on the phone; furniture added/moved/rotated/deleted on the phone appears on the website after Save.
6. Close and reopen the app: "Continue room" → Smart align / Tap 2 corners / Place by hand → furniture where expected; unsaved phone edits restored.
7. Low light, fast motion and tracking loss show hints; airplane mode shows offline messages without losing edits.

## Release gates

* Anonymous Auth enabled; rules deployed (Firestore + Storage with the cross-service grant); Storage CORS for the site.
* App Check configured and enforced after staging verification (web: reCAPTCHA Enterprise; Android: Play Integrity; iOS: App Attest).
* iOS app registered in Firebase with the bundle id `com.FourFriendsInteractive.RealTweakAR`.
* Backups/monitoring and abuse limits decided for public launch.
