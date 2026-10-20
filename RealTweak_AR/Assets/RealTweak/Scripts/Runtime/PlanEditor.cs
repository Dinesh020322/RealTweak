// Touch plan editor used to review and adjust a scanned room before (or after) it is shared:
// drag corners, tap a wall to change its length or add a corner, set the ceiling height,
// square up the outline, and delete wrong detections. Same geometry rules as the website.
using System;
using System.Collections.Generic;
using System.Linq;
using RealTweak.Core;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace RealTweak
{
    /// <summary>Draws the plan (floor, furniture, walls, openings) as one UI mesh.</summary>
    public class PlanGraphic : MaskableGraphic
    {
        public Room room;
        public Func<V3, Vector2> project;
        public string selected;
        static readonly Color Floor = UIKit.Hex("#efe7d6"), WallC = UIKit.Hex("#59645a"), Sel = UIKit.Hex("#2c8e79"), Door = UIKit.Hex("#d99a4e"), Window = UIKit.Hex("#6fa8d6");

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            if (room == null || project == null) return;
            var outline = room.floor.Select(project).ToList();
            Fill(vh, outline, Floor);
            foreach (var f in room.furniture)
            {
                var def = Catalog.Get(f.type);
                double hw = def.w * f.scale.x / 2, hd = def.d * f.scale.z / 2, a = f.Yaw;
                var corners = new[] { (-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd) }.Select(c => project(new V3(f.position.x + c.Item1 * Math.Cos(a) + c.Item2 * Math.Sin(a), 0, f.position.z - c.Item1 * Math.Sin(a) + c.Item2 * Math.Cos(a)))).ToList();
                var col = Catalog.ParseColor(f.color ?? def.color, Color.gray); col.a = def.mount == "ceiling" ? 0.35f : 0.9f;
                Fill(vh, corners, col);
                if (selected == f.id) for (int i = 0; i < 4; i++) Segment(vh, corners[i], corners[(i + 1) % 4], 6, Sel);
            }
            for (int i = 0; i < room.walls.Count; i++)
            {
                var w = room.walls[i];
                Segment(vh, project(w.start), project(w.end), Mathf.Max(10, (float)w.thickness * Scale), selected == $"wall:{i}" ? Sel : WallC);
            }
            for (int i = 0; i < room.openings.Count; i++)
            {
                var o = room.openings[i]; var w = room.walls[o.wall]; double len = w.Length;
                double t0 = o.offset - o.width / 2 / len, t1 = o.offset + o.width / 2 / len;
                V3 L(double t) => new V3(w.start.x + (w.end.x - w.start.x) * t, 0, w.start.z + (w.end.z - w.start.z) * t);
                Segment(vh, project(L(t0)), project(L(t1)), Mathf.Max(14, (float)w.thickness * Scale + 6), selected == $"opening:{i}" ? Sel : o.type == "door" ? Door : Window);
            }
        }
        public float Scale = 100;

        static void Fill(VertexHelper vh, List<Vector2> pts, Color c)
        {
            if (pts.Count < 3) return;
            int start = vh.currentVertCount;
            foreach (var p in pts) vh.AddVert(p, c, Vector2.zero);
            var idx = Enumerable.Range(0, pts.Count).ToList();
            float area = 0; for (int i = 0; i < pts.Count; i++) { var a = pts[i]; var b = pts[(i + 1) % pts.Count]; area += a.x * b.y - b.x * a.y; }
            if (area < 0) idx.Reverse();
            int guard = 0;
            while (idx.Count > 3 && guard++ < 5000)
            {
                bool clipped = false;
                for (int i = 0; i < idx.Count && !clipped; i++)
                {
                    int ia = idx[(i - 1 + idx.Count) % idx.Count], ib = idx[i], ic = idx[(i + 1) % idx.Count];
                    Vector2 a = pts[ia], b = pts[ib], cc = pts[ic];
                    if ((b.x - a.x) * (cc.y - a.y) - (b.y - a.y) * (cc.x - a.x) <= 0) continue;
                    if (idx.Any(k => k != ia && k != ib && k != ic && InTri(pts[k], a, b, cc))) continue;
                    vh.AddTriangle(start + ia, start + ib, start + ic); idx.RemoveAt(i); clipped = true;
                }
                if (!clipped) break;
            }
            if (idx.Count == 3) vh.AddTriangle(start + idx[0], start + idx[1], start + idx[2]);
        }
        static bool InTri(Vector2 p, Vector2 a, Vector2 b, Vector2 c)
        {
            float d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y), d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y), d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
            return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
        }
        static void Segment(VertexHelper vh, Vector2 a, Vector2 b, float width, Color c)
        {
            var d = (b - a).normalized; var n = new Vector2(-d.y, d.x) * width / 2; a -= d * width / 2; b += d * width / 2;
            int i = vh.currentVertCount;
            vh.AddVert(a - n, c, Vector2.zero); vh.AddVert(a + n, c, Vector2.zero); vh.AddVert(b + n, c, Vector2.zero); vh.AddVert(b - n, c, Vector2.zero);
            vh.AddTriangle(i, i + 1, i + 2); vh.AddTriangle(i, i + 2, i + 3);
        }
    }

    public class PlanEditor : MonoBehaviour, IPointerClickHandler
    {
        public event Action<Room> Changed;
        public Room Room { get; private set; }
        RectTransform area;
        PlanGraphic graphic;
        readonly List<RectTransform> handles = new List<RectTransform>();
        readonly List<TextMeshProUGUI> labels = new List<TextMeshProUGUI>();
        TextMeshProUGUI ceilingLabel, selectionLabel, hint;
        RectTransform selectionBar;
        Button undoButton;
        readonly Stack<Room> history = new Stack<Room>();
        float scale; Vector2 offset;

        public static PlanEditor Create(Transform parent)
        {
            var root = UIKit.Rect(parent, "Plan Editor").Stretch();
            var editor = root.gameObject.AddComponent<PlanEditor>();
            editor.Build(root);
            return editor;
        }

        void Build(RectTransform root)
        {
            var bg = root.gameObject.AddComponent<Image>(); bg.color = UIKit.Cream;
            area = UIKit.Rect(root, "Plan Area").Stretch(20, 20, 20, 300);
            graphic = area.gameObject.AddComponent<PlanGraphic>(); graphic.raycastTarget = true;
            var clicks = area.gameObject.AddComponent<PlanClickForwarder>(); clicks.editor = this;
            hint = UIKit.Text(root, "Drag the dots to match your walls. Tap a wall to set its length.", 32, UIKit.Muted, FontStyles.Normal, TextAlignmentOptions.Center);
            hint.rectTransform.Anchor(new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 250), new Vector2(-40, 50));
            // Bottom tool rows: ceiling height and selection actions.
            var tools = UIKit.Rect(root, "Tools").Anchor(new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 20), new Vector2(-40, 220));
            UIKit.Column(tools, 16);
            var row = UIKit.Row(tools, 14, 100);
            UIKit.Button(row.transform, "-", () => Ceiling(-0.05), UIKit.Mint, UIKit.Ink, 48).Size(width: 110, flexW: 0);
            ceilingLabel = UIKit.Text(row.transform, "", 34, UIKit.Ink, FontStyles.Bold, TextAlignmentOptions.Center);
            UIKit.Button(row.transform, "+", () => Ceiling(0.05), UIKit.Mint, UIKit.Ink, 48).Size(width: 110, flexW: 0);
            UIKit.Button(row.transform, "Square up", SquareUp, UIKit.Mint, UIKit.Ink, 32);
            undoButton = UIKit.Button(row.transform, "Undo", Undo, UIKit.Mint, UIKit.Ink, 32);
            selectionBar = (RectTransform)UIKit.Row(tools, 14, 100).transform;
            selectionLabel = UIKit.Text(selectionBar, "", 30, UIKit.Ink, FontStyles.Bold, TextAlignmentOptions.MidlineLeft);
        }

        public void Edit(Room room)
        {
            Room = room.Clone(); history.Clear(); graphic.selected = null;
            needsLayout = true;
        }
        bool needsLayout;
        void OnEnable() => needsLayout = true;
        void Update()
        {
            // Layout needs the final on-screen size, which is only known once the sheet is visible.
            if (needsLayout && Room != null && area.rect.width > 10) { needsLayout = false; Layout(); }
        }

        void Push() { history.Push(Room.Clone()); if (history.Count > 50) { var keep = history.Take(50).Reverse().ToList(); history.Clear(); foreach (var r in keep) history.Push(r); } }
        void Commit() { Redraw(); Changed?.Invoke(Room); }
        void Try(Action<Room> edit)
        {
            var before = Room.Clone();
            try { Push(); edit(Room); Commit(); }
            catch (RoomEditException e) { history.Pop(); Room = before; Flash(e.Message); Redraw(); }
        }
        void Flash(string text) { hint.text = text; hint.color = UIKit.Danger; CancelInvoke(nameof(ResetHint)); Invoke(nameof(ResetHint), 3f); }
        void ResetHint() { hint.color = UIKit.Muted; hint.text = "Drag the dots to match your walls. Tap a wall to set its length."; }

        void Layout()
        {
            var r = area.rect;
            double minX = Room.floor.Min(p => p.x), maxX = Room.floor.Max(p => p.x), minZ = Room.floor.Min(p => p.z), maxZ = Room.floor.Max(p => p.z);
            scale = (float)Math.Min((r.width - 160) / Math.Max(1, maxX - minX), (r.height - 160) / Math.Max(1, maxZ - minZ));
            offset = new Vector2((float)(-(minX + maxX) / 2), (float)((minZ + maxZ) / 2));
            graphic.Scale = scale;
            graphic.project = Project;
            Redraw();
        }
        Vector2 Project(V3 w) => new Vector2((float)(w.x + offset.x) * scale, (float)(-w.z + offset.y) * scale);
        V3 Unproject(Vector2 p) => new V3(p.x / scale - offset.x, 0, -(p.y / scale - offset.y));

        void Redraw()
        {
            if (Room == null) return;
            graphic.room = Room; graphic.SetVerticesDirty();
            ceilingLabel.text = $"Ceiling {Room.dimensions.y:0.00} m";
            undoButton.interactable = history.Count > 0;
            while (handles.Count < Room.floor.Count) handles.Add(NewHandle(handles.Count));
            for (int i = 0; i < handles.Count; i++)
            {
                handles[i].gameObject.SetActive(i < Room.floor.Count);
                if (i < Room.floor.Count) { handles[i].anchoredPosition = Project(Room.floor[i]); handles[i].GetComponent<Image>().color = graphic.selected == $"corner:{i}" ? UIKit.Green : Color.white; }
            }
            while (labels.Count < Room.floor.Count) { var t = UIKit.Text(area, "", 28, UIKit.Ink, FontStyles.Bold, TextAlignmentOptions.Center); t.rectTransform.sizeDelta = new Vector2(200, 40); labels.Add(t); }
            for (int i = 0; i < labels.Count; i++)
            {
                labels[i].gameObject.SetActive(i < Room.floor.Count);
                if (i >= Room.floor.Count) continue;
                var a = Room.floor[i]; var b = Room.floor[(i + 1) % Room.floor.Count];
                Vector2 pa = Project(a), pb = Project(b), mid = (pa + pb) / 2, dir = (pb - pa).normalized, n = new Vector2(-dir.y, dir.x);
                var center = Room.floor.Aggregate(Vector2.zero, (s, v) => s + Project(v)) / Room.floor.Count;
                if (Vector2.Dot(mid - center, n) < 0) n = -n;
                labels[i].rectTransform.anchoredPosition = mid + n * 38;
                float angle = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg; if (angle > 90) angle -= 180; if (angle < -90) angle += 180;
                labels[i].rectTransform.localRotation = Quaternion.Euler(0, 0, angle);
                labels[i].text = $"{Math.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)):0.00} m";
            }
            RenderSelectionBar();
        }

        RectTransform NewHandle(int index)
        {
            var img = UIKit.Panel(area, $"Corner {index}", Color.white, false);
            img.sprite = UIKit.Circle(); img.rectTransform.sizeDelta = new Vector2(64, 64);
            var outline = img.gameObject.AddComponent<Outline>(); outline.effectColor = UIKit.Green; outline.effectDistance = new Vector2(3, -3);
            var drag = img.gameObject.AddComponent<CornerHandle>(); drag.editor = this; drag.index = index;
            return img.rectTransform;
        }

        // ------------------------------------------------------------------ interactions
        Room dragStart;
        internal void BeginDrag(int index) { dragStart = Room.Clone(); graphic.selected = $"corner:{index}"; Push(); }
        internal void Drag(int index, Vector2 screen)
        {
            if (dragStart == null) return;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(area, screen, null, out var local);
            var p = Unproject(local);
            double x = Math.Round(p.x / 0.05) * 0.05, z = Math.Round(p.z / 0.05) * 0.05;
            int n = dragStart.floor.Count; var prev = dragStart.floor[(index - 1 + n) % n]; var next = dragStart.floor[(index + 1) % n];
            foreach (var q in new[] { prev, next }) { if (Math.Abs(x - q.x) < 0.15) x = q.x; if (Math.Abs(z - q.z) < 0.15) z = q.z; }
            try { Room = RoomOps.MoveCorner(dragStart.Clone(), index, x, z); Redraw(); } catch (RoomEditException) { /* keep last valid shape */ }
        }
        internal void EndDrag() { dragStart = null; Commit(); }
        internal void SelectCorner(int index) { graphic.selected = $"corner:{index}"; Redraw(); }

        public void OnPointerClick(PointerEventData e) { }
        internal void Click(Vector2 screen)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle(area, screen, null, out var local);
            string pick = null; float best = 40;
            for (int i = 0; i < Room.openings.Count; i++)
            {
                var o = Room.openings[i]; var w = Room.walls[o.wall];
                var c = Project(new V3(w.start.x + (w.end.x - w.start.x) * o.offset, 0, w.start.z + (w.end.z - w.start.z) * o.offset));
                if (Vector2.Distance(c, local) < best) { best = Vector2.Distance(c, local); pick = $"opening:{i}"; }
            }
            if (pick == null)
                for (int i = 0; i < Room.walls.Count; i++)
                {
                    float d = DistToSegment(local, Project(Room.walls[i].start), Project(Room.walls[i].end));
                    if (d < best) { best = d; pick = $"wall:{i}"; }
                }
            if (pick == null)
                foreach (var f in Room.furniture)
                {
                    var p = Project(f.position); var def = Catalog.Get(f.type);
                    if (Vector2.Distance(p, local) < Mathf.Max(30, (float)(Math.Max(def.w * f.scale.x, def.d * f.scale.z) * scale / 2))) { pick = f.id; break; }
                }
            graphic.selected = pick; Redraw();
        }
        static float DistToSegment(Vector2 p, Vector2 a, Vector2 b)
        {
            var ab = b - a; float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / Mathf.Max(1e-6f, ab.sqrMagnitude));
            return Vector2.Distance(p, a + ab * t);
        }

        void RenderSelectionBar()
        {
            for (int i = selectionBar.childCount - 1; i >= 1; i--) Destroy(selectionBar.GetChild(i).gameObject);
            string sel = graphic.selected;
            if (sel == null) { selectionLabel.text = $"{Room.floor.Count} corners | {RoomOps.Area(Room.floor):0.0} sq m | {Room.furniture.Count} objects"; return; }
            if (sel.StartsWith("corner:"))
            {
                int i = int.Parse(sel.Substring(7));
                selectionLabel.text = $"Corner {i + 1}";
                UIKit.Button(selectionBar, "Remove corner", () => Try(r => { RoomOps.RemoveCorner(r, i); graphic.selected = null; }), UIKit.Mint, UIKit.Danger, 30);
            }
            else if (sel.StartsWith("wall:"))
            {
                int i = int.Parse(sel.Substring(5)); var w = Room.walls[i]; int edge = RoomOps.PerimeterEdge(Room, w);
                selectionLabel.text = $"Wall {w.Length:0.00} m";
                if (edge >= 0)
                {
                    UIKit.Button(selectionBar, "-5cm", () => Try(r => Resize(r, edge, -0.05)), UIKit.Mint, UIKit.Ink, 30);
                    UIKit.Button(selectionBar, "+5cm", () => Try(r => Resize(r, edge, 0.05)), UIKit.Mint, UIKit.Ink, 30);
                    UIKit.Button(selectionBar, "Add corner", () => Try(r => { RoomOps.InsertCorner(r, edge, 0.5); graphic.selected = $"corner:{edge + 1}"; }), UIKit.Mint, UIKit.Ink, 30);
                }
                UIKit.Button(selectionBar, "Door", () => Try(r => AddOpening(r, i, "door")), UIKit.Mint, UIKit.Ink, 30);
                UIKit.Button(selectionBar, "Window", () => Try(r => AddOpening(r, i, "window")), UIKit.Mint, UIKit.Ink, 30);
            }
            else if (sel.StartsWith("opening:"))
            {
                int i = int.Parse(sel.Substring(8));
                selectionLabel.text = $"{(Room.openings[i].type == "door" ? "Door" : "Window")} {Room.openings[i].width:0.00} m";
                UIKit.Button(selectionBar, "Remove", () => Try(r => { r.openings.RemoveAt(i); graphic.selected = null; }), UIKit.Mint, UIKit.Danger, 30);
            }
            else
            {
                var f = Room.furniture.FirstOrDefault(x => x.id == sel);
                if (f == null) { graphic.selected = null; RenderSelectionBar(); return; }
                selectionLabel.text = Catalog.Get(f.type).name;
                UIKit.Button(selectionBar, "Remove", () => Try(r => { r.furniture.RemoveAll(x => x.id == sel); graphic.selected = null; }), UIKit.Mint, UIKit.Danger, 30);
            }
        }

        static void Resize(Room r, int edge, double delta)
        {
            var v = r.floor; var a = v[edge]; int bi = (edge + 1) % v.Count; var b = v[bi];
            double len = Math.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
            var next = v.Select((p, i) => i == bi || (v.Count > 3 && i == (bi + 1) % v.Count) ? new V3(p.x + ux * delta, p.y, p.z + uz * delta) : p).ToList();
            RoomOps.ReshapeFloor(r, next, k => new RoomOps.EdgeSource { old = k, from = 0, to = 1, valid = true });
        }
        static void AddOpening(Room r, int wall, string type)
        {
            double width = type == "door" ? 0.9 : 1.2, len = r.walls[wall].Length;
            if (len < width + 0.1) throw new RoomEditException("This wall is too short for that opening.");
            r.openings.Add(new Opening { type = type, wall = wall, offset = 0.5, width = width });
        }
        void Ceiling(double delta) => Try(r => RoomOps.SetCeilingHeight(r, Math.Round((r.dimensions.y + delta) / 0.05) * 0.05, t => { var d = Catalog.Get(t); return (d.h, d.mount); }));
        void SquareUp() => Try(r => { if (!RoomOps.SquareUp(r)) throw new RoomEditException("The corners are already square."); });
        void Undo() { if (history.Count == 0) return; Room = history.Pop(); graphic.selected = null; Redraw(); Changed?.Invoke(Room); }
    }

    public class CornerHandle : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler, IPointerClickHandler
    {
        public PlanEditor editor; public int index;
        public void OnBeginDrag(PointerEventData e) => editor.BeginDrag(index);
        public void OnDrag(PointerEventData e) => editor.Drag(index, e.position);
        public void OnEndDrag(PointerEventData e) => editor.EndDrag();
        public void OnPointerClick(PointerEventData e) { if (!e.dragging) editor.SelectCorner(index); }
    }
    public class PlanClickForwarder : MonoBehaviour, IPointerClickHandler
    {
        public PlanEditor editor;
        public void OnPointerClick(PointerEventData e) { if (!e.dragging) editor.Click(e.position); }
    }
}
