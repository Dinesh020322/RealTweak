// RealTweak "SmartScan" room reconstruction — a RoomPlan-style result without LiDAR.
//
// Any ARCore/ARKit phone produces 3D samples (ARCore depth-from-motion raycasts, feature points,
// plane boundaries, and on LiDAR iPhones the scene mesh). Samples are binned into a 5 cm grid on
// the floor plane, keeping per-cell height statistics. From that grid we:
//   1. find the dominant wall orientation (Manhattan alignment) by maximizing histogram sharpness,
//   2. extract wall lines as histogram peaks with real support length,
//   3. split the plane into rectangles along those lines and flood-fill the room interior from the
//      phone's own walking path, never crossing a well-supported wall (so doorways don't leak),
//   4. trace the outline into a clean rectilinear polygon, estimate the ceiling, find door/window
//      gaps in each wall, and segment remaining blobs into furniture with size-based classification.
// Pure C# so it can be tested outside Unity. Coordinates are Unity world (x right, z forward).
using System;
using System.Collections.Generic;
using System.Linq;

namespace RealTweak.Core
{
    public struct P2 { public double x, z; public P2(double x, double z) { this.x = x; this.z = z; } }

    public sealed class ScanCell
    {
        public int count;
        public float minY = float.MaxValue, maxY = float.MinValue;
        public int low, mid, high; // samples in height bands above the floor: <0.8, 1.0–1.8 (window/door band), >1.9
    }

    public sealed class Surface { public P2 center; public double sizeX, sizeZ, height; public string label; }

    /// <summary>Accumulates scan samples. Feed it from the AR session; it is cheap to update every frame.</summary>
    public sealed class ScanGrid
    {
        public const double Cell = 0.05;
        public double floorY;
        public readonly Dictionary<long, ScanCell> cells = new Dictionary<long, ScanCell>();
        public readonly HashSet<long> floorSeen = new HashSet<long>();
        public readonly List<P2> trajectory = new List<P2>();
        public readonly List<(P2 a, P2 b, double weight)> verticalPlanes = new List<(P2, P2, double)>();
        public readonly List<Surface> surfaces = new List<Surface>();
        public double? ceilingY;
        public int samples;

        public static long Key(int ix, int iz) => ((long)ix << 32) ^ (uint)iz;
        public static int IX(long key) => (int)(key >> 32);
        public static int IZ(long key) => (int)(key & 0xffffffff);
        public static int Bin(double v) => (int)Math.Floor(v / Cell);

        public void AddPoint(double x, double y, double z)
        {
            double rel = y - floorY;
            if (rel < -0.25 || rel > 4.5) return;
            long key = Key(Bin(x), Bin(z));
            samples++;
            if (Math.Abs(rel) < 0.04) { floorSeen.Add(key); return; }
            if (rel < 0.04) return;
            if (!cells.TryGetValue(key, out var c)) cells[key] = c = new ScanCell();
            c.count++;
            if (y < c.minY) c.minY = (float)y;
            if (y > c.maxY) c.maxY = (float)y;
            if (rel < 0.8) c.low++; else if (rel >= 1.0 && rel < 1.8) c.mid++; else if (rel >= 1.9) c.high++;
        }
        public void AddFloor(double x, double z) => floorSeen.Add(Key(Bin(x), Bin(z)));
        public void AddTrajectory(double x, double z)
        {
            if (trajectory.Count == 0 || Math.Abs(trajectory[trajectory.Count - 1].x - x) + Math.Abs(trajectory[trajectory.Count - 1].z - z) > 0.1)
                trajectory.Add(new P2(x, z));
        }
        /// <summary>Independent copy, so reconstruction can run on a worker thread while scanning continues.</summary>
        public ScanGrid Snapshot()
        {
            var copy = new ScanGrid { floorY = floorY, ceilingY = ceilingY, samples = samples };
            foreach (var kv in cells) copy.cells[kv.Key] = new ScanCell { count = kv.Value.count, minY = kv.Value.minY, maxY = kv.Value.maxY, low = kv.Value.low, mid = kv.Value.mid, high = kv.Value.high };
            copy.floorSeen.UnionWith(floorSeen);
            copy.trajectory.AddRange(trajectory);
            copy.verticalPlanes.AddRange(verticalPlanes);
            copy.surfaces.AddRange(surfaces);
            return copy;
        }
        public void Clear() { cells.Clear(); floorSeen.Clear(); trajectory.Clear(); verticalPlanes.Clear(); surfaces.Clear(); samples = 0; ceilingY = null; }
    }

    public sealed class DetectedOpening { public int edge; public double offset, width, sill, height; public string type; }
    public sealed class DetectedObject { public string type; public P2 center; public double width, depth, height, frontYaw, confidence; }

    public sealed class ScanResult
    {
        public bool ok;
        public string message;
        /// <summary>Room frame: world = origin + Rot(yaw) * local. Floor is at floorY.</summary>
        public double yaw, originX, originZ, floorY;
        public List<P2> polygon = new List<P2>();
        public List<bool> edgeSupported = new List<bool>();
        public double ceiling;
        public bool ceilingEstimated;
        public List<DetectedOpening> openings = new List<DetectedOpening>();
        public List<DetectedObject> objects = new List<DetectedObject>();
        public double confidence;

