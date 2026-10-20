// Floors of a project: the document's own geometry is the ground floor; `levels` holds further
// floors (stacked, connected by stairs) and separate plans. Same rules as the website (src/model.js).
using System;
using System.Collections.Generic;
using System.Linq;

namespace RealTweak.Core
{
    public static class Floors
    {
        public const int Max = 12;
        public static int Count(Room house) => 1 + (house.levels?.Count ?? 0);
        public static string Name(Room house, int i) => i == 0 ? (string.IsNullOrEmpty(house.levelName) ? "Ground floor" : house.levelName) : house.levels[i - 1].name;
        public static double Elevation(Room house, int i) => i == 0 ? 0 : house.levels[i - 1].elevation;
        public static bool Separate(Room house, int i) => i != 0 && house.levels[i - 1].separate;

        /// <summary>Room-shaped copy of floor i (project metadata + that floor's geometry) for viewing and editing.</summary>
        public static Room View(Room house, int i)
        {
            var v = house.Clone(); v.levels = null;
            if (i == 0) return v;
            var l = house.levels[i - 1].Clone();
            v.dimensions = l.dimensions; v.floor = l.floor; v.floorCenter = l.floorCenter; v.walls = l.walls; v.openings = l.openings; v.furniture = l.furniture;
            return v;
        }
        /// <summary>The project with floor i replaced by the edited view.</summary>
        public static Room With(Room house, int i, Room view)
        {
            var h = house.Clone(); var v = view.Clone();
            var target = i == 0 ? h : h.levels[i - 1];
            target.dimensions = v.dimensions; target.floor = v.floor; target.floorCenter = v.floorCenter; target.walls = v.walls; target.openings = v.openings; target.furniture = v.furniture;
            return h;
        }
        public static List<int> Stacked(Room house) => Enumerable.Range(0, Count(house)).Where(i => !Separate(house, i)).OrderBy(i => Elevation(house, i)).ToList();
        public static int Above(Room house, int i)
        {
            if (Separate(house, i)) return -1;
            var order = Stacked(house); int k = order.IndexOf(i);
            return k >= 0 && k < order.Count - 1 ? order[k + 1] : -1;
        }
        public static int Below(Room house, int i)
        {
            if (Separate(house, i)) return -1;
            var order = Stacked(house); int k = order.IndexOf(i);
            return k > 0 ? order[k - 1] : -1;
        }
        /// <summary>Adds a scanned or drawn floor on top of the building (or as a separate plan). Returns its index.</summary>
        public static int Add(Room house, Room geometry, string name, bool separate, string id)
        {
            if (Count(house) >= Max) throw new RoomEditException($"A project can have up to {Max} floors and plans.");
            int top = Stacked(house).Last();
            double height = top == 0 ? house.dimensions.y : house.levels[top - 1].dimensions.y;
            var level = geometry.Clone();
            level.levels = null; level.levelId = id; level.name = string.IsNullOrWhiteSpace(name) ? $"Floor {Count(house)}" : name;
            level.separate = separate; level.elevation = separate ? 0 : Math.Round((Elevation(house, top) + height + 0.25) * 100) / 100;
            house.levels ??= new List<Room>();
            house.levels.Add(level);
            return house.levels.Count;
        }
        /// <summary>Stretches a staircase so it reaches the floor above. False if there is no floor above.</summary>
        public static bool FitStairs(Room house, int i, Item item, double modelHeight, bool isStair)
        {
            int above = Above(house, i);
            if (above < 0 || !isStair || modelHeight <= 0) return false;
            double rise = Elevation(house, above) - Elevation(house, i);
            if (rise <= 0.1) return false;
            item.scale = new V3(item.scale.x, Math.Round(rise / modelHeight * 1000) / 1000, item.scale.z);
            return true;
        }
    }
}
