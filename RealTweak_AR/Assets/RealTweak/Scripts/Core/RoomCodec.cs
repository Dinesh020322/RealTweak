// Converts between Firestore documents (Dictionary/List trees) and the Room model,
// with the same validation limits as the website (src/model.js).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace RealTweak.Core
{
    public static class RoomCode
    {
        public const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        static readonly Regex Short = new Regex("^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$");
        static readonly Regex Legacy = new Regex("^[A-Za-z0-9_-]{4,64}$");

        /// <summary>8 random characters without look-alikes (no 0/O, 1/I/L), uniformly distributed.</summary>
        public static string New()
        {
            var chars = new char[8];
            var buffer = new byte[16];
            int n = 0;
            using (var rng = RandomNumberGenerator.Create())
            {
                while (n < 8)
                {
                    rng.GetBytes(buffer);
                    foreach (var b in buffer) if (b < 248 && n < 8) chars[n++] = Alphabet[b % 31];
                }
            }
            return new string(chars);
        }

        /// <summary>Normalizes typed input: short codes are case-insensitive; legacy codes keep their case. Returns null if invalid.</summary>
        public static string Normalize(string input)
        {
            if (input == null) return null;
            var raw = input.Trim();
            var compact = Regex.Replace(raw, "[\\s-]", "");
            if (compact.Length == 8 && Short.IsMatch(compact.ToUpperInvariant())) return compact.ToUpperInvariant();
            return Legacy.IsMatch(raw) ? raw : null;
        }
        public static bool IsShort(string code) => code != null && Short.IsMatch(code);
        public static string Format(string code) => IsShort(code) ? code.Substring(0, 4) + "-" + code.Substring(4) : code;
    }

    public class RoomFormatException : Exception { public RoomFormatException(string m) : base(m) { } }

    public static class RoomCodec
    {
        static readonly Regex IdPattern = new Regex("^[\\w-]{1,100}$");
        static readonly Regex TypePattern = new Regex("^[\\w-]{1,40}$");
        static readonly Regex Hex = new Regex("^#[0-9a-fA-F]{6}$");
        static readonly HashSet<string> ItemKeys = new HashSet<string> { "id", "type", "position", "rotation", "scale", "color", "timestamp", "label", "source" };
        static readonly HashSet<string> WallKeys = new HashSet<string> { "startPoint", "endPoint", "height", "thickness" };

        // ------------------------------------------------------------------ reading
        public static Room FromDocument(IDictionary<string, object> d, string id)
        {
            if (d == null) throw new RoomFormatException("Empty room document.");
            if (d.TryGetValue("schemaVersion", out var sv) && Num(sv, "schema") > 2) throw new RoomFormatException("This room was saved by a newer version. Update the app.");
            var r = new Room
            {
                roomId = id,
                name = Str(d, "name", "Scanned room", 80),
                revision = (long)Opt(d, "revision", 0),
                timestamp = (long)Opt(d, "timestamp", 0),
                source = d.TryGetValue("source", out var src) ? src as string : null,
                meshPath = d.TryGetValue("meshPath", out var mp) ? mp as string : null,
                scan = d.TryGetValue("scan", out var sc) ? sc as Dictionary<string, object> : null,
            };
            var ids = new HashSet<string>();
            ParseGeometry(d, r, ids);
            if (d.TryGetValue("levelName", out var ln) && ln is string lns && lns.Length > 0) r.levelName = lns.Length > 40 ? lns.Substring(0, 40) : lns;
            if (d.TryGetValue("levels", out var lv))
            {
                var list = List(lv, "levels");
                if (list.Count > 11) throw new RoomFormatException("A project can have up to 12 floors and plans.");
                var levelIds = new HashSet<string>();
                r.levels = list.Select(x =>
                {
                    var ld = x as IDictionary<string, object> ?? throw new RoomFormatException("Invalid floor.");
                    var lid = Get(ld, "id") as string;
                    if (lid == null || !IdPattern.IsMatch(lid) || !levelIds.Add(lid)) throw new RoomFormatException("Floor IDs must be unique.");
                    var level = new Room { roomId = id, levelId = lid, name = Str(ld, "name", "Floor", 40), elevation = Range(Opt(ld, "elevation", 0), -20, 200, "floor elevation"), separate = ld.TryGetValue("separate", out var sep) && sep is bool sb && sb };
                    ParseGeometry(ld, level, ids);
                    return level;
                }).ToList();
            }
            return r;
        }

        static void ParseGeometry(IDictionary<string, object> d, Room r, HashSet<string> ids)
        {
            r.dimensions = Vec(Get(d, "dimensions"), "dimensions", 0, 100);
            var floor = Get(d, "floor") as IDictionary<string, object> ?? throw new RoomFormatException("Missing floor.");
            var verts = List(Get(floor, "vertices"), "floor vertices");
            if (verts.Count < 3 || verts.Count > 500) throw new RoomFormatException("A floor needs 3-500 vertices.");
            r.floor = verts.Select(v => Vec(v, "floor vertex")).ToList();
            r.floorCenter = floor.TryGetValue("center", out var c) ? Vec(c, "floor center") : V3.Zero;
            if (RoomOps.Area(r.floor) < 0.1) throw new RoomFormatException("The floor has no usable area.");
            r.walls = List(Opt(d, "walls"), "walls").Select(w =>
            {
                var wd = w as IDictionary<string, object> ?? throw new RoomFormatException("Invalid wall.");
                var wall = new Wall
                {
                    start = Vec(Get(wd, "startPoint"), "wall start"),
                    end = Vec(Get(wd, "endPoint"), "wall end"),
                    height = Range(Num(Get(wd, "height"), "wall height"), 0.1, 20, "wall height"),
                    thickness = wd.TryGetValue("thickness", out var t) ? Range(Num(t, "thickness"), 0.01, 2, "wall thickness") : 0.15,
                };
                foreach (var kv in wd) if (!WallKeys.Contains(kv.Key)) wall.extra[kv.Key] = kv.Value;
                return wall;
            }).ToList();
            r.furniture = List(Opt(d, "furniture"), "furniture").Select(f =>
            {
                var fd = f as IDictionary<string, object> ?? throw new RoomFormatException("Invalid furniture.");
                var id = Get(fd, "id") as string;
                if (id == null || !IdPattern.IsMatch(id) || !ids.Add(id)) throw new RoomFormatException("Furniture IDs must be unique.");
                var type = Get(fd, "type") as string;
                if (type == null || !TypePattern.IsMatch(type)) throw new RoomFormatException("Invalid furniture type.");
                var item = new Item
                {
                    id = id, type = type,
                    position = Vec(Get(fd, "position"), "position"),
                    rotation = Rotation(Get(fd, "rotation")),
                    scale = fd.TryGetValue("scale", out var s) ? Vec(s, "scale", 0.05, 20) : V3.One,
                    color = fd.TryGetValue("color", out var col) && col is string cs && Hex.IsMatch(cs) ? cs : null,
                    timestamp = fd.TryGetValue("timestamp", out var ts) ? (long)Num(ts, "timestamp") : 0,
                    label = fd.TryGetValue("label", out var lb) ? (lb as string)?.Substring(0, Math.Min(60, (lb as string).Length)) : null,
                    source = fd.TryGetValue("source", out var so) ? so as string : null,
                };
                foreach (var kv in fd) if (!ItemKeys.Contains(kv.Key)) item.extra[kv.Key] = kv.Value;
                return item;
            }).ToList();
            r.openings = List(Opt(d, "openings"), "openings").Select(o =>
            {
                var od = o as IDictionary<string, object> ?? throw new RoomFormatException("Invalid opening.");
                var type = Get(od, "type") as string;
                var wall = (int)Num(Get(od, "wall"), "opening wall");
                if ((type != "door" && type != "window") || wall < 0 || wall >= r.walls.Count) throw new RoomFormatException("An opening must belong to a wall.");
                return new Opening
                {
                    type = type, wall = wall,
                    offset = Range(Num(Get(od, "offset"), "offset"), 0, 1, "opening position"),
                    width = Range(Num(Get(od, "width"), "width"), 0.3, 6, "opening width"),
                    height = od.TryGetValue("height", out var h) ? Num(h, "opening height") : (double?)null,
                    sill = od.TryGetValue("sill", out var si) ? Num(si, "sill") : (double?)null,
                    source = od.TryGetValue("source", out var so) ? so as string : null,
                };
            }).ToList();
        }

        static V3 Rotation(object value)
        {
            var d = value as IDictionary<string, object> ?? throw new RoomFormatException("Missing rotation.");
            if (!d.ContainsKey("w")) return Vec(d, "rotation", -100, 100);
            // Legacy Unity quaternion (left-handed): planar yaw becomes the opposite web yaw.
            double qy = Num(d["y"], "q"), qw = Num(d["w"], "q");
            return new V3(0, -2 * Math.Atan2(qy, qw), 0);
        }

        // ------------------------------------------------------------------ writing
        public static Dictionary<string, object> Vec(V3 v) => new Dictionary<string, object> { { "x", v.x }, { "y", v.y }, { "z", v.z } };

        public static Dictionary<string, object> ItemToDict(Item f)
        {
            var d = new Dictionary<string, object>(f.extra)
            {
                ["id"] = f.id, ["type"] = f.type, ["position"] = Vec(f.position), ["rotation"] = Vec(f.rotation),
                ["scale"] = Vec(f.scale), ["timestamp"] = f.timestamp,
            };
            if (f.color != null) d["color"] = f.color;
            if (f.label != null) d["label"] = f.label;
            if (f.source != null) d["source"] = f.source;
            return d;
        }
        public static Dictionary<string, object> WallToDict(Wall w)
        {
            var d = new Dictionary<string, object>(w.extra) { ["startPoint"] = Vec(w.start), ["endPoint"] = Vec(w.end), ["height"] = w.height, ["thickness"] = w.thickness };
            return d;
        }
        public static Dictionary<string, object> OpeningToDict(Opening o)
        {
            var d = new Dictionary<string, object> { ["type"] = o.type, ["wall"] = (long)o.wall, ["offset"] = o.offset, ["width"] = o.width };
            if (o.height.HasValue) d["height"] = o.height.Value;
            if (o.sill.HasValue) d["sill"] = o.sill.Value;
            if (o.source != null) d["source"] = o.source;
            return d;
        }

        static Dictionary<string, object> Geometry(Room r) => new Dictionary<string, object>
        {
            ["dimensions"] = Vec(r.dimensions),
            ["floor"] = new Dictionary<string, object> { ["vertices"] = r.floor.Select(v => (object)Vec(v)).ToList(), ["center"] = Vec(r.floorCenter), ["area"] = RoomOps.Area(r.floor) },
            ["walls"] = r.walls.Select(w => (object)WallToDict(w)).ToList(),
            ["furniture"] = r.furniture.Select(f => (object)ItemToDict(f)).ToList(),
            ["openings"] = r.openings.Select(o => (object)OpeningToDict(o)).ToList(),
        };
        public static Dictionary<string, object> LevelToDict(Room l)
        {
            var d = Geometry(l);
            d["id"] = l.levelId; d["name"] = string.IsNullOrWhiteSpace(l.name) ? "Floor" : l.name.Substring(0, Math.Min(40, l.name.Length));
            d["elevation"] = l.elevation; d["separate"] = l.separate;
            return d;
        }

        /// <summary>The editable fields written on every save (matches the website's savePatch).</summary>
        public static Dictionary<string, object> Patch(Room r, long revision, long timestamp)
        {
            return new Dictionary<string, object>
            {
                ["schemaVersion"] = 2L,
                ["name"] = string.IsNullOrWhiteSpace(r.name) ? "Scanned room" : r.name.Substring(0, Math.Min(80, r.name.Length)),
                // Always written (even empty) so deleting the last extra floor also removes it.
                ["levels"] = (r.levels ?? new List<Room>()).Select(l => (object)LevelToDict(l)).ToList(),
                ["levelName"] = string.IsNullOrWhiteSpace(r.levelName) ? "Ground floor" : r.levelName,
                ["dimensions"] = Vec(r.dimensions),
                ["floor"] = new Dictionary<string, object> { ["vertices"] = r.floor.Select(v => (object)Vec(v)).ToList(), ["center"] = Vec(r.floorCenter), ["area"] = RoomOps.Area(r.floor) },
                ["walls"] = r.walls.Select(w => (object)WallToDict(w)).ToList(),
                ["furniture"] = r.furniture.Select(f => (object)ItemToDict(f)).ToList(),
                ["openings"] = r.openings.Select(o => (object)OpeningToDict(o)).ToList(),
                ["revision"] = revision,
                ["timestamp"] = timestamp,
            };
        }

        // ------------------------------------------------------------------ helpers
        static object Get(IDictionary<string, object> d, string key) => d.TryGetValue(key, out var v) ? v : throw new RoomFormatException($"Missing {key}.");
        static object Opt(IDictionary<string, object> d, string key) => d.TryGetValue(key, out var v) ? v : new List<object>();
        static double Opt(IDictionary<string, object> d, string key, double fallback) => d.TryGetValue(key, out var v) && v != null ? Num(v, key) : fallback;
        static string Str(IDictionary<string, object> d, string key, string fallback, int max)
        {
            var s = d.TryGetValue(key, out var v) ? v as string : null;
            if (string.IsNullOrEmpty(s)) return fallback;
            return s.Length > max ? s.Substring(0, max) : s;
        }
        static List<object> List(object v, string name) => v is IEnumerable<object> e && !(v is string) ? e.ToList() : throw new RoomFormatException($"Invalid {name}.");
        public static double Num(object v, string name)
        {
            double n;
            try { n = Convert.ToDouble(v, CultureInfo.InvariantCulture); } catch { throw new RoomFormatException($"Invalid {name}."); }
            if (double.IsNaN(n) || double.IsInfinity(n)) throw new RoomFormatException($"Invalid {name}.");
            return n;
        }
        static double Range(double v, double min, double max, string name) => v < min || v > max ? throw new RoomFormatException($"Invalid {name}.") : v;
        static V3 Vec(object v, string name, double min = -1000, double max = 1000)
        {
            var d = v as IDictionary<string, object> ?? throw new RoomFormatException($"Missing {name}.");
            double x = Range(Num(Get(d, "x"), name), min, max, name);
            double y = d.TryGetValue("y", out var yy) ? Range(Num(yy, name), min, max, name) : 0;
            double z = Range(Num(Get(d, "z"), name), min, max, name);
            return new V3(x, y, z);
        }
    }

    /// <summary>Three-way merge, identical in behaviour to mergeRooms() on the website.</summary>
    public static class RoomMerge
    {
        static string Structure(Room r) => Canon.Of(new object[] { r.floor.Select(v => (object)RoomCodec.Vec(v)).ToList(), r.walls.Select(w => (object)RoomCodec.WallToDict(w)).ToList(), r.openings.Select(o => (object)RoomCodec.OpeningToDict(o)).ToList() });
        static string ItemKey(Item f) => Canon.Of(RoomCodec.ItemToDict(f));

        static string LevelKey(Room l) => Canon.Of(RoomCodec.LevelToDict(l));

        /// <summary>Merges projects: the ground floor like a room, extra floors matched by id.</summary>
        public static Room Merge(Room baseRoom, Room local, Room remote)
        {
            var merged = MergeLevel(baseRoom, local, remote);
            if (local.levelName != baseRoom.levelName) merged.levelName = local.levelName;
            var b = (baseRoom.levels ?? new List<Room>()).ToDictionary(l => l.levelId);
            var l2 = (local.levels ?? new List<Room>()).ToDictionary(l => l.levelId);
            var remoteIds = new HashSet<string>((remote.levels ?? new List<Room>()).Select(l => l.levelId));
            var levels = new List<Room>();
            foreach (var r in remote.levels ?? new List<Room>())
            {
                b.TryGetValue(r.levelId, out var bl);
                if (!l2.TryGetValue(r.levelId, out var ll)) { if (bl == null || LevelKey(bl) != LevelKey(r)) levels.Add(r.Clone()); continue; }
                levels.Add(bl != null ? MergeLevel(bl, ll, r) : ll.Clone());
            }
            foreach (var x in local.levels ?? new List<Room>()) if (!remoteIds.Contains(x.levelId) && !b.ContainsKey(x.levelId)) levels.Add(x.Clone());
            merged.levels = levels.Count > 0 || remote.levels != null || local.levels != null ? levels : null;
            return merged;
        }

        static Room MergeLevel(Room baseRoom, Room local, Room remote)
        {
            var merged = remote.Clone();
            if (local.name != baseRoom.name) merged.name = local.name;
            if (local.elevation != baseRoom.elevation) merged.elevation = local.elevation;
            if (local.separate != baseRoom.separate) merged.separate = local.separate;
            if (Canon.Of(RoomCodec.Vec(local.dimensions)) != Canon.Of(RoomCodec.Vec(baseRoom.dimensions))) merged.dimensions = local.dimensions;
            if (Structure(local) != Structure(baseRoom))
            {
                var l = local.Clone();
                merged.floor = l.floor; merged.walls = l.walls; merged.openings = l.openings; merged.dimensions = l.dimensions; merged.floorCenter = l.floorCenter;
            }
            var baseItems = baseRoom.furniture.ToDictionary(f => f.id);
            var localItems = local.furniture.ToDictionary(f => f.id);
            var remoteIds = new HashSet<string>(remote.furniture.Select(f => f.id));
            var result = new List<Item>();
            foreach (var f in remote.furniture)
            {
                baseItems.TryGetValue(f.id, out var b);
                if (!localItems.TryGetValue(f.id, out var l)) { if (b == null || ItemKey(b) != ItemKey(f)) result.Add(f.Clone()); continue; }
                result.Add(b != null && ItemKey(b) == ItemKey(l) ? f.Clone() : l.Clone());
            }
            foreach (var f in local.furniture) if (!remoteIds.Contains(f.id) && !baseItems.ContainsKey(f.id)) result.Add(f.Clone());
            merged.furniture = result;
            return merged;
        }

        public static bool HasChanges(Room a, Room b) =>
            a.name != b.name || a.levelName != b.levelName
            || Canon.Of((a.levels ?? new List<Room>()).Select(l => (object)RoomCodec.LevelToDict(l)).ToList()) != Canon.Of((b.levels ?? new List<Room>()).Select(l => (object)RoomCodec.LevelToDict(l)).ToList()) || Structure(a) != Structure(b) || Canon.Of(RoomCodec.Vec(a.dimensions)) != Canon.Of(RoomCodec.Vec(b.dimensions))
            || Canon.Of(a.furniture.Select(f => (object)RoomCodec.ItemToDict(f)).ToList()) != Canon.Of(b.furniture.Select(f => (object)RoomCodec.ItemToDict(f)).ToList());
    }
}