        public P2 ToWorld(P2 local) => Geo.Rot(local, yaw).Add(originX, originZ);
        public P2 ToLocal(P2 world) => Geo.Rot(new P2(world.x - originX, world.z - originZ), -yaw);
    }

    public static class Geo
    {
        /// <summary>Unity yaw rotation in the XZ plane: forward (0,1) rotates to (sin a, cos a).</summary>
        public static P2 Rot(P2 p, double a) { double c = Math.Cos(a), s = Math.Sin(a); return new P2(p.x * c + p.z * s, -p.x * s + p.z * c); }
        public static P2 Add(this P2 p, double x, double z) => new P2(p.x + x, p.z + z);
        public static double Dist(P2 a, P2 b) => Math.Sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
        public static double SegDist(P2 p, P2 a, P2 b)
        {
            double dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
            double t = l2 < 1e-12 ? 0 : Math.Max(0, Math.Min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
            return Dist(p, new P2(a.x + dx * t, a.z + dz * t));
        }
        public static bool Inside(P2 p, IList<P2> v)
        {
            bool hit = false;
            for (int i = 0, j = v.Count - 1; i < v.Count; j = i++)
                if ((v[i].z > p.z) != (v[j].z > p.z) && p.x < (v[j].x - v[i].x) * (p.z - v[i].z) / (v[j].z - v[i].z) + v[i].x) hit = !hit;
            return hit;
        }
        public static double Area(IList<P2> v)
        {
            double s = 0;
            for (int i = 0; i < v.Count; i++) { var p = v[i]; var q = v[(i + 1) % v.Count]; s += p.x * q.z - q.x * p.z; }
            return s / 2;
        }
        public static double Percentile(List<double> values, double q)
        {
            if (values.Count == 0) return 0;
            var s = values.OrderBy(v => v).ToList();
            return s[Math.Max(0, Math.Min(s.Count - 1, (int)Math.Round(q * (s.Count - 1))))];
        }
    }

    public static class RoomReconstructor
    {
        const double C = ScanGrid.Cell;
        /// <summary>Optional diagnostics sink (tests, editor tools).</summary>
        public static Action<string> Log;
        sealed class WallPoint { public P2 p; public double w; }
        sealed class Line { public bool alongZ; public double pos, weight; public List<(double a, double b)> covered = new List<(double, double)>(); }

        // ------------------------------------------------------------------ public API
        public static ScanResult Reconstruct(ScanGrid grid, IList<P2> manualCorners = null, Func<string, (double w, double h, double d)> dims = null)
        {
            var result = new ScanResult { floorY = grid.floorY };
            var wallPts = WallPoints(grid);
            bool manual = manualCorners != null && manualCorners.Count >= 3;
            if (!manual && wallPts.Sum(p => p.w) < 60)
            {
                result.message = "Not enough wall detail yet. Walk slowly along the walls, keeping them in view.";
                return result;
            }
            double yaw = wallPts.Count >= 20 ? DominantYaw(wallPts.Select(p => (p.p, p.w)).ToList()) : manual ? CornerYaw(manualCorners) : 0;
            result.yaw = yaw;
            var lw = wallPts.Select(p => new WallPoint { p = Geo.Rot(p.p, -yaw), w = p.w }).ToList();
            var lines = FindLines(lw);
            List<P2> poly;
            if (manual) poly = PolygonFromCorners(manualCorners.Select(c => Geo.Rot(c, -yaw)).ToList(), lines);
            else poly = PolygonFromEvidence(grid, yaw, lw, lines, out result.message);
            if (poly == null || poly.Count < 3 || Math.Abs(Geo.Area(poly)) < 1.0)
            {
                result.message ??= "Couldn't find a closed room outline yet. Scan every wall, or switch to corner mode.";
                return result;
            }
            if (Geo.Area(poly) < 0) poly.Reverse();

            // Centre the room on its bounding box so the website shows it centred and square.
            double cx = (poly.Min(p => p.x) + poly.Max(p => p.x)) / 2, cz = (poly.Min(p => p.z) + poly.Max(p => p.z)) / 2;
            var origin = Geo.Rot(new P2(cx, cz), yaw);
            result.originX = origin.x; result.originZ = origin.z;
            result.polygon = poly.Select(p => new P2(p.x - cx, p.z - cz)).ToList();
            var localWall = lw.Select(p => new WallPoint { p = new P2(p.p.x - cx, p.p.z - cz), w = p.w }).ToList();
            result.edgeSupported = EdgeSupport(result.polygon, localWall, out double supported);
            result.confidence = supported;
            EstimateCeiling(grid, result);
            DetectOpenings(grid, result);
            DetectObjects(grid, result, dims);
            result.ok = true;
            result.message = supported > 0.75 ? "Room captured." : "Room captured. Some walls had little detail - check the outline before saving.";
            return result;
        }

        /// <summary>Wall lines found so far, in world coordinates, for the live scanning preview.</summary>
        public static List<(P2 a, P2 b)> PreviewWalls(ScanGrid grid)
        {
            var pts = WallPoints(grid);
            var segments = new List<(P2, P2)>();
            if (pts.Count < 20) return segments;
            double yaw = DominantYaw(pts.Select(p => (p.p, p.w)).ToList());
            foreach (var line in FindLines(pts.Select(p => new WallPoint { p = Geo.Rot(p.p, -yaw), w = p.w }).ToList()))
                foreach (var (a, b) in line.covered)
                {
                    var p0 = line.alongZ ? new P2(line.pos, a) : new P2(a, line.pos);
                    var p1 = line.alongZ ? new P2(line.pos, b) : new P2(b, line.pos);
                    segments.Add((Geo.Rot(p0, yaw), Geo.Rot(p1, yaw)));
                }
            return segments;
        }

