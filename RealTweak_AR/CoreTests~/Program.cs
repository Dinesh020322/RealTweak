// Tests for RealTweak.Core (pure C#). Run: dotnet run --project RealTweak_AR/CoreTests~
using System;
using System.Collections.Generic;
using System.Linq;
using RealTweak.Core;

static class Program
{
    static int failures, passes;
    static void Check(bool ok, string name) { if (ok) passes++; else { failures++; Console.WriteLine("FAIL: " + name); } }
    static void Near(double a, double b, double tol, string name) => Check(Math.Abs(a - b) <= tol, $"{name}: {a:0.###} vs {b:0.###}");

    static int Main()
    {
        Codes(); Codec(); Ops(); Merge();
        foreach (var seed in Enumerable.Range(1, 30)) Reconstruct(seed);
        CornerMode(); Align(); FloorsTest();
        Console.WriteLine($"{passes} passed, {failures} failed");
        return failures == 0 ? 0 : 1;
    }

    static void Codes()
    {
        var codes = Enumerable.Range(0, 2000).Select(_ => RoomCode.New()).ToList();
        Check(codes.Distinct().Count() == 2000 && codes.All(RoomCode.IsShort), "codes unique and well formed");
        Check(RoomCode.Normalize(" abcd-efgh ") == "ABCDEFGH", "normalize short code");
        Check(RoomCode.Normalize("1244") == "1244" && RoomCode.Normalize("Ab_cd-1234") == "Ab_cd-1234", "legacy codes keep case");
        Check(RoomCode.Normalize("../x") == null && RoomCode.Normalize("abc") == null, "invalid codes rejected");
        Check(RoomCode.Format("ABCDEFGH") == "ABCD-EFGH", "format");
    }

    static Dictionary<string, object> V(double x, double y, double z) => new Dictionary<string, object> { { "x", x }, { "y", y }, { "z", z } };
    static Dictionary<string, object> Doc()
    {
        var verts = new List<object> { V(-3, 0, -2), V(3, 0, -2), V(3, 0, 2), V(-3, 0, 2) };
        var walls = new List<object>();
        for (int i = 0; i < 4; i++) walls.Add(new Dictionary<string, object> { { "startPoint", verts[i] }, { "endPoint", verts[(i + 1) % 4] }, { "height", 2.7 }, { "thickness", 0.15 }, { "future", "keep" } });
        return new Dictionary<string, object>
        {
            { "roomId", "ABCD2345" }, { "schemaVersion", 2L }, { "name", "Test" }, { "revision", 3L }, { "timestamp", 1000L },
            { "dimensions", V(6, 2.7, 4) }, { "floor", new Dictionary<string, object> { { "vertices", verts }, { "center", V(0, 0, 0) }, { "area", 24.0 } } },
            { "walls", walls },
            { "furniture", new List<object> {
                new Dictionary<string, object> { { "id", "a" }, { "type", "sofa" }, { "position", V(1, 0, 2) }, { "rotation", V(0, 1.2, 0) }, { "scale", V(1, 1, 1) }, { "color", "#112233" }, { "timestamp", 5L }, { "newField", 1L } },
                new Dictionary<string, object> { { "id", "b" }, { "type", "chair" }, { "position", V(0, 0, 0) }, { "rotation", new Dictionary<string, object> { { "x", 0.0 }, { "y", Math.Sin(Math.PI / 8) }, { "z", 0.0 }, { "w", Math.Cos(Math.PI / 8) } } } },
            } },
            { "openings", new List<object> { new Dictionary<string, object> { { "type", "door" }, { "wall", 0L }, { "offset", 0.5 }, { "width", 0.9 } } } },
            { "meshPath", "meshes/ABCD2345.obj" },
        };
    }

