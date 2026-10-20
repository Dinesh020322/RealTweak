// Renders a room document in AR under an anchor transform: floor footprint, walls with door and
// window cut-outs (ghost / outline / hidden) and furniture, reconciled by id so remote edits apply
// in place without rebuilding everything.
using System.Collections.Generic;
using System.Linq;
using RealTweak.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace RealTweak
{
    public enum WallMode { Ghost, Outline, Hidden }

    public class RoomView : MonoBehaviour
    {
        public Transform shell, furnitureRoot;
        public WallMode wallMode = WallMode.Ghost;
        public bool showFloor = true;
        /// <summary>When a connected floor exists above, staircases show a glowing route up to it.</summary>
        public bool floorAbove;
        readonly Dictionary<string, FurnitureView> items = new Dictionary<string, FurnitureView>();
        Room room;
        string shellFingerprint;
        LineRenderer selection;
        public string SelectedId { get; private set; }
        public Room Room => room;
        public double FloorY => room?.floorCenter.y ?? 0;

        static readonly Color GhostWall = new Color(0.93f, 0.95f, 0.93f, 0.28f);
        static readonly Color Accent = new Color(0.16f, 0.62f, 0.52f, 1f);
        static readonly Color FloorTint = new Color(0.16f, 0.62f, 0.52f, 0.14f);

        void Awake()
        {
            if (shell == null) { shell = new GameObject("Shell").transform; shell.SetParent(transform, false); }
            if (furnitureRoot == null) { furnitureRoot = new GameObject("Furniture").transform; furnitureRoot.SetParent(transform, false); }
            selection = MeshKit.Line(transform, "Selection", Accent, 0.012f, true);
            selection.positionCount = 0;
        }

        public void Show(Room next)
        {
            room = next;
            var patch = RoomCodec.Patch(next, 0, 0);
            string fp = Canon.Of(new object[] { patch["floor"], patch["walls"], patch["openings"], wallMode.ToString(), showFloor });
            if (fp != shellFingerprint) { shellFingerprint = fp; BuildShell(); }
            SyncFurniture();
            UpdateSelection();
        }

        public void SetWallMode(WallMode mode) { wallMode = mode; shellFingerprint = null; if (room != null) Show(room); }

        // ------------------------------------------------------------------ shell
        void BuildShell()
        {
            foreach (Transform child in shell) Destroy(child.gameObject);
            if (room == null) return;
            var outline = room.floor.Select(v => Coords.ToLocal(v, FloorY)).ToList();
            if (showFloor)
            {
                var floor = new GameObject("Floor"); floor.transform.SetParent(shell, false);
                floor.transform.localPosition = new Vector3(0, 0.004f, 0);
                floor.AddComponent<MeshFilter>().sharedMesh = MeshKit.Polygon(outline.Select(p => new Vector2(p.x, p.z)).ToList());
                var mr = floor.AddComponent<MeshRenderer>(); mr.sharedMaterial = MeshKit.Unlit(FloorTint); mr.shadowCastingMode = ShadowCastingMode.Off;
            }
            var edge = MeshKit.Line(shell, "Outline", Accent, 0.02f, true);
            edge.positionCount = outline.Count;
            edge.SetPositions(outline.Select(p => p + Vector3.up * 0.01f).ToArray());
            if (wallMode == WallMode.Hidden) return;
            for (int i = 0; i < room.walls.Count; i++) BuildWall(i);
        }

        void BuildWall(int index)
        {
            var w = room.walls[index];
            Vector3 a = Coords.ToLocal(w.start, FloorY), b = Coords.ToLocal(w.end, FloorY);
            a.y = b.y = 0;
            float len = Vector3.Distance(a, b);
            if (len < 0.01f) return;
            var g = new GameObject($"Wall {index}").transform; g.SetParent(shell, false);
            g.localPosition = (a + b) / 2; g.localRotation = Quaternion.LookRotation(b - a, Vector3.up) * Quaternion.Euler(0, -90, 0);
            // Local X now runs from a (−len/2) to b (+len/2).
            var cuts = room.openings.Where(o => o.wall == index).Select(o => (o, from: Mathf.Max(0, (float)(o.offset * len - o.width / 2)), to: Mathf.Min(len, (float)(o.offset * len + o.width / 2)))).OrderBy(c => c.from).ToList();
            float height = (float)w.height, thick = (float)w.thickness;
            if (wallMode == WallMode.Ghost)
            {
                var mat = MeshKit.Material(GhostWall, "", GhostWall.a);
                void Box(float x0, float x1, float y0, float y1)
                {
                    if (x1 - x0 < 0.005f || y1 - y0 < 0.005f) return;
                    var go = new GameObject("Segment"); go.transform.SetParent(g, false);
                    go.transform.localPosition = new Vector3((x0 + x1) / 2 - len / 2, (y0 + y1) / 2, 0);
                    go.transform.localScale = new Vector3(x1 - x0, y1 - y0, thick);
                    go.AddComponent<MeshFilter>().sharedMesh = MeshKit.Box();
                    var mr = go.AddComponent<MeshRenderer>(); mr.sharedMaterial = mat; mr.shadowCastingMode = ShadowCastingMode.Off;
                }
                float cursor = 0;
                foreach (var (o, from, to) in cuts)
                {
                    Box(cursor, from, 0, height);
                    float sill = (float)o.Sill(w), top = sill + (float)o.Height(w);
                    Box(from, to, 0, sill); Box(from, to, top, height);
                    cursor = Mathf.Max(cursor, to);
                }
                Box(cursor, len, 0, height);
            }
            // Top edge and opening frames as lines for a crisp RoomPlan-like look.
            var topLine = MeshKit.Line(g, "Top", Accent, 0.012f, false);
            topLine.positionCount = 2; topLine.SetPositions(new[] { new Vector3(-len / 2, height, 0), new Vector3(len / 2, height, 0) });
            var vert = MeshKit.Line(g, "Edge", Accent, 0.012f, false);
            vert.positionCount = 2; vert.SetPositions(new[] { new Vector3(-len / 2, 0, 0), new Vector3(-len / 2, height, 0) });
            foreach (var (o, from, to) in cuts)
            {
                float sill = (float)o.Sill(w), topY = sill + (float)o.Height(w);
                var frame = MeshKit.Line(g, o.type, o.type == "door" ? new Color(0.95f, 0.66f, 0.3f) : new Color(0.45f, 0.75f, 0.95f), 0.015f, o.type == "window");
                var pts = o.type == "door"
                    ? new[] { new Vector3(from - len / 2, 0, 0), new Vector3(from - len / 2, topY, 0), new Vector3(to - len / 2, topY, 0), new Vector3(to - len / 2, 0, 0) }
                    : new[] { new Vector3(from - len / 2, sill, 0), new Vector3(from - len / 2, topY, 0), new Vector3(to - len / 2, topY, 0), new Vector3(to - len / 2, sill, 0) };
                frame.positionCount = pts.Length; frame.SetPositions(pts);
            }
        }

        // ------------------------------------------------------------------ furniture
        string Fingerprint(Item f) => $"{f.type}|{f.color}|{floorAbove}";

        void SyncFurniture()
        {
            var keep = new HashSet<string>();
            foreach (var f in room.furniture)
            {
                keep.Add(f.id);
                if (items.TryGetValue(f.id, out var view) && view.fingerprint != Fingerprint(f)) { Destroy(view.gameObject); items.Remove(f.id); view = null; }
                if (view == null)
                {
                    var go = FurnitureFactory.Build(f.type, f.color, f.id);
                    go.transform.SetParent(furnitureRoot, false);
                    view = go.GetComponent<FurnitureView>(); view.fingerprint = Fingerprint(f);
                    var def = Catalog.Get(f.type);
                    if (floorAbove && def.path != null && def.path.Length >= 6) AddRoute(go.transform, def.path);
                    items[f.id] = view;
                }
                Place(view.transform, f);
            }
            foreach (var id in items.Keys.Where(k => !keep.Contains(k)).ToList()) { Destroy(items[id].gameObject); items.Remove(id); }
            if (SelectedId != null && !items.ContainsKey(SelectedId)) SelectedId = null;
        }

        static void AddRoute(Transform item, float[] path)
        {
            // Walking path in item space (web coordinates): mirror Z for Unity.
            var line = MeshKit.Line(item, "Route", new Color(0.13f, 0.75f, 0.58f, 1f), 0.035f, false);
            line.positionCount = path.Length / 3;
            for (int i = 0; i < line.positionCount; i++) line.SetPosition(i, new Vector3(path[i * 3], path[i * 3 + 1] + 0.1f, -path[i * 3 + 2]));
        }

        public void Place(Transform t, Item f)
        {
            t.localPosition = Coords.ToLocal(f.position, FloorY);
            t.localRotation = Quaternion.Euler(0, Coords.YawToUnity(f.Yaw), 0);
            t.localScale = new Vector3((float)f.scale.x, (float)f.scale.y, (float)f.scale.z);
        }

        public FurnitureView ViewOf(string id) => id != null && items.TryGetValue(id, out var v) ? v : null;

        public void Select(string id) { SelectedId = id; UpdateSelection(); }

        public void UpdateSelection()
        {
            var v = ViewOf(SelectedId);
            if (v == null) { selection.positionCount = 0; return; }
            var def = Catalog.Get(v.type);
            var s = v.transform.localScale; float hw = def.w * s.x / 2 + 0.03f, hd = def.d * s.z / 2 + 0.03f;
            var corners = new[] { new Vector3(-hw, 0.01f, -hd), new Vector3(hw, 0.01f, -hd), new Vector3(hw, 0.01f, hd), new Vector3(-hw, 0.01f, hd) };
            selection.positionCount = 4;
            selection.SetPositions(corners.Select(c => transform.InverseTransformPoint(v.transform.TransformPoint(new Vector3(c.x / Mathf.Max(0.001f, s.x), c.y, c.z / Mathf.Max(0.001f, s.z))))).ToArray());
        }
    }
}