        // ------------------------------------------------------------------ walls
        static List<WallPoint> WallPoints(ScanGrid grid)
        {
            var list = new List<WallPoint>();
            foreach (var kv in grid.cells)
            {
                var c = kv.Value;
                double top = c.maxY - grid.floorY, span = c.maxY - c.minY;
                bool tall = top >= 1.25 || (c.count >= 3 && span >= 0.7 && top >= 0.9);
                if (!tall) continue;
                list.Add(new WallPoint { p = new P2((ScanGrid.IX(kv.Key) + 0.5) * C, (ScanGrid.IZ(kv.Key) + 0.5) * C), w = Math.Min(c.count, 20) });
            }
            foreach (var (a, b, weight) in grid.verticalPlanes)
            {
                double len = Geo.Dist(a, b);
                int n = Math.Max(1, (int)(len / C));
                for (int i = 0; i <= n; i++)
                    list.Add(new WallPoint { p = new P2(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n), w = weight });
            }
            return list;
        }

        static double Sharpness(List<(P2 p, double w)> pts, double a)
        {
            var hx = new Dictionary<int, double>(); var hz = new Dictionary<int, double>();
            foreach (var (p, w) in pts)
            {
                var r = Geo.Rot(p, -a);
                int bx = ScanGrid.Bin(r.x), bz = ScanGrid.Bin(r.z);
                hx[bx] = (hx.TryGetValue(bx, out var vx) ? vx : 0) + w;
                hz[bz] = (hz.TryGetValue(bz, out var vz) ? vz : 0) + w;
            }
            return hx.Values.Sum(v => v * v) + hz.Values.Sum(v => v * v);
        }

        /// <summary>Yaw in [0, π/2) that best aligns walls with the local axes.</summary>
        public static double DominantYaw(List<(P2 p, double w)> pts)
        {
            if (pts.Count > 6000) { var step = pts.Count / 6000.0; pts = Enumerable.Range(0, 6000).Select(i => pts[(int)(i * step)]).ToList(); }
            double best = 0, bestScore = double.MinValue;
            for (int d = 0; d < 90; d++) { double a = d * Math.PI / 180, s = Sharpness(pts, a); if (s > bestScore) { bestScore = s; best = a; } }
            double coarse = best;
            for (double d = -1; d <= 1.0001; d += 0.1) { double a = coarse + d * Math.PI / 180, s = Sharpness(pts, a); if (s > bestScore) { bestScore = s; best = a; } }
            best %= Math.PI / 2; if (best < 0) best += Math.PI / 2;
            return best;
        }
        static double CornerYaw(IList<P2> corners)
        {
            int longest = 0; double len = 0;
            for (int i = 0; i < corners.Count; i++) { double l = Geo.Dist(corners[i], corners[(i + 1) % corners.Count]); if (l > len) { len = l; longest = i; } }
            var a = corners[longest]; var b = corners[(longest + 1) % corners.Count];
            // Direction of the longest edge becomes the local X axis: Rot(-yaw)*(b-a) ∥ +X.
            double yaw = Math.Atan2(-(b.z - a.z), b.x - a.x);
            yaw %= Math.PI / 2; if (yaw < 0) yaw += Math.PI / 2;
            return yaw;
        }

        static List<Line> FindLines(List<WallPoint> pts)
        {
            var lines = new List<Line>();
            foreach (bool alongZ in new[] { true, false })
            {
                // alongZ: wall runs along local Z, so it is a line x = const.
                var hist = new Dictionary<int, double>();
                foreach (var p in pts) { int b = ScanGrid.Bin(alongZ ? p.p.x : p.p.z); hist[b] = (hist.TryGetValue(b, out var v) ? v : 0) + p.w; }
                if (hist.Count == 0) continue;
                double Smoothed(int b) => (hist.TryGetValue(b - 1, out var l) ? l : 0) + 2 * (hist.TryGetValue(b, out var c) ? c : 0) + (hist.TryGetValue(b + 1, out var r) ? r : 0);
                double max = hist.Keys.Max(b => Smoothed(b));
                var peaks = hist.Keys.Select(b => (b, s: Smoothed(b))).Where(x => x.s >= Math.Max(24, max * 0.06)).OrderByDescending(x => x.s).ToList();
                var taken = new List<int>();
                foreach (var (b, s) in peaks)
                {
                    if (taken.Any(t => Math.Abs(t - b) * C < 0.3)) continue;
                    if (Smoothed(b - 1) > s || Smoothed(b + 1) > s) continue;
                    double center = (b + 0.5) * C;
                    var near = pts.Where(p => Math.Abs((alongZ ? p.p.x : p.p.z) - center) <= 0.08).ToList();
                    double wsum = near.Sum(p => p.w);
                    if (wsum <= 0) continue;
                    double pos = near.Sum(p => (alongZ ? p.p.x : p.p.z) * p.w) / wsum;
                    var along = near.Select(p => ScanGrid.Bin(alongZ ? p.p.z : p.p.x)).Distinct().OrderBy(x => x).ToList();
                    if (along.Count * C < 0.4) continue;
                    var line = new Line { alongZ = alongZ, pos = pos, weight = wsum };
                    // Merge covered bins into intervals, bridging gaps up to 0.35 m (doors stay as gaps > 0.35 m).
                    double start = along[0] * C, end = (along[0] + 1) * C;
                    for (int i = 1; i < along.Count; i++)
                    {
                        double a = along[i] * C;
                        if (a - end <= 0.35) end = a + C; else { line.covered.Add((start, end)); start = a; end = a + C; }
                    }
                    line.covered.Add((start, end));
                    line.covered = line.covered.Where(iv => iv.b - iv.a >= 0.25).ToList();
                    if (line.covered.Count == 0) continue;
                    taken.Add(b); lines.Add(line);
                }
            }
            return lines;
        }