    static void Codec()
    {
        var room = RoomCodec.FromDocument(Doc(), "ABCD2345");
        Check(room.furniture.Count == 2 && room.walls.Count == 4 && room.openings.Count == 1, "decode counts");
        Near(room.furniture[1].Yaw, -Math.PI / 4, 1e-9, "legacy quaternion yaw");
        Check(room.furniture[0].extra.ContainsKey("newField") && room.walls[0].extra.ContainsKey("future"), "unknown fields preserved");
        var patch = RoomCodec.Patch(room, 4, 2000);
        var again = RoomCodec.FromDocument(new Dictionary<string, object>(patch) { { "roomId", "ABCD2345" } }, "ABCD2345");
        Check(Canon.Of(RoomCodec.ItemToDict(again.furniture[0])) == Canon.Of(RoomCodec.ItemToDict(room.furniture[0])), "item round trip");
        Check(again.revision == 4 && again.walls[0].extra["future"] as string == "keep", "patch round trip");
        var bad = Doc(); ((List<object>)bad["furniture"]).Add(((List<object>)bad["furniture"])[0]);
        Check(Throws(() => RoomCodec.FromDocument(bad, "X")), "duplicate ids rejected");
        var bad2 = Doc(); bad2["openings"] = new List<object> { new Dictionary<string, object> { { "type", "door" }, { "wall", 9L }, { "offset", 0.5 }, { "width", 0.9 } } };
        Check(Throws(() => RoomCodec.FromDocument(bad2, "X")), "bad opening wall rejected");
        var future = Doc(); future["schemaVersion"] = 3L;
        Check(Throws(() => RoomCodec.FromDocument(future, "X")), "future schema rejected");
    }
    static bool Throws(Action a) { try { a(); return false; } catch (RoomFormatException) { return true; } }

    static void Ops()
    {
        var r = RoomOps.FromPolygon("ABCD2345", "R", new List<V3> { new V3(-3, 0, -2.5), new V3(3, 0, -2.5), new V3(3, 0, 2.5), new V3(-3, 0, 2.5) }, 2.7);
        r.openings.Add(new Opening { type = "door", wall = 1, offset = 0.5, width = 0.9 });
        RoomOps.MoveCorner(r, 1, 4, -2.5);
        Check(r.walls[0].end.x == 4 && r.walls[1].start.x == 4 && r.openings[0].wall == 1, "move corner moves both walls, keeps door");
        Near(r.dimensions.x, 7, 1e-9, "dimensions updated");
        RoomOps.InsertCorner(r, 0, 0.5);
        Check(r.floor.Count == 5 && r.walls.Count == 5 && r.openings[0].wall == 2, "insert corner remaps door");
        RoomOps.RemoveCorner(r, 1);
        Check(r.floor.Count == 4, "remove corner");
        Check(ThrowsEdit(() => RoomOps.MoveCorner(r.Clone(), 1, -4, 0)), "crossing walls rejected");
        var skew = RoomOps.FromPolygon("X", "S", new List<V3> { new V3(0, 0, 0), new V3(4, 0, 0.2), new V3(4.1, 0, 3), new V3(0, 0, 3.1) }, 2.6);
        Check(RoomOps.SquareUp(skew), "square up changes skewed room");
        var v = skew.floor;
        double dot = (v[1].x - v[0].x) * (v[2].x - v[1].x) + (v[1].z - v[0].z) * (v[2].z - v[1].z);
        Near(dot, 0, 1e-6, "square up makes right angles");
        RoomOps.SetCeilingHeight(r, 3.0, t => (0.65, t == "pendant-light" ? "ceiling" : "floor"));
        Check(r.walls.All(w => w.height == 3.0), "ceiling height");
    }
    static bool ThrowsEdit(Action a) { try { a(); return false; } catch (RoomEditException) { return true; } }

