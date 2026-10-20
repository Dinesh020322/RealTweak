// Room geometry editing, ported from the website (src/model.js) so a room adjusted on the phone
// behaves exactly like one adjusted in the browser. Works in web coordinates (x, z plan).
using System;
using System.Collections.Generic;
using System.Linq;

namespace RealTweak.Core
{
    public class RoomEditException : Exception { public RoomEditException(string m) : base(m) { } }

    public static class RoomOps
    {
        public static double Area(IList<V3> v)
        {
            double s = 0;
            for (int i = 0; i < v.Count; i++) { var p = v[i]; var q = v[(i + 1) % v.Count]; s += p.x * q.z - q.x * p.z; }
            return Math.Abs(s / 2);
        }
        public static bool Inside(double x, double z, IList<V3> v)
        {
            bool hit = false;
            for (int i = 0, j = v.Count - 1; i < v.Count; j = i++)
            {
                var a = v[i]; var b = v[j];
                if ((a.z > z) != (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) hit = !hit;
            }
            return hit;
        }
        static bool Near(V3 a, V3 b, double eps = 0.02) => Math.Abs(a.x - b.x) < eps && Math.Abs(a.z - b.z) < eps;

        /// <summary>Index of the floor edge (vertex i → i+1) that a wall follows, or -1 for interior walls.</summary>
        public static int PerimeterEdge(Room room, Wall w)
        {
            var v = room.floor;
            for (int i = 0; i < v.Count; i++)
            {
                var a = v[i]; var b = v[(i + 1) % v.Count];
                if ((Near(w.start, a) && Near(w.end, b)) || (Near(w.start, b) && Near(w.end, a))) return i;
            }
            return -1;
        }

        public static bool SelfIntersects(IList<V3> v)
        {
            double Cross(V3 o, V3 a, V3 b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
            int n = v.Count;
            for (int i = 0; i < n; i++)
                for (int j = i + 1; j < n; j++)
                {
                    if (Math.Abs(i - j) <= 1 || (i == 0 && j == n - 1)) continue;
                    V3 a = v[i], b = v[(i + 1) % n], c = v[j], d = v[(j + 1) % n];
                    if (Cross(a, b, c) * Cross(a, b, d) < 0 && Cross(c, d, a) * Cross(c, d, b) < 0) return true;
                }
            return false;
        }

        public static void UpdateMetrics(Room room)
        {
            var v = room.floor;
            double minX = v.Min(p => p.x), maxX = v.Max(p => p.x), minZ = v.Min(p => p.z), maxZ = v.Max(p => p.z);
            room.floorCenter = new V3((minX + maxX) / 2, room.floorCenter.y, (minZ + maxZ) / 2);
            room.dimensions = new V3(Math.Max(0.5, maxX - minX), room.dimensions.y, Math.Max(0.5, maxZ - minZ));
        }

        public struct EdgeSource { public int old; public double from, to; public bool valid; }

        /// <summary>Replaces the floor polygon, rebuilds outline walls, keeps interior walls and re-attaches openings.</summary>
        public static Room ReshapeFloor(Room room, IList<V3> vertices, Func<int, EdgeSource> edgeMap)
        {
            if (vertices.Count < 3) throw new RoomEditException("A room needs at least three corners.");
            if (Area(vertices) < 0.5) throw new RoomEditException("That shape is too small to be a room.");
            for (int i = 0; i < vertices.Count; i++)
            {
                var a = vertices[i]; var b = vertices[(i + 1) % vertices.Count];
                if (Math.Sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)) < 0.1) throw new RoomEditException("Corners must be at least 10 cm apart.");
            }
            if (SelfIntersects(vertices)) throw new RoomEditException("Walls cannot cross each other.");
            var oldEdges = room.walls.Select(w => PerimeterEdge(room, w)).ToList();
            Wall template = room.walls.Where((w, i) => oldEdges[i] >= 0).FirstOrDefault() ?? new Wall { height = room.dimensions.y, thickness = 0.12 };
            Wall SourceOf(int old) { int i = oldEdges.IndexOf(old); return i >= 0 ? room.walls[i] : template; }
            var interior = room.walls.Select((w, i) => (w, i)).Where(e => oldEdges[e.i] < 0).ToList();
            double y = room.floorCenter.y;
            var perimeter = new List<Wall>();
            for (int k = 0; k < vertices.Count; k++)
            {
                var a = vertices[k]; var b = vertices[(k + 1) % vertices.Count];
                var m = edgeMap(k); var src = SourceOf(m.valid ? m.old : -1);
                perimeter.Add(new Wall { start = new V3(a.x, y, a.z), end = new V3(b.x, y, b.z), height = src.height, thickness = src.thickness });
            }
            var openings = new List<Opening>();
            foreach (var o in room.openings)
            {
                int oldEdge = oldEdges[o.wall];
                if (oldEdge < 0)
                {
                    int index = interior.FindIndex(e => e.i == o.wall);
                    var c = o.Clone(); c.wall = perimeter.Count + index; openings.Add(c); continue;
                }
                for (int k = 0; k < perimeter.Count; k++)
                {
                    var m = edgeMap(k);
                    if (!m.valid || m.old != oldEdge || o.offset < m.from - 1e-9 || o.offset > m.to + 1e-9) continue;
                    double len = perimeter[k].Length, offset = (o.offset - m.from) / Math.Max(1e-9, m.to - m.from), width = Math.Min(o.width, len - 0.05);
                    if (width < 0.3) break;
                    double half = width / 2 / len;
                    var c = o.Clone(); c.wall = k; c.width = width; c.offset = Math.Min(1 - half, Math.Max(half, offset)); openings.Add(c);
                    break;
                }
            }
            room.floor = vertices.Select(p => new V3(p.x, y, p.z)).ToList();
            room.walls = perimeter.Concat(interior.Select(e => e.w)).ToList();
            room.openings = openings;
            UpdateMetrics(room);
            return room;
        }