        static double Coverage(Line line, double a, double b)
        {
            if (b <= a) return 0;
            double c = 0;
            foreach (var (s, e) in line.covered) c += Math.Max(0, Math.Min(b, e) - Math.Max(a, s));
            return c / (b - a);
        }

        // ------------------------------------------------------------------ outline
        static List<P2> PolygonFromEvidence(ScanGrid grid, double yaw, List<WallPoint> lw, List<Line> lines, out string message)
        {
            message = null;
            var floor = grid.floorSeen.Select(k => Geo.Rot(new P2((ScanGrid.IX(k) + 0.5) * C, (ScanGrid.IZ(k) + 0.5) * C), -yaw)).ToList();
            var traj = grid.trajectory.Select(p => Geo.Rot(p, -yaw)).ToList();
            var all = floor.Concat(traj).Concat(lw.Select(p => p.p)).ToList();
            if (traj.Count == 0 && floor.Count < 50) { message = "Point the phone at the floor and walk around the room."; return null; }
            double minX = all.Min(p => p.x) - 0.05, maxX = all.Max(p => p.x) + 0.05, minZ = all.Min(p => p.z) - 0.05, maxZ = all.Max(p => p.z) + 0.05;
            var xLines = lines.Where(l => l.alongZ).ToList(); var zLines = lines.Where(l => !l.alongZ).ToList();
            var xs = Cuts(xLines.Select(l => l.pos), minX, maxX); var zs = Cuts(zLines.Select(l => l.pos), minZ, maxZ);
            int nx = xs.Count - 1, nz = zs.Count - 1;
            if (nx < 1 || nz < 1) return null;

            // Evidence per partition rectangle.
            var floorCount = new int[nx, nz]; var trajHit = new bool[nx, nz];
            int Find(List<double> cuts, double v) { int lo = 0, hi = cuts.Count - 2; while (lo < hi) { int mid = (lo + hi + 1) / 2; if (cuts[mid] <= v) lo = mid; else hi = mid - 1; } return lo; }
            foreach (var p in floor) floorCount[Find(xs, p.x), Find(zs, p.z)]++;
            foreach (var p in traj) trajHit[Find(xs, p.x), Find(zs, p.z)] = true;
            bool Candidate(int i, int j)
            {
                double area = (xs[i + 1] - xs[i]) * (zs[j + 1] - zs[j]);
                return trajHit[i, j] || floorCount[i, j] * C * C >= 0.18 * area;
            }
            Line LineAt(List<Line> set, double pos) => set.Where(l => Math.Abs(l.pos - pos) < 1e-9).OrderByDescending(l => l.weight).FirstOrDefault();
            bool Barrier(bool vertical, int i, int j)
            {
                // vertical: boundary x = xs[i] between rect (i-1, j) and (i, j).
                var line = vertical ? LineAt(xLines, xs[i]) : LineAt(zLines, zs[j]);
                if (line == null) return false;
                return vertical ? Coverage(line, zs[j], zs[j + 1]) >= 0.5 : Coverage(line, xs[i], xs[i + 1]) >= 0.5;
            }
            var inside = new bool[nx, nz];
            var queue = new Queue<(int, int)>();
            for (int i = 0; i < nx; i++) for (int j = 0; j < nz; j++) if (trajHit[i, j]) { inside[i, j] = true; queue.Enqueue((i, j)); }
            if (queue.Count == 0)
            {
                int bi = 0, bj = 0; double best = -1;
                for (int i = 0; i < nx; i++) for (int j = 0; j < nz; j++) if (floorCount[i, j] > best) { best = floorCount[i, j]; bi = i; bj = j; }
                inside[bi, bj] = true; queue.Enqueue((bi, bj));
            }
            while (queue.Count > 0)
            {
                var (i, j) = queue.Dequeue();
                void Visit(int ni, int nj, bool blocked)
                {
                    if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || inside[ni, nj] || blocked || !Candidate(ni, nj)) return;
                    inside[ni, nj] = true; queue.Enqueue((ni, nj));
                }
                Visit(i - 1, j, Barrier(true, i, j)); Visit(i + 1, j, Barrier(true, i + 1, j));
                Visit(i, j - 1, Barrier(false, i, j)); Visit(i, j + 1, Barrier(false, i, j + 1));
            }
            // Fill furniture pockets: a wardrobe or bookcase against a wall hides the floor behind it,
            // which would otherwise leave a notch. Small rectangles mostly surrounded by room are room.
            for (int pass = 0; pass < 3; pass++)
            {
                var fill = new List<(int, int)>();
                for (int i = 0; i < nx; i++)
                    for (int j = 0; j < nz; j++)
                    {
                        if (inside[i, j] || Math.Min(xs[i + 1] - xs[i], zs[j + 1] - zs[j]) > 0.9) continue;
                        int n = (i > 0 && inside[i - 1, j] ? 1 : 0) + (i < nx - 1 && inside[i + 1, j] ? 1 : 0) + (j > 0 && inside[i, j - 1] ? 1 : 0) + (j < nz - 1 && inside[i, j + 1] ? 1 : 0);
                        if (n >= 2) fill.Add((i, j));
                    }
                if (fill.Count == 0) break;
                foreach (var (i, j) in fill) inside[i, j] = true;
            }
            return Trace(inside, xs, zs);
        }