    static Item It(string id, string type, double x) => new Item { id = id, type = type, position = new V3(x, 0, 0), rotation = V3.Zero, scale = V3.One, color = "#aaaaaa" };
    static void Merge()
    {
        var b = RoomOps.FromPolygon("ABCD2345", "R", new List<V3> { new V3(-3, 0, -2.5), new V3(3, 0, -2.5), new V3(3, 0, 2.5), new V3(-3, 0, 2.5) }, 2.7);
        b.furniture = new List<Item> { It("chair", "chair", 1), It("sofa", "sofa", 2), It("lamp", "floor-lamp", 3) };
        var local = b.Clone(); var remote = b.Clone();
        local.furniture[0].position = new V3(1.5, 0, 0); local.furniture.Add(It("plant", "plant", 0));
        remote.furniture.RemoveAll(f => f.id == "sofa"); remote.furniture.First(f => f.id == "lamp").color = "#000000"; remote.revision = 5;
        var m = RoomMerge.Merge(b, local, remote);
        Check(m.furniture.First(f => f.id == "chair").position.x == 1.5, "merge keeps local move");
        Check(!m.furniture.Any(f => f.id == "sofa"), "merge keeps remote delete");
        Check(m.furniture.First(f => f.id == "lamp").color == "#000000", "merge keeps remote recolour");
        Check(m.furniture.Any(f => f.id == "plant") && m.revision == 5, "merge keeps local add");
        Check(RoomMerge.HasChanges(m, b) && !RoomMerge.HasChanges(b.Clone(), b), "has changes");
    }

    static void FloorsTest()
    {
        var doc = Doc();
        var level = new Dictionary<string, object>(Doc()) { ["id"] = "first01", ["name"] = "First floor", ["elevation"] = 2.95, ["separate"] = false };
        level["furniture"] = new List<object> { new Dictionary<string, object> { { "id", "bed1" }, { "type", "bed" }, { "position", V(0, 0, 0) }, { "rotation", V(0, 0, 0) } } };
        doc["levels"] = new List<object> { level }; doc["levelName"] = "Downstairs";
        var house = RoomCodec.FromDocument(doc, "ABCD2345");
        Check(Floors.Count(house) == 2 && Floors.Name(house, 0) == "Downstairs" && Floors.Name(house, 1) == "First floor", "floors decoded");
        Near(Floors.Elevation(house, 1), 2.95, 1e-9, "floor elevation");
        var view = Floors.View(house, 1);
        Check(view.furniture.Count == 1 && view.levels == null, "floor view has that floor's furniture");
        view.furniture.Add(It("lamp2", "floor-lamp", 1));
        var edited = Floors.With(house, 1, view);
        Check(edited.levels[0].furniture.Count == 2 && edited.furniture.Count == 2, "write back touches only that floor");
        var roundTrip = RoomCodec.FromDocument(new Dictionary<string, object>(RoomCodec.Patch(edited, 5, 10)) { { "roomId", "ABCD2345" } }, "ABCD2345");
        Check(roundTrip.levels.Count == 1 && roundTrip.levels[0].levelId == "first01" && roundTrip.levels[0].furniture.Count == 2, "floors round trip");
        int idx = Floors.Add(edited, Floors.View(edited, 0), "Second floor", false, "second01");
        Near(Floors.Elevation(edited, idx), 2.95 + 2.7 + 0.25, 1e-9, "new floor stacked on top");
        int garage = Floors.Add(edited, Floors.View(edited, 0), "Garage", true, "garage01");
        Check(Floors.Above(edited, 0) == 1 && Floors.Above(edited, 1) == idx && Floors.Above(edited, garage) == -1 && Floors.Below(edited, idx) == 1, "floor order");
        var stairs = It("st", "stairs", 0);
        Check(Floors.FitStairs(edited, 0, stairs, 2.7, true), "stairs fit"); Near(stairs.scale.y * 2.7, 2.95, 0.01, "stairs reach floor above");
        // Merge: one side adds a floor, the other furnishes an existing floor.
        var local = house.Clone(); var remote = house.Clone();
        Floors.Add(local, Floors.View(local, 0), "Garage", true, "garage02");
        remote.levels[0].furniture.Add(It("desk1", "desk", 2));
        var merged = RoomMerge.Merge(house, local, remote);
        Check(merged.levels.Count == 2 && merged.levels[0].furniture.Count == 2, "floor merge");
        var dupe = Doc(); var lv = new Dictionary<string, object>(Doc()) { ["id"] = "x1" }; dupe["levels"] = new List<object> { lv };
        Check(Throws(() => RoomCodec.FromDocument(dupe, "ABCD2345")), "furniture ids unique across floors");
    }