        static EdgeSource Same(int k) => new EdgeSource { old = k, from = 0, to = 1, valid = true };

        public static Room MoveCorner(Room room, int index, double x, double z)
        {
            var v = room.floor.Select((p, i) => i == index ? new V3(x, p.y, z) : p).ToList();
            return ReshapeFloor(room, v, Same);
        }
        public static Room InsertCorner(Room room, int edge, double t = 0.5)
        {
            var v = room.floor; var a = v[edge]; var b = v[(edge + 1) % v.Count];
            var p = new V3(a.x + (b.x - a.x) * t, a.y, a.z + (b.z - a.z) * t);
            var next = v.Take(edge + 1).Concat(new[] { p }).Concat(v.Skip(edge + 1)).ToList();
            return ReshapeFloor(room, next, k => k < edge ? Same(k) : k == edge ? new EdgeSource { old = edge, from = 0, to = t, valid = true }
                : k == edge + 1 ? new EdgeSource { old = edge, from = t, to = 1, valid = true } : Same(k - 1));
        }
        public static Room RemoveCorner(Room room, int index)
        {
            int n = room.floor.Count;
            if (n <= 3) throw new RoomEditException("A room needs at least three corners.");
            var next = room.floor.Where((_, i) => i != index).ToList();
            int OldOf(int j) => j < index ? j : j + 1;
            return ReshapeFloor(room, next, k =>
            {
                int s = OldOf(k), e = OldOf((k + 1) % (n - 1));
                return Same((s + 1) % n == e ? s : (index - 1 + n) % n);
            });
        }
        public static Room SetCeilingHeight(Room room, double height, Func<string, (double h, string mount)> itemInfo = null)
        {
            if (height < 1.8 || height > 10) throw new RoomEditException("Ceiling height must be between 1.8 and 10 m.");
            room.dimensions = new V3(room.dimensions.x, height, room.dimensions.z);
            foreach (var w in room.walls) if (PerimeterEdge(room, w) >= 0) w.height = height;
            if (itemInfo != null)
                foreach (var f in room.furniture)
                {
                    var info = itemInfo(f.type);
                    if (info.mount == "ceiling") f.position = new V3(f.position.x, room.floorCenter.y + Math.Max(0, height - info.h * f.scale.y), f.position.z);
                }
            return room;
        }