        static List<double> Cuts(IEnumerable<double> positions, double min, double max)
        {
            // Wall lines are the cuts; the data extent only closes the grid where no wall was found.
            var lines = new List<double>();
            foreach (var p in positions.Where(p => p > min - 0.01 && p < max + 0.01).OrderBy(p => p))
                if (lines.Count == 0 || p - lines[lines.Count - 1] >= 0.1) lines.Add(p);
            var cuts = new List<double>();
            if (lines.Count == 0 || lines[0] - min > 0.15) cuts.Add(min);
            cuts.AddRange(lines);
            if (lines.Count == 0 || max - lines[lines.Count - 1] > 0.15) cuts.Add(max);
            return cuts;
        }

        /// <summary>Outline of the union of inside rectangles, collinear points removed.</summary>
        static List<P2> Trace(bool[,] inside, List<double> xs, List<double> zs)
        {
            int nx = inside.GetLength(0), nz = inside.GetLength(1);
            bool In(int i, int j) => i >= 0 && j >= 0 && i < nx && j < nz && inside[i, j];
            // Directed boundary edges with the inside on the left (counter-clockwise in x/z).
            var next = new Dictionary<(int, int), List<(int, int)>>();
            void Edge((int, int) a, (int, int) b) { if (!next.TryGetValue(a, out var l)) next[a] = l = new List<(int, int)>(); l.Add(b); }
            for (int i = 0; i < nx; i++)
                for (int j = 0; j < nz; j++)
                {
                    if (!inside[i, j]) continue;
                    if (!In(i, j - 1)) Edge((i, j), (i + 1, j));
                    if (!In(i + 1, j)) Edge((i + 1, j), (i + 1, j + 1));
                    if (!In(i, j + 1)) Edge((i + 1, j + 1), (i, j + 1));
                    if (!In(i - 1, j)) Edge((i, j + 1), (i, j));
                }
            var loops = new List<List<(int, int)>>();
            while (next.Count > 0)
            {
                var start = next.Keys.First(); var loop = new List<(int, int)>(); var cur = start;
                for (int guard = 0; guard < 100000; guard++)
                {
                    loop.Add(cur);
                    if (!next.TryGetValue(cur, out var outs) || outs.Count == 0) break;
                    var to = outs[outs.Count - 1]; outs.RemoveAt(outs.Count - 1);
                    if (outs.Count == 0) next.Remove(cur);
                    cur = to;
                    if (cur == start) break;
                }
                loops.Add(loop);
            }
            var bestLoop = loops.OrderByDescending(l => Math.Abs(Geo.Area(l.Select(p => new P2(xs[p.Item1], zs[p.Item2])).ToList()))).FirstOrDefault();
            if (bestLoop == null) return null;
            var pts = bestLoop.Select(p => new P2(xs[p.Item1], zs[p.Item2])).ToList();
            return Simplify(pts);
        }

        static List<P2> Simplify(List<P2> pts)
        {
            var result = new List<P2>(pts);
            bool changed = true;
            while (changed && result.Count > 3)
            {
                changed = false;
                for (int i = 0; i < result.Count; i++)
                {
                    var a = result[(i - 1 + result.Count) % result.Count]; var b = result[i]; var c = result[(i + 1) % result.Count];
                    double cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
                    if (Math.Abs(cross) < 1e-6 || Geo.Dist(a, b) < 1e-6) { result.RemoveAt(i); changed = true; break; }
                }
            }
            return result;
        }

        static List<P2> PolygonFromCorners(List<P2> corners, List<Line> lines)
        {
            var poly = corners.Select(c => c).ToList();
            double tol = Math.Tan(12 * Math.PI / 180);
            // Square up edges that are nearly axis-aligned, then snap them onto detected wall lines.
            for (int pass = 0; pass < 2; pass++)
                for (int i = 0; i < poly.Count; i++)
                {
                    int j = (i + 1) % poly.Count; var a = poly[i]; var b = poly[j];
                    double dx = b.x - a.x, dz = b.z - a.z;
                    if (Math.Abs(dz) <= Math.Abs(dx) * tol)
                    {
                        double z = (a.z + b.z) / 2;
                        var line = lines.Where(l => !l.alongZ && Math.Abs(l.pos - z) < 0.25).OrderBy(l => Math.Abs(l.pos - z)).FirstOrDefault();
                        if (line != null) z = line.pos;
                        poly[i] = new P2(a.x, z); poly[j] = new P2(b.x, z);
                    }
                    else if (Math.Abs(dx) <= Math.Abs(dz) * tol)
                    {
                        double x = (a.x + b.x) / 2;
                        var line = lines.Where(l => l.alongZ && Math.Abs(l.pos - x) < 0.25).OrderBy(l => Math.Abs(l.pos - x)).FirstOrDefault();
                        if (line != null) x = line.pos;
                        poly[i] = new P2(x, a.z); poly[j] = new P2(x, b.z);
                    }
                }
            return Simplify(poly);
        }

