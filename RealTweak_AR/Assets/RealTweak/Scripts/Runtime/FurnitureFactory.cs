// Builds furniture GameObjects from catalog parts — the same parts the website renders with Three.js.
using RealTweak.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace RealTweak
{
    /// <summary>Marks a furniture instance in the AR scene.</summary>
    public class FurnitureView : MonoBehaviour
    {
        public string id, type, color;
        public string fingerprint;
        public BoxCollider hitBox;
    }

    public static class Coords
    {
        /// <summary>Web (right-handed) → room-local Unity (left-handed): mirror Z. Floor sits at local y = 0.</summary>
        public static Vector3 ToLocal(V3 web, double floorY) => new Vector3((float)web.x, (float)(web.y - floorY), (float)-web.z);
        public static V3 ToWeb(Vector3 local, double floorY) => new V3(local.x, local.y + floorY, -local.z);
        /// <summary>Unity yaw (degrees) of a web yaw (radians). Mirroring Z reverses rotation direction.</summary>
        public static float YawToUnity(double webYaw) => (float)(-webYaw * Mathf.Rad2Deg);
        public static double YawToWeb(float unityYawDegrees) => -unityYawDegrees * Mathf.Deg2Rad;
    }

    public static class FurnitureFactory
    {
        /// <summary>Unity rotation of a catalog part given web XYZ Euler degrees (M = Rx·Ry·Rz, mirrored in Z).</summary>
        public static Quaternion PartRotation(float rx, float ry, float rz) =>
            Quaternion.AngleAxis(-rx, Vector3.right) * Quaternion.AngleAxis(-ry, Vector3.up) * Quaternion.AngleAxis(rz, Vector3.forward);

        /// <summary>Model with origin at the bottom-centre, front facing local -Z in web terms (+Z mirrored).</summary>
        public static GameObject Build(string type, string colorHex, string id, int layer = -1)
        {
            var def = Catalog.Get(type);
            var main = Catalog.ParseColor(colorHex ?? def.color, new Color(0.65f, 0.68f, 0.66f));
            var root = new GameObject($"{def.name} [{id}]");
            foreach (var p in def.parts)
            {
                var go = new GameObject(p.s);
                go.transform.SetParent(root.transform, false);
                go.transform.localPosition = new Vector3(p.x, p.y, -p.z);
                go.transform.localRotation = PartRotation(p.rx, p.ry, p.rz);
                go.transform.localScale = new Vector3(Mathf.Max(0.001f, p.w), Mathf.Max(0.001f, p.h), Mathf.Max(0.001f, p.d));
                go.AddComponent<MeshFilter>().sharedMesh = p.s == "cyl" ? MeshKit.Cylinder(p.t) : p.s == "sph" ? MeshKit.Sphere() : MeshKit.Box();
                var mr = go.AddComponent<MeshRenderer>();
                var color = p.c == "main" ? main : Catalog.ParseColor(p.c, main);
                mr.sharedMaterial = MeshKit.Material(color, p.m);
                mr.shadowCastingMode = p.m == "glass" || p.m == "light" ? ShadowCastingMode.Off : ShadowCastingMode.On;
                if (layer >= 0) go.layer = layer;
            }
            if (layer >= 0) root.layer = layer;
            var view = root.AddComponent<FurnitureView>();
            view.id = id; view.type = type; view.color = colorHex;
            view.hitBox = root.AddComponent<BoxCollider>();
            view.hitBox.center = new Vector3(0, def.h / 2, 0);
            view.hitBox.size = new Vector3(Mathf.Max(0.15f, def.w), Mathf.Max(0.15f, def.h), Mathf.Max(0.15f, def.d));
            return root;
        }
    }
}