        /// <summary>Makes nearly-square corners exactly 90° (common after a quick scan). Returns false if nothing changed.</summary>
        public static bool SquareUp(Room room, double toleranceDegrees = 12)
        {
            var v = room.floor.ToList();
            if (v.Count < 4) return false;
            // Dominant direction from the longest edge.
            int longest = 0; double best = 0;
            for (int i = 0; i < v.Count; i++) { var a = v[i]; var b = v[(i + 1) % v.Count]; double l = Math.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)); if (l > best) { best = l; longest = i; } }
            var la = v[longest]; var lb = v[(longest + 1) % v.Count];
            double theta = Math.Atan2(lb.z - la.z, lb.x - la.x);
            double cos = Math.Cos(-theta), sin = Math.Sin(-theta);
            var local = v.Select(p => (x: p.x * cos - p.z * sin, z: p.x * sin + p.z * cos)).ToList();
            double tol = Math.Tan(toleranceDegrees * Math.PI / 180);
            bool changed = false;
            for (int pass = 0; pass < 2; pass++)
                for (int i = 0; i < local.Count; i++)
                {
                    int j = (i + 1) % local.Count;
                    double dx = local[j].x - local[i].x, dz = local[j].z - local[i].z;
                    if (Math.Abs(dz) > 1e-9 && Math.Abs(dz) <= Math.Abs(dx) * tol) { local[j] = (local[j].x, local[i].z); changed = true; }
                    else if (Math.Abs(dx) > 1e-9 && Math.Abs(dx) <= Math.Abs(dz) * tol) { local[j] = (local[i].x, local[j].z); changed = true; }
                }
            if (!changed) return false;
            double c2 = Math.Cos(theta), s2 = Math.Sin(theta);
            var squared = local.Select((p, i) => new V3(p.x * c2 - p.z * s2, v[i].y, p.x * s2 + p.z * c2)).ToList();
            // Drop corners that became collinear duplicates.
            var cleaned = new List<V3>();
            for (int i = 0; i < squared.Count; i++)
            {
                var prev = squared[(i - 1 + squared.Count) % squared.Count]; var p = squared[i]; var next = squared[(i + 1) % squared.Count];
                double cross = (p.x - prev.x) * (next.z - p.z) - (p.z - prev.z) * (next.x - p.x);
                if (Math.Abs(cross) > 1e-4 && (Math.Abs(p.x - prev.x) > 0.05 || Math.Abs(p.z - prev.z) > 0.05)) cleaned.Add(p);
            }
            if (cleaned.Count < 3) return false;
            // Same corner count: openings stay on their walls. Otherwise they cannot be mapped reliably.
            ReshapeFloor(room, cleaned, cleaned.Count == v.Count ? (Func<int, EdgeSource>)Same : k => default);
            return true;
        }

        /// <summary>Creates a room whose outline walls follow the polygon (web coordinates, floor at y).</summary>
        public static Room FromPolygon(string id, string name, IList<V3> polygon, double height, double thickness = 0.12)
        {
            var room = new Room { roomId = id, name = name, dimensions = new V3(1, height, 1), floor = polygon.Select(p => new V3(p.x, 0, p.z)).ToList(), floorCenter = V3.Zero };
            for (int i = 0; i < room.floor.Count; i++)
                room.walls.Add(new Wall { start = room.floor[i], end = room.floor[(i + 1) % room.floor.Count], height = height, thickness = thickness });
            UpdateMetrics(room);
            return room;
        }
    }
}