        static List<bool> EdgeSupport(List<P2> poly, List<WallPoint> pts, out double fraction)
        {
            var support = new List<bool>(); double total = 0, good = 0;
            for (int i = 0; i < poly.Count; i++)
            {
                var a = poly[i]; var b = poly[(i + 1) % poly.Count]; double len = Geo.Dist(a, b);
                int bins = Math.Max(1, (int)(len / 0.1)); var hit = new bool[bins];
                foreach (var p in pts)
                {
                    if (Geo.SegDist(p.p, a, b) > 0.12) continue;
                    double t = ((p.p.x - a.x) * (b.x - a.x) + (p.p.z - a.z) * (b.z - a.z)) / (len * len);
                    int k = (int)(t * bins); if (k >= 0 && k < bins) hit[k] = true;
                }
                double f = hit.Count(h => h) / (double)bins;
                support.Add(f >= 0.4); total += len; good += len * f;
            }
            fraction = total > 0 ? good / total : 0;
            return support;
        }

        // ------------------------------------------------------------------ ceiling, openings, objects
        static IEnumerable<(P2 local, ScanCell cell)> LocalCells(ScanGrid grid, ScanResult r)
        {
            foreach (var kv in grid.cells)
                yield return (r.ToLocal(new P2((ScanGrid.IX(kv.Key) + 0.5) * C, (ScanGrid.IZ(kv.Key) + 0.5) * C)), kv.Value);
        }

        static void EstimateCeiling(ScanGrid grid, ScanResult r)
        {
            if (grid.ceilingY.HasValue && grid.ceilingY.Value - grid.floorY > 2.0) { r.ceiling = Math.Round((grid.ceilingY.Value - grid.floorY) / 0.05) * 0.05; return; }
            var tops = new List<double>();
            foreach (var (p, c) in LocalCells(grid, r))
            {
                double d = double.MaxValue;
                for (int i = 0; i < r.polygon.Count; i++) d = Math.Min(d, Geo.SegDist(p, r.polygon[i], r.polygon[(i + 1) % r.polygon.Count]));
                if (d <= 0.2) tops.Add(c.maxY - grid.floorY);
            }
            double top = Geo.Percentile(tops, 0.97);
            if (tops.Count >= 30 && top >= 2.15) { r.ceiling = Math.Min(4.5, Math.Round(top / 0.05) * 0.05); }
            else { r.ceiling = 2.6; r.ceilingEstimated = true; }
        }

        static void DetectOpenings(ScanGrid grid, ScanResult r)
        {
            var cells = LocalCells(grid, r).ToList();
            for (int e = 0; e < r.polygon.Count; e++)
            {
                if (!r.edgeSupported[e]) continue;
                var a = r.polygon[e]; var b = r.polygon[(e + 1) % r.polygon.Count]; double len = Geo.Dist(a, b);
                if (len < 1.2) continue;
                double ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
                int bins = (int)(len / C);
                var low = new bool[bins]; var mid = new bool[bins]; var beyond = new bool[bins];
                foreach (var (p, c) in cells)
                {
                    double t = (p.x - a.x) * ux + (p.z - a.z) * uz, n = (p.x - a.x) * uz - (p.z - a.z) * ux; // n > 0: outside (polygon is CCW)
                    int k = (int)(t / C); if (k < 0 || k >= bins) continue;
                    if (Math.Abs(n) <= 0.12) { if (c.low > 0) low[k] = true; if (c.mid > 0) mid[k] = true; }
                    else if (n > 0.2 && n < 2.5) beyond[k] = true;
                }
                int longestGap = 0, run = 0;
                foreach (var m in mid) { run = m ? 0 : run + 1; longestGap = Math.Max(longestGap, run); }
                Log?.Invoke($"edge {e}: len {len:0.00} mid {new string(mid.Select(m => m ? '#' : '.').ToArray())}");
                Log?.Invoke($"edge {e}:          low {new string(low.Select(m => m ? '#' : '.').ToArray())}");
                if (mid.Count(x => x) < (bins - longestGap) * 0.6) continue; // wall not scanned well enough to trust gaps
                bool Side(int from, int to, bool[] evidence) => Enumerable.Range(Math.Max(0, from), Math.Max(0, Math.Min(bins, to) - Math.Max(0, from))).Count(k => evidence[k]) >= 4;
                double Snap(double w) => Math.Round(w / 0.05) * 0.05;
                // Doors: no wall at any height (bins with low or mid samples are wall), and we saw through.
                var any = Enumerable.Range(0, bins).Select(k => low[k] || mid[k]).ToArray();
                var doorBins = new bool[bins];
                for (int i0 = 0; i0 < bins;)
                {
                    if (any[i0]) { i0++; continue; }
                    int i1 = i0; while (i1 < bins && !any[i1]) i1++;
                    double width = (i1 - i0) * C;
                    int beyondHits = Enumerable.Range(i0, i1 - i0).Count(k => beyond[k]);
                    if (width >= 0.65 && width <= 1.35 && Side(i0 - 8, i0, any) && Side(i1, i1 + 8, any) && beyondHits >= (i1 - i0) * 0.3)
                    {
                        r.openings.Add(new DetectedOpening { edge = e, offset = (i0 + i1) / 2.0 * C / len, width = Snap(width), type = "door", height = Math.Min(2.1, r.ceiling - 0.1) });
                        for (int k = i0; k < i1; k++) doorBins[k] = true;
                    }
                    i0 = i1;
                }
                // Windows: wall below the sill but nothing (glass) in the 1.0–1.8 m band.
                for (int i0 = 0; i0 < bins;)
                {
                    if (mid[i0] || doorBins[i0]) { i0++; continue; }
                    int i1 = i0; while (i1 < bins && !mid[i1] && !doorBins[i1]) i1++;
                    double width = (i1 - i0) * C;
                    int lowHits = Enumerable.Range(i0, i1 - i0).Count(k => low[k]);
                    if (width >= 0.5 && width <= 2.6 && lowHits >= (i1 - i0) * 0.35 && Side(i0 - 8, i0, mid) && Side(i1, i1 + 8, mid))
                        r.openings.Add(new DetectedOpening { edge = e, offset = (i0 + i1) / 2.0 * C / len, width = Snap(width), type = "window", sill = 0.9, height = Math.Min(1.2, r.ceiling - 1.0) });
                    i0 = i1;
                }
            }
        }

