// Placing a saved room back onto the real room in a new AR session.
//  • TwoPoint: the user taps two known corners on the floor.
//  • Register ("Smart align"): a quick re-scan is matched against the saved outline by trying every
//    corner pairing and 90° rotation, then refined with ICP. Works without cloud anchors or LiDAR.
// Poses are Unity world: world = origin + Rot(yaw) * local, local = room-local Unity coordinates.
using System;
using System.Collections.Generic;
using System.Linq;

namespace RealTweak.Core
{
    public struct Pose2 { public double x, z, yaw; public Pose2(double x, double z, double yaw) { this.x = x; this.z = z; this.yaw = yaw; } }

    public sealed class RegistrationResult
    {
        public bool ok;
        public Pose2 pose;
        public double error, inlierRatio;
        /// <summary>Other plausible poses (symmetric rooms). Offer "Rotate 180°" from these.</summary>
        public List<Pose2> alternatives = new List<Pose2>();
    }

    public static class Alignment
    {
        /// <summary>Room-local Unity coordinates of a web-space room vertex.</summary>
        public static P2 LocalOf(V3 web) => new P2(web.x, -web.z);

        public static Pose2 TwoPoint(P2 localA, P2 localB, P2 worldA, P2 worldB)
        {
            // Yaw such that Rot(yaw) * (localB - localA) is parallel to (worldB - worldA).
            double la = Math.Atan2(localB.x - localA.x, localB.z - localA.z), wa = Math.Atan2(worldB.x - worldA.x, worldB.z - worldA.z);
            double yaw = wa - la;
            // Average both anchor points so tap error is split.
            var ra = Geo.Rot(localA, yaw); var rb = Geo.Rot(localB, yaw);
            double x = ((worldA.x - ra.x) + (worldB.x - rb.x)) / 2, z = ((worldA.z - ra.z) + (worldB.z - rb.z)) / 2;
            return new Pose2(x, z, Normalize(yaw));
        }

        public static double Normalize(double a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }

        static List<P2> Sample(IList<P2> poly, double step = 0.1)
        {
            var pts = new List<P2>();
            for (int i = 0; i < poly.Count; i++)
            {
                var a = poly[i]; var b = poly[(i + 1) % poly.Count]; double len = Geo.Dist(a, b);
                int n = Math.Max(1, (int)(len / step));
                for (int k = 0; k < n; k++) pts.Add(new P2(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n));
            }
            return pts;
        }
        static double PolyDist(P2 p, IList<P2> poly)
        {
            double d = double.MaxValue;
            for (int i = 0; i < poly.Count; i++) d = Math.Min(d, Geo.SegDist(p, poly[i], poly[(i + 1) % poly.Count]));
            return d;
        }
        static P2 Closest(P2 p, IList<P2> poly)
        {
            double best = double.MaxValue; P2 q = p;
            for (int i = 0; i < poly.Count; i++)
            {
                var a = poly[i]; var b = poly[(i + 1) % poly.Count];
                double dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
                double t = l2 < 1e-12 ? 0 : Math.Max(0, Math.Min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
                var c = new P2(a.x + dx * t, a.z + dz * t); double d = Geo.Dist(p, c);
                if (d < best) { best = d; q = c; }
            }
            return q;
        }

        /// <summary>
        /// Finds the pose of the saved room (polygon in room-local coords) from a partial scan
        /// (polygon in world coords, e.g. ScanResult.polygon mapped through ToWorld).
        /// </summary>
        public static RegistrationResult Register(IList<P2> savedLocal, IList<P2> scannedWorld)
        {
            var result = new RegistrationResult();
            if (savedLocal.Count < 3 || scannedWorld.Count < 3) return result;
            var probe = Sample(scannedWorld, 0.15);
            var candidates = new List<(Pose2 pose, double score)>();
            // Edge directions in the scan give the rotation candidates (± multiples of 90° for square rooms).
            double scanDir = DominantDirection(scannedWorld), savedDir = DominantDirection(savedLocal);
            for (int k = 0; k < 4; k++)
            {
                double yaw = Normalize(scanDir - savedDir + k * Math.PI / 2);
                var rotated = savedLocal.Select(p => Geo.Rot(p, yaw)).ToList();
                foreach (var s in rotated)
                    foreach (var w in scannedWorld)
                    {
                        var pose = new Pose2(w.x - s.x, w.z - s.z, yaw);
                        var placed = rotated.Select(p => new P2(p.x + pose.x, p.z + pose.z)).ToList();
                        double score = probe.Count(p => PolyDist(p, placed) < 0.15) / (double)probe.Count;
                        candidates.Add((pose, score));
                    }
            }
            var top = candidates.OrderByDescending(c => c.score).Take(8).Select(c => Refine(savedLocal, scannedWorld, c.pose)).OrderBy(r => r.error).ToList();
            var best = top[0];
            result.ok = best.inliers >= 0.6;
            result.pose = best.pose; result.error = best.error; result.inlierRatio = best.inliers;
            foreach (var t in top.Skip(1))
                if (t.inliers >= 0.6 && Math.Abs(Normalize(t.pose.yaw - best.pose.yaw)) > 0.5 && !result.alternatives.Any(a => Math.Abs(Normalize(a.yaw - t.pose.yaw)) < 0.2))
                    result.alternatives.Add(t.pose);
            return result;
        }

        static double DominantDirection(IList<P2> poly)
        {
            int longest = 0; double len = 0;
            for (int i = 0; i < poly.Count; i++) { double l = Geo.Dist(poly[i], poly[(i + 1) % poly.Count]); if (l > len) { len = l; longest = i; } }
            var a = poly[longest]; var b = poly[(longest + 1) % poly.Count];
            return Math.Atan2(b.x - a.x, b.z - a.z);
        }

        /// <summary>Point-to-outline ICP (rotation + translation) over the scan samples.</summary>
        static (Pose2 pose, double error, double inliers) Refine(IList<P2> savedLocal, IList<P2> scannedWorld, Pose2 pose)
        {
            var probe = Sample(scannedWorld, 0.1);
            for (int iter = 0; iter < 25; iter++)
            {
                var placed = savedLocal.Select(p => Geo.Rot(p, pose.yaw).Add(pose.x, pose.z)).ToList();
                var pairs = probe.Select(p => (p, q: Closest(p, placed))).Where(x => Geo.Dist(x.p, x.q) < 0.5).ToList();
                if (pairs.Count < 6) break;
                // Best rigid transform taking matched outline points (q) onto scan points (p).
                double mpx = pairs.Average(x => x.p.x), mpz = pairs.Average(x => x.p.z), mqx = pairs.Average(x => x.q.x), mqz = pairs.Average(x => x.q.z);
                double sxx = 0, sxz = 0;
                foreach (var (p, q) in pairs)
                {
                    double qx = q.x - mqx, qz = q.z - mqz, px = p.x - mpx, pz = p.z - mpz;
                    sxx += qx * px + qz * pz; sxz += qx * pz - qz * px;
                }
                double dTheta = Math.Atan2(sxz, sxx); // standard CCW angle in (x,z)
                double dYaw = -dTheta;                // Unity yaw is clockwise-positive in (x,z)
                var c = Geo.Rot(new P2(mqx - pose.x, mqz - pose.z), dYaw);
                var next = new Pose2(mpx - c.x, mpz - c.z, Normalize(pose.yaw + dYaw));
                bool converged = Math.Abs(next.x - pose.x) + Math.Abs(next.z - pose.z) < 1e-4 && Math.Abs(dYaw) < 1e-5;
                pose = next;
                if (converged) break;
            }
            var final = savedLocal.Select(p => Geo.Rot(p, pose.yaw).Add(pose.x, pose.z)).ToList();
            var dists = probe.Select(p => PolyDist(p, final)).ToList();
            double inliers = dists.Count(d => d < 0.12) / (double)dists.Count;
            double error = dists.Where(d => d < 0.3).DefaultIfEmpty(1).Average();
            return (pose, error, inliers);
        }
    }