    // ------------------------------------------------------------------ synthetic scan
    static readonly List<P2> TrueRoom = new List<P2> { new P2(-2.5, -2.25), new P2(2.5, -2.25), new P2(2.5, 0.75), new P2(0.5, 0.75), new P2(0.5, 2.25), new P2(-2.5, 2.25) };
    const double Yaw = 0.4, Tx = 1.3, Tz = -0.7, FloorY = -1.35, Ceiling = 2.6;
    static P2 W(P2 local) => Geo.Rot(local, Yaw).Add(Tx, Tz);

    static ScanGrid Simulate(int seed, bool walls = true)
    {
        var rng = new Random(seed);
        double N() => (rng.NextDouble() + rng.NextDouble() + rng.NextDouble() - 1.5) * 0.03;
        var grid = new ScanGrid { floorY = FloorY };
        void Add(P2 local, double h) { var w = W(new P2(local.x + N(), local.z + N())); grid.AddPoint(w.x, FloorY + h + N(), w.z); }
        // Walls with a door gap on edge 0 and a window on edge 1; 25% of samples missing.
        for (int e = 0; e < TrueRoom.Count && walls; e++)
        {
            var a = TrueRoom[e]; var b = TrueRoom[(e + 1) % TrueRoom.Count]; double len = Geo.Dist(a, b);
            for (double t = 0; t < len; t += 0.03)
                for (int k = 0; k < 3; k++)
                {
                    if (rng.NextDouble() < 0.25) continue;
                    double h = rng.NextDouble() * Ceiling;
                    if (e == 0 && t > 1.0 && t < 1.9) continue;                     // door
                    if (e == 1 && t > 0.8 && t < 2.0 && h > 0.9 && h < 2.1) continue;  // window (glass gives no depth)
                    Add(new P2(a.x + (b.x - a.x) * t / len, a.z + (b.z - a.z) * t / len), h);
                }
        }
        // Through the door: the hallway wall 1.6 m beyond and its floor.
        for (double x = -1.6; x < -0.5; x += 0.04) for (double h = 0.1; h < 2.4; h += 0.15) Add(new P2(x, -3.85), h);
        // Furniture.
        void Block(double x0, double x1, double z0, double z1, double h, double density = 0.04)
        {
            for (double x = x0; x <= x1; x += density) for (double z = z0; z <= z1; z += density) Add(new P2(x, z), h);
            for (double x = x0; x <= x1; x += density) for (double y = 0.1; y < h; y += 0.1) { Add(new P2(x, z0), y); Add(new P2(x, z1), y); }
        }
        Block(-2.4, -0.4, -1.0, 0.6, 0.55);   // bed, head against the x = -2.5 wall
        for (double z = -1.0; z <= 0.6; z += 0.04) for (double y = 0.5; y < 1.0; y += 0.08) Add(new P2(-2.45, z), y); // headboard
        Block(0.3, 2.4, -2.0, -1.3, 0.45);    // sofa seat
        Block(0.3, 2.4, -2.2, -2.0, 0.85);    // sofa back against the back wall
        for (double z = 1.0; z <= 2.2; z += 0.03) for (double y = 0.1; y < 2.0; y += 0.06) Add(new P2(-0.1, z), y); // wardrobe front
        Block(0.4, 2.0, -0.45, 0.45, 0.75);   // dining table
        // Floor coverage except under furniture, and the walking path.
        for (int i = 0; i < 9000; i++)
        {
            var p = new P2(-2.5 + rng.NextDouble() * 5, -2.25 + rng.NextDouble() * 4.5);
            if (!Geo.Inside(p, TrueRoom) || rng.NextDouble() < 0.3) continue;
            if ((p.x > -2.4 && p.x < -0.4 && p.z > -1 && p.z < 0.6) || (p.x > 0.3 && p.x < 2.4 && p.z < -1.3) || (p.x > -0.1 && p.z > 1.0) || (p.x > 0.4 && p.x < 2.0 && Math.Abs(p.z) < 0.45)) continue;
            var w = W(p); grid.AddFloor(w.x, w.z);
        }
        for (double x = -1.6; x < -0.5; x += 0.05) for (double z = -3.8; z < -2.4; z += 0.05) { var w = W(new P2(x, z)); grid.AddFloor(w.x, w.z); }
        foreach (var p in new[] { new P2(-1.5, 1.2), new P2(0, 0.9), new P2(1.5, 0.55), new P2(2.0, -0.8), new P2(0, -0.9), new P2(-1.8, 1.8) }) { var w = W(p); grid.AddTrajectory(w.x, w.z); }
        return grid;
    }