        static void DetectObjects(ScanGrid grid, ScanResult r, Func<string, (double w, double h, double d)> dims)
        {
            // Occupied cells inside the room (away from the walls) between 12 cm and 2.3 m.
            var occ = new Dictionary<(int, int), double>();
            foreach (var (p, c) in LocalCells(grid, r))
            {
                double top = c.maxY - grid.floorY;
                if (top < 0.12 || top > 2.3 || !Geo.Inside(p, r.polygon)) continue;
                double wallDist = double.MaxValue;
                for (int i = 0; i < r.polygon.Count; i++) wallDist = Math.Min(wallDist, Geo.SegDist(p, r.polygon[i], r.polygon[(i + 1) % r.polygon.Count]));
                if (wallDist < 0.15 || (c.count < 2 && top < 0.4)) continue;
                var key = ((int)Math.Floor(p.x / C), (int)Math.Floor(p.z / C));
                occ[key] = Math.Max(occ.TryGetValue(key, out var v) ? v : 0, top);
            }
            var seen = new HashSet<(int, int)>();
            foreach (var start in occ.Keys.ToList())
            {
                if (seen.Contains(start)) continue;
                var comp = new List<(int, int)>(); var q = new Queue<(int, int)>(); q.Enqueue(start); seen.Add(start);
                while (q.Count > 0)
                {
                    var (x, z) = q.Dequeue(); comp.Add((x, z));
                    for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++)
                        {
                            var n = (x + dx, z + dz);
                            if (occ.ContainsKey(n) && seen.Add(n)) q.Enqueue(n);
                        }
                }
                if (comp.Count * C * C < 0.06) continue;
                var xsv = comp.Select(c => (c.Item1 + 0.5) * C).ToList(); var zsv = comp.Select(c => (c.Item2 + 0.5) * C).ToList();
                double x0 = Geo.Percentile(xsv, 0.03) - C / 2, x1 = Geo.Percentile(xsv, 0.97) + C / 2, z0 = Geo.Percentile(zsv, 0.03) - C / 2, z1 = Geo.Percentile(zsv, 0.97) + C / 2;
                double h = Geo.Percentile(comp.Select(c => occ[c]).ToList(), 0.9);
                if (h >= 1.2)
                {
                    // Tall pieces against a wall usually only show their front: extend them back to the wall
                    // behind their thin side.
                    var mid = new P2((x0 + x1) / 2, (z0 + z1) / 2);
                    if (x1 - x0 < z1 - z0)
                    {
                        double l = DistToWall(r, new P2(x0, mid.z), -1, 0), rr = DistToWall(r, new P2(x1, mid.z), 1, 0);
                        if (Math.Min(l, rr) <= 0.9) { if (l < rr) x0 -= l; else x1 += rr; }
                    }
                    else
                    {
                        double b = DistToWall(r, new P2(mid.x, z0), 0, -1), f = DistToWall(r, new P2(mid.x, z1), 0, 1);
                        if (Math.Min(b, f) <= 0.9) { if (b < f) z0 -= b; else z1 += f; }
                    }
                }
                double ex = x1 - x0, ez = z1 - z0;
                if (ex < 0.2 || ez < 0.2) continue;
                var center = new P2((x0 + x1) / 2, (z0 + z1) / 2);
                // A detected horizontal surface (table top, bed, seat) refines the height.
                foreach (var s in grid.surfaces)
                {
                    var sl = r.ToLocal(s.center);
                    if (sl.x > x0 && sl.x < x1 && sl.z > z0 && sl.z < z1 && s.height - grid.floorY > 0.25) h = Math.Max(h * 0.7, s.height - grid.floorY);
                }
                // Facing: away from the nearest wall if it is close, else along the long side.
                double dLeft = DistToWall(r, new P2(x0, center.z), -1, 0), dRight = DistToWall(r, new P2(x1, center.z), 1, 0);
                double dBack = DistToWall(r, new P2(center.x, z0), 0, -1), dFront = DistToWall(r, new P2(center.x, z1), 0, 1);
                double nearest = Math.Min(Math.Min(dLeft, dRight), Math.Min(dBack, dFront));
                bool nearWall = nearest < 0.45;
                double frontYaw;
                if (nearWall) frontYaw = nearest == dBack ? 0 : nearest == dFront ? Math.PI : nearest == dLeft ? Math.PI / 2 : -Math.PI / 2;
                else frontYaw = ex >= ez ? 0 : Math.PI / 2;
                bool frontAlongZ = Math.Abs(Math.Cos(frontYaw)) > 0.5;
                double width = frontAlongZ ? ex : ez, depth = frontAlongZ ? ez : ex;
                string label = grid.surfaces.Where(s => { var sl = r.ToLocal(s.center); return sl.x > x0 && sl.x < x1 && sl.z > z0 && sl.z < z1; }).Select(s => s.label).FirstOrDefault(l => !string.IsNullOrEmpty(l));
                double flat = comp.Count(c => Math.Abs(occ[c] - h) <= 0.08) / (double)comp.Count;
                var (type, conf) = Classify(Math.Max(ex, ez), Math.Min(ex, ez), h, nearWall, label, flat);
                if (type == null) continue;
                if (dims != null && !nearWall)
                {
                    // Free-standing: orient so the catalog model's long side matches the object's long side.
                    var d = dims(type);
                    bool modelWide = d.w >= d.d, objectWide = width >= depth;
                    if (modelWide != objectWide) { frontYaw += Math.PI / 2; (width, depth) = (depth, width); }
                }
                r.objects.Add(new DetectedObject { type = type, center = center, width = width, depth = depth, height = h, frontYaw = frontYaw, confidence = conf });
            }
        }