    /// <summary>Builds the shared room document from a scan result.</summary>
    public static class ScanToRoom
    {
        public static Room Build(ScanResult scan, string id, string name, Func<string, (double w, double h, double d, string color)> catalog, Func<string> newId, long now)
        {
            // Local Unity (x, z) → web (x, -z).
            var polygon = scan.polygon.Select(p => new V3(p.x, 0, -p.z)).ToList();
            var room = RoomOps.FromPolygon(id, name, polygon, scan.ceiling);
            room.source = "scan";
            foreach (var o in scan.openings)
                room.openings.Add(new Opening { type = o.type, wall = o.edge, offset = o.offset, width = Math.Min(o.width, room.walls[o.edge].Length - 0.05), height = o.height > 0 ? o.height : (double?)null, sill = o.type == "window" ? o.sill : (double?)null, source = "scan" });
            room.openings = room.openings.Where(o => o.width >= 0.3 && o.offset * room.walls[o.wall].Length - o.width / 2 >= -0.01 && o.offset * room.walls[o.wall].Length + o.width / 2 <= room.walls[o.wall].Length + 0.01).ToList();
            foreach (var obj in scan.objects)
            {
                var def = catalog(obj.type);
                if (def.w <= 0) continue;
                // Local front (sin a, cos a) → web front (sin a, -cos a) → web yaw atan2(fx, fz).
                double webYaw = Math.Atan2(Math.Sin(obj.frontYaw), -Math.Cos(obj.frontYaw));
                room.furniture.Add(new Item
                {
                    id = newId(), type = obj.type, color = def.color, source = "scan", timestamp = now,
                    position = new V3(obj.center.x, 0, -obj.center.z),
                    rotation = new V3(0, webYaw, 0),
                    scale = new V3(Clamp(obj.width / def.w), Clamp(obj.height / def.h), Clamp(obj.depth / def.d)),
                });
            }
            return room;
        }
        static double Clamp(double s) => Math.Max(0.3, Math.Min(3, double.IsNaN(s) ? 1 : s));
    }
}