    static (double w, double h, double d) Dims(string type) => type switch
    {
        "bed" => (1.6, 1.0, 2.1), "bed-single" => (1.0, 0.9, 2.05), "bed-king" => (1.95, 1.1, 2.15), "sofa" => (2.1, 0.85, 0.92), "loveseat" => (1.5, 0.85, 0.9),
        "wardrobe" => (1.2, 2.1, 0.6), "wardrobe-large" => (1.8, 2.2, 0.6), "table" => (1.8, 0.75, 0.9), _ => (1, 1, 1),
    };

    static double OutlineError(ScanResult r)
    {
        var world = r.polygon.Select(r.ToWorld).ToList();
        var truth = TrueRoom.Select(W).ToList();
        double PolyDist(P2 p, List<P2> poly) { double d = double.MaxValue; for (int i = 0; i < poly.Count; i++) d = Math.Min(d, Geo.SegDist(p, poly[i], poly[(i + 1) % poly.Count])); return d; }
        return Math.Max(world.Max(p => PolyDist(p, truth)), truth.Max(p => PolyDist(p, world)));
    }

    static void Reconstruct(int seed)
    {
        var grid = Simulate(seed);
        RoomReconstructor.Log = Environment.GetEnvironmentVariable("RT_DEBUG") == "1" && seed == 4 ? Console.WriteLine : null;
        var r = RoomReconstructor.Reconstruct(grid, null, Dims);
        RoomReconstructor.Log = null;
        Check(r.ok, $"seed {seed}: reconstruct ok ({r.message})");
        if (!r.ok) return;
        Check(r.polygon.Count == 6, $"seed {seed}: L-shape has 6 corners (got {r.polygon.Count})");
        Near(Math.Abs(Geo.Area(r.polygon)), 19.5, 0.6, $"seed {seed}: area");
        Near(OutlineError(r), 0, 0.08, $"seed {seed}: outline error");
        double yawErr = Math.Abs(((r.yaw - Yaw) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2)); yawErr = Math.Min(yawErr, Math.PI / 2 - yawErr);
        Near(yawErr, 0, 0.01, $"seed {seed}: wall orientation");
        Near(r.ceiling, Ceiling, 0.1, $"seed {seed}: ceiling");
        Check(r.openings.Count(o => o.type == "door") == 1, $"seed {seed}: one door ({string.Join(",", r.openings.Select(o => o.type + "@" + o.edge + ":" + o.width.ToString("0.00")))})");
        Check(r.openings.Count(o => o.type == "window") == 1, $"seed {seed}: one window");
        var door = r.openings.FirstOrDefault(o => o.type == "door");
        if (door != null) Near(door.width, 0.9, 0.12, $"seed {seed}: door width");
        var types = r.objects.Select(o => o.type).ToList();
        if (Environment.GetEnvironmentVariable("RT_DEBUG") == "1") { foreach (var o in r.objects) Console.WriteLine($"  {o.type} c=({o.center.x:0.00},{o.center.z:0.00}) w={o.width:0.00} d={o.depth:0.00} h={o.height:0.00}"); Console.WriteLine("  poly " + string.Join(" ", r.polygon.Select(p => $"({p.x:0.00},{p.z:0.00})")) + " open " + string.Join(",", r.openings.Select(o => o.type + "@" + o.edge + ":" + o.width.ToString("0.00")))); }
        Check(types.Contains("bed"), $"seed {seed}: bed found ({string.Join(",", types)})");
        Check(types.Contains("sofa"), $"seed {seed}: sofa found");
        Check(types.Contains("table"), $"seed {seed}: table found");
        Check(types.Any(t => t.StartsWith("wardrobe")), $"seed {seed}: wardrobe found");
        var bed = r.objects.FirstOrDefault(o => o.type == "bed");
        if (bed != null) { Near(Math.Max(bed.width, bed.depth), 2.0, 0.2, $"seed {seed}: bed length"); Near(Math.Min(bed.width, bed.depth), 1.6, 0.15, $"seed {seed}: bed width"); }
        var room = ScanToRoom.Build(r, "ABCD2345", "Scan", t => { var d = Dims(t); return (d.w, d.h, d.d, "#888888"); }, () => Guid.NewGuid().ToString("N"), 1);
        var decoded = RoomCodec.FromDocument(new Dictionary<string, object>(RoomCodec.Patch(room, 1, 1)) { { "roomId", "ABCD2345" } }, "ABCD2345");
        Check(decoded.walls.Count == 6 && decoded.openings.Count == r.openings.Count && decoded.furniture.Count == r.objects.Count, $"seed {seed}: scan converts to a valid room");
        // Bed headboard should face away from the x = -2.5 wall, i.e. its front points to +local x.
        if (bed != null) Near(Math.Sin(bed.frontYaw) * Math.Cos(r.yaw - Yaw) , 1, 0.2, $"seed {seed}: bed faces into the room");
    }