        static double DistToWall(ScanResult r, P2 from, double dx, double dz)
        {
            // Distance along a ray to the outline.
            double best = double.MaxValue;
            for (int i = 0; i < r.polygon.Count; i++)
            {
                var a = r.polygon[i]; var b = r.polygon[(i + 1) % r.polygon.Count];
                double ex = b.x - a.x, ez = b.z - a.z, den = dx * ez - dz * ex;
                if (Math.Abs(den) < 1e-9) continue;
                double t = ((a.x - from.x) * ez - (a.z - from.z) * ex) / den, u = ((a.x - from.x) * dz - (a.z - from.z) * dx) / den;
                if (t >= -0.05 && u >= 0 && u <= 1) best = Math.Min(best, Math.Max(0, t));
            }
            return best;
        }

        /// <summary>Size-based furniture classification (long side, short side, height in meters).</summary>
        /// <param name="flat">Share of the footprint at the top height: tables ≈ 1, sofas (seat + back) much lower.</param>
        public static (string type, double confidence) Classify(double L, double S, double h, bool nearWall, string label = null, double flat = 0.5)
        {
            if (label == "table" && h > 0.55 && h < 1.0) return (L > 1.3 && S < 0.8 && nearWall ? "desk" : "table", 0.85);
            if (label == "seat") return (L >= 1.3 ? "sofa" : "chair", 0.8);
            if (h < 0.15) return (null, 0);
            if (S >= 0.85 && L >= 1.75 && h >= 0.3 && h <= 1.3) return (S >= 1.85 ? "bed-king" : S >= 1.25 ? "bed" : "bed-single", 0.75);
            if (h >= 1.6 && S >= 0.45 && S <= 0.8 && L >= 0.55 && L <= 0.95 && L / S < 1.6) return ("fridge", 0.5);
            if (h >= 1.55 && S >= 0.45 && S <= 0.8 && L >= 0.8) return (L >= 1.6 ? "wardrobe-large" : "wardrobe", 0.65);
            if (h >= 1.1 && S <= 0.45 && L >= 0.5) return ("bookshelf", 0.65);
            if (L >= 1.3 && L <= 3.4 && S >= 0.65 && S <= 1.15 && h >= 0.55 && h <= 1.15 && flat < 0.6) return (L < 1.75 ? "loveseat" : "sofa", 0.65);
            if (h >= 0.65 && h <= 0.85 && L >= 1.0 && S >= 0.45 && S <= 0.8 && nearWall) return ("desk", 0.6);
            if (h >= 0.65 && h <= 0.95 && S >= 0.5 && S <= 0.7 && L >= 0.55 && nearWall) return (L >= 1.0 ? "cabinet-double" : "cabinet", 0.55);
            if (h >= 0.62 && h <= 0.85 && L >= 0.75 && S >= 0.55) return (L / S < 1.25 && L < 1.3 ? "table-round" : "table", 0.65);
            if (h >= 0.65 && h <= 1.15 && L >= 0.7 && L <= 1.05 && S >= 0.65) return ("armchair", 0.55);
            if (h >= 0.7 && h <= 1.2 && L <= 0.7) return ("chair", 0.55);
            if (h >= 0.28 && h <= 0.55 && L >= 0.65 && L <= 1.6 && S >= 0.4) return ("coffee-table", 0.55);
            if (h >= 0.4 && h <= 0.7 && L <= 0.65) return (nearWall ? "nightstand" : "side-table", 0.5);
            if (h >= 0.6 && h <= 1.9 && L <= 0.55 && S >= 0.2) return ("plant", 0.35);
            return ("object-box", 0.3);
        }
    }
}
