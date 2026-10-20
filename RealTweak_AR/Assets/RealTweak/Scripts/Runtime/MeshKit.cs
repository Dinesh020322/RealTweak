// Procedural primitive meshes and a shared material cache (URP Lit).
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace RealTweak
{
    public static class MeshKit
    {
        static Mesh box, sphere, quad;
        static readonly Dictionary<float, Mesh> cylinders = new Dictionary<float, Mesh>();
        static readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        static Material litTemplate, transparentTemplate, unlitTemplate;

        static void Templates()
        {
            if (litTemplate != null) return;
            // Material assets in Resources guarantee the shaders and variants are included in builds.
            litTemplate = Resources.Load<Material>("RealTweakLit");
            transparentTemplate = Resources.Load<Material>("RealTweakTransparent");
            unlitTemplate = Resources.Load<Material>("RealTweakUnlit");
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            if (litTemplate == null) litTemplate = new Material(lit);
            if (transparentTemplate == null) { transparentTemplate = new Material(lit); MakeTransparent(transparentTemplate); }
            if (unlitTemplate == null) unlitTemplate = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
        }

        public static void MakeTransparent(Material m)
        {
            m.SetFloat("_Surface", 1); m.SetFloat("_Blend", 0);
            m.SetOverrideTag("RenderType", "Transparent");
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)RenderQueue.Transparent;
        }

        /// <summary>Material for a colour and a catalog material hint (wood, fabric, metal, glass, light, gloss, ceramic).</summary>
        public static Material Material(Color color, string kind = "", float alpha = 1)
        {
            Templates();
            string key = $"{ColorUtility.ToHtmlStringRGBA(color)}|{kind}|{alpha:0.00}";
            if (materials.TryGetValue(key, out var cached)) return cached;
            bool transparent = kind == "glass" || alpha < 0.999f;
            var m = new Material(transparent ? transparentTemplate : litTemplate) { name = key };
            float smooth = 0.3f, metal = 0;
            switch (kind)
            {
                case "wood": smooth = 0.35f; break;
                case "fabric": smooth = 0.05f; break;
                case "metal": smooth = 0.65f; metal = 0.55f; break;
                case "gloss": smooth = 0.8f; break;
                case "ceramic": smooth = 0.75f; break;
                case "glass": smooth = 0.95f; metal = 0.1f; alpha = Mathf.Min(alpha, 0.35f); break;
            }
            color.a = alpha;
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", smooth);
            m.SetFloat("_Metallic", metal);
            if (kind == "light") { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", color * 0.6f); }
            materials[key] = m;
            return m;
        }

        public static Material Unlit(Color color)
        {
            Templates();
            string key = $"unlit|{ColorUtility.ToHtmlStringRGBA(color)}";
            if (materials.TryGetValue(key, out var cached)) return cached;
            var m = new Material(color.a < 0.999f ? transparentTemplate : unlitTemplate) { name = key };
            m.SetColor("_BaseColor", color);
            if (color.a < 0.999f) { m.SetFloat("_Smoothness", 0); m.SetColor("_EmissionColor", color); m.EnableKeyword("_EMISSION"); }
            materials[key] = m;
            return m;
        }

        public static Mesh Box()
        {
            if (box != null) return box;
            box = new Mesh { name = "RT Box" };
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            void Face(Vector3 normal, Vector3 u, Vector3 w)
            {
                int i = v.Count; Vector3 c = normal * 0.5f;
                v.Add(c - u * 0.5f - w * 0.5f); v.Add(c + u * 0.5f - w * 0.5f); v.Add(c + u * 0.5f + w * 0.5f); v.Add(c - u * 0.5f + w * 0.5f);
                for (int k = 0; k < 4; k++) n.Add(normal);
                t.AddRange(new[] { i, i + 2, i + 1, i, i + 3, i + 2 });
            }
            Face(Vector3.up, Vector3.right, Vector3.forward); Face(Vector3.down, Vector3.right, Vector3.back);
            // Every face uses u × w = -normal so all triangles wind clockwise seen from outside (Unity front faces).
            Face(Vector3.right, Vector3.forward, Vector3.up); Face(Vector3.left, Vector3.back, Vector3.up);
            Face(Vector3.forward, Vector3.left, Vector3.up); Face(Vector3.back, Vector3.right, Vector3.up);
            box.SetVertices(v); box.SetNormals(n); box.SetTriangles(t, 0); box.RecalculateBounds();
            return box;
        }

        /// <summary>Unit-height cylinder centred on the origin; bottom diameter 1, top diameter `taper`.</summary>
        public static Mesh Cylinder(float taper)
        {
            taper = taper <= 0 ? 1 : Mathf.Round(taper * 100) / 100;
            if (cylinders.TryGetValue(taper, out var cached)) return cached;
            const int seg = 24;
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            float rb = 0.5f, rt = 0.5f * taper, slope = (rb - rt);
            for (int i = 0; i <= seg; i++)
            {
                float a = i * Mathf.PI * 2 / seg; var dir = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                var normal = new Vector3(dir.x, slope, dir.z).normalized;
                v.Add(dir * rb + Vector3.down * 0.5f); n.Add(normal);
                v.Add(dir * rt + Vector3.up * 0.5f); n.Add(normal);
            }
            for (int i = 0; i < seg; i++) { int b = i * 2; t.AddRange(new[] { b, b + 1, b + 3, b, b + 3, b + 2 }); }
            foreach (float y in new[] { 0.5f, -0.5f })
            {
                int center = v.Count; float r = y > 0 ? rt : rb; var normal = y > 0 ? Vector3.up : Vector3.down;
                v.Add(new Vector3(0, y, 0)); n.Add(normal);
                for (int i = 0; i <= seg; i++) { float a = i * Mathf.PI * 2 / seg; v.Add(new Vector3(Mathf.Cos(a) * r, y, Mathf.Sin(a) * r)); n.Add(normal); }
                for (int i = 0; i < seg; i++) t.AddRange(y > 0 ? new[] { center, center + i + 2, center + i + 1 } : new[] { center, center + i + 1, center + i + 2 });
            }
            var mesh = new Mesh { name = $"RT Cylinder {taper}" };
            mesh.SetVertices(v); mesh.SetNormals(n); mesh.SetTriangles(t, 0); mesh.RecalculateBounds();
            cylinders[taper] = mesh;
            return mesh;
        }

        public static Mesh Sphere()
        {
            if (sphere != null) return sphere;
            const int lat = 12, lon = 18;
            var v = new List<Vector3>(); var t = new List<int>();
            for (int i = 0; i <= lat; i++)
                for (int j = 0; j <= lon; j++)
                {
                    float th = i * Mathf.PI / lat, ph = j * Mathf.PI * 2 / lon;
                    v.Add(new Vector3(Mathf.Sin(th) * Mathf.Cos(ph), Mathf.Cos(th), Mathf.Sin(th) * Mathf.Sin(ph)) * 0.5f);
                }
            for (int i = 0; i < lat; i++)
                for (int j = 0; j < lon; j++)
                {
                    int a = i * (lon + 1) + j, b = a + lon + 1;
                    t.AddRange(new[] { a, a + 1, b, a + 1, b + 1, b });
                }
            sphere = new Mesh { name = "RT Sphere" };
            sphere.SetVertices(v); sphere.SetTriangles(t, 0); sphere.RecalculateNormals(); sphere.RecalculateBounds();
            return sphere;
        }

        /// <summary>Flat polygon (ear clipping) in the XZ plane, facing up.</summary>
        public static Mesh Polygon(IList<Vector2> pts)
        {
            var mesh = new Mesh { name = "RT Floor" };
            var verts = new List<Vector3>(); foreach (var p in pts) verts.Add(new Vector3(p.x, 0, p.y));
            var idx = new List<int>(); for (int i = 0; i < pts.Count; i++) idx.Add(i);
            float area = 0; for (int i = 0; i < pts.Count; i++) { var a = pts[i]; var b = pts[(i + 1) % pts.Count]; area += a.x * b.y - b.x * a.y; }
            if (area < 0) idx.Reverse();
            var tris = new List<int>();
            int guard = 0;
            while (idx.Count > 3 && guard++ < 10000)
            {
                bool clipped = false;
                for (int i = 0; i < idx.Count; i++)
                {
                    int ia = idx[(i - 1 + idx.Count) % idx.Count], ib = idx[i], ic = idx[(i + 1) % idx.Count];
                    Vector2 a = pts[ia], b = pts[ib], c = pts[ic];
                    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) <= 1e-7f) continue;
                    bool contains = false;
                    foreach (int k in idx)
                    {
                        if (k == ia || k == ib || k == ic) continue;
                        if (InTriangle(pts[k], a, b, c)) { contains = true; break; }
                    }
                    if (contains) continue;
                    tris.AddRange(new[] { ia, ic, ib });
                    idx.RemoveAt(i); clipped = true; break;
                }
                if (!clipped) break;
            }
            if (idx.Count == 3) tris.AddRange(new[] { idx[0], idx[2], idx[1] });
            mesh.SetVertices(verts); mesh.SetTriangles(tris, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds();
            return mesh;
        }
        static bool InTriangle(Vector2 p, Vector2 a, Vector2 b, Vector2 c)
        {
            float d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
            float d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
            float d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
            bool neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
            return !(neg && pos);
        }

        public static LineRenderer Line(Transform parent, string name, Color color, float width, bool loop)
        {
            var go = new GameObject(name); go.transform.SetParent(parent, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.useWorldSpace = false; lr.loop = loop; lr.widthMultiplier = width; lr.numCapVertices = 2; lr.numCornerVertices = 2;
            lr.sharedMaterial = Unlit(color); lr.startColor = lr.endColor = color;
            lr.shadowCastingMode = ShadowCastingMode.Off; lr.receiveShadows = false;
            return lr;
        }
    }
}
