// Room document model shared with the website (see RealTweak_Website/UNITY_CONTRACT.md).
// Pure C# (no UnityEngine) so it can be unit-tested outside Unity.
// All values are stored in WEB coordinates: right-handed, meters, +Y up.
// Unity local coordinates of a room are (x, y, -z) of the web coordinates.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace RealTweak.Core
{
    public struct V3
    {
        public double x, y, z;
        public V3(double x, double y, double z) { this.x = x; this.y = y; this.z = z; }
        public static readonly V3 Zero = new V3(0, 0, 0);
        public static readonly V3 One = new V3(1, 1, 1);
        public override string ToString() => string.Format(CultureInfo.InvariantCulture, "({0:0.###},{1:0.###},{2:0.###})", x, y, z);
    }

    public sealed class Wall
    {
        public V3 start, end;
        public double height = 2.6, thickness = 0.12;
        public Dictionary<string, object> extra = new Dictionary<string, object>();
        public double Length => Math.Sqrt((end.x - start.x) * (end.x - start.x) + (end.z - start.z) * (end.z - start.z));
        public Wall Clone() => new Wall { start = start, end = end, height = height, thickness = thickness, extra = new Dictionary<string, object>(extra) };
    }

    public sealed class Opening
    {
        public string type = "door"; // door | window
        public int wall;
        public double offset = 0.5, width = 0.9;
        public double? height, sill;
        public string source;
        public Opening Clone() => (Opening)MemberwiseClone();
        public double Height(Wall w) => type == "door" ? Math.Min(height ?? 2.1, w.height) : Math.Max(0.2, Math.Min(height ?? 1.2, w.height - Sill(w) - 0.1));
        public double Sill(Wall w) => type == "door" ? (sill ?? 0) : (sill ?? Math.Min(0.9, w.height * 0.33));
    }

    public sealed class Item
    {
        public string id, type, color, label, source;
        public V3 position, rotation, scale = V3.One;
        public long timestamp;
        public Dictionary<string, object> extra = new Dictionary<string, object>();
        public Item Clone() { var c = (Item)MemberwiseClone(); c.extra = new Dictionary<string, object>(extra); return c; }
        /// <summary>Web yaw in radians (rotation about +Y).</summary>
        public double Yaw { get => rotation.y; set => rotation = new V3(0, value, 0); }
    }

    public sealed class Room
    {
        public string roomId, name = "Scanned room", source, meshPath;
        public long revision, timestamp;
        public V3 dimensions = new V3(4, 2.6, 4);
        public List<V3> floor = new List<V3>();
        public V3 floorCenter;
        public List<Wall> walls = new List<Wall>();
        public List<Item> furniture = new List<Item>();
        public List<Opening> openings = new List<Opening>();
        public Dictionary<string, object> scan;
        /// <summary>Name of this floor (the ground floor's name lives on the project as levelName).</summary>
        public string levelName;
        // Set on entries of `levels` only: a floor is stored as a Room holding just geometry.
        public string levelId;
        public double elevation;
        public bool separate;
        /// <summary>Further floors (stacked above, connected by stairs) or separate plans. Null when the project has one floor.</summary>
        public List<Room> levels;

        public Room Clone()
        {
            var r = (Room)MemberwiseClone();
            r.floor = new List<V3>(floor);
            r.walls = walls.Select(w => w.Clone()).ToList();
            r.furniture = furniture.Select(f => f.Clone()).ToList();
            r.openings = openings.Select(o => o.Clone()).ToList();
            r.scan = scan == null ? null : new Dictionary<string, object>(scan);
            r.levels = levels?.Select(l => l.Clone()).ToList();
            return r;
        }
        public double CeilingHeight => dimensions.y;
    }

    /// <summary>Canonical, order-stable text used to compare values for merging.</summary>
    public static class Canon
    {
        public static string Of(object value)
        {
            var sb = new StringBuilder();
            Write(sb, value);
            return sb.ToString();
        }
        static void Write(StringBuilder sb, object v)
        {
            switch (v)
            {
                case null: sb.Append("null"); break;
                case string s: sb.Append('"').Append(s.Replace("\"", "\\\"")).Append('"'); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case IDictionary<string, object> d:
                    sb.Append('{');
                    foreach (var k in d.Keys.OrderBy(k => k, StringComparer.Ordinal)) { sb.Append(k).Append(':'); Write(sb, d[k]); sb.Append(','); }
                    sb.Append('}'); break;
                case System.Collections.IEnumerable list:
                    sb.Append('['); foreach (var x in list) { Write(sb, x); sb.Append(','); } sb.Append(']'); break;
                default:
                    if (v is IConvertible c && IsNumber(v)) sb.Append(Math.Round(c.ToDouble(CultureInfo.InvariantCulture), 6).ToString("R", CultureInfo.InvariantCulture));
                    else sb.Append(v.ToString());
                    break;
            }
        }
        static bool IsNumber(object v) => v is double || v is float || v is long || v is int || v is decimal || v is short;
    }
}