    static void CornerMode()
    {
        var grid = Simulate(7, walls: false);
        var corners = TrueRoom.Select(p => W(new P2(p.x + 0.04, p.z - 0.03))).ToList();
        var r = RoomReconstructor.Reconstruct(grid, corners, Dims);
        Check(r.ok && r.polygon.Count == 6, "corner mode outline");
        Near(OutlineError(r), 0, 0.08, "corner mode accuracy");
    }

    static void Align()
    {
        var a = Alignment.TwoPoint(new P2(0, 0), new P2(4, 0), W(new P2(0, 0)), W(new P2(4, 0)));
        Near(a.x, Tx, 1e-9, "two-point x"); Near(a.z, Tz, 1e-9, "two-point z"); Near(Alignment.Normalize(a.yaw - Yaw), 0, 1e-9, "two-point yaw");
        // Re-scan only part of the room in a new session and register the saved outline against it.
        var saved = TrueRoom;
        var newYaw = -1.1; double nx = -0.4, nz = 2.2;
        P2 W2(P2 p) => Geo.Rot(p, newYaw).Add(nx, nz);
        var rescan = new List<P2> { new P2(-2.5, -2.25), new P2(2.5, -2.25), new P2(2.5, 0.75), new P2(0.5, 0.75), new P2(0.5, 1.2), new P2(-2.5, 1.2) }
            .Select(p => W2(new P2(p.x + 0.03, p.z - 0.02))).ToList();
        var reg = Alignment.Register(saved, rescan);
        Check(reg.ok, $"registration ok (inliers {reg.inlierRatio:0.00})");
        Near(Alignment.Normalize(reg.pose.yaw - newYaw), 0, 0.03, "registration yaw");
        Near(reg.pose.x, nx + 0.03 * Math.Cos(newYaw) - 0.02 * Math.Sin(newYaw), 0.08, "registration x");
        Near(reg.pose.z, nz, 0.08, "registration z");
    }
}
