// Renders catalog thumbnails on the device from the same 3D models used in AR (a few per frame).
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace RealTweak
{
    public class IconRenderer : MonoBehaviour
    {
        public const int Layer = 30;
        public static IconRenderer Instance { get; private set; }
        public event Action<string> IconReady;
        readonly Dictionary<string, Texture2D> icons = new Dictionary<string, Texture2D>();
        readonly Queue<string> pending = new Queue<string>();
        readonly HashSet<string> queued = new HashSet<string>();
        Camera cam; RenderTexture rt; Transform stage; Light keyLight;
        const int Size = 192;

        void Awake()
        {
            Instance = this;
            stage = new GameObject("Icon Stage").transform; stage.position = new Vector3(0, -500, 0);
            var camGo = new GameObject("Icon Camera"); camGo.transform.SetParent(stage, false);
            cam = camGo.AddComponent<Camera>();
            cam.enabled = false; cam.orthographic = true; cam.cullingMask = 1 << Layer; cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.949f, 0.949f, 0.922f, 1); cam.nearClipPlane = 0.01f; cam.farClipPlane = 50;
            var data = camGo.AddComponent<UniversalAdditionalCameraData>(); data.renderShadows = false; data.renderPostProcessing = false;
            rt = new RenderTexture(Size, Size, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4, name = "RT Icons" };
            var lightGo = new GameObject("Icon Light"); lightGo.transform.SetParent(stage, false); lightGo.transform.rotation = Quaternion.Euler(50, -30, 0);
            keyLight = lightGo.AddComponent<Light>(); keyLight.type = LightType.Directional; keyLight.intensity = 0.6f; keyLight.cullingMask = 1 << Layer; keyLight.shadows = LightShadows.None;
            StartCoroutine(Run());
        }

        public Texture2D Get(string type)
        {
            if (icons.TryGetValue(type, out var t)) return t;
            if (queued.Add(type)) pending.Enqueue(type);
            return null;
        }
        public void Prefetch(IEnumerable<CatalogItem> items) { foreach (var i in items) Get(i.type); }

        IEnumerator Run()
        {
            while (true)
            {
                if (pending.Count == 0) { yield return null; continue; }
                for (int k = 0; k < 2 && pending.Count > 0; k++) RenderOne(pending.Dequeue());
                yield return null;
            }
        }

        void RenderOne(string type)
        {
            var model = FurnitureFactory.Build(type, null, "icon", Layer);
            model.transform.SetParent(stage, false);
            Destroy(model.GetComponent<BoxCollider>());
            var bounds = new Bounds(model.transform.position, Vector3.zero);
            foreach (var r in model.GetComponentsInChildren<Renderer>()) bounds.Encapsulate(r.bounds);
            var dir = Quaternion.Euler(28, 215, 0) * Vector3.forward;
            cam.transform.position = bounds.center - dir * 10; cam.transform.rotation = Quaternion.LookRotation(dir);
            cam.orthographicSize = bounds.extents.magnitude * 1.05f;
            cam.targetTexture = rt;
            var request = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
            if (RenderPipeline.SupportsRenderRequest(cam, request)) RenderPipeline.SubmitRenderRequest(cam, request);
            else cam.Render();
            var prev = RenderTexture.active; RenderTexture.active = rt;
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, false) { name = $"Icon {type}" };
            tex.ReadPixels(new Rect(0, 0, Size, Size), 0, 0); tex.Apply(false, true);
            RenderTexture.active = prev; cam.targetTexture = null;
            DestroyImmediate(model);
            icons[type] = tex;
            IconReady?.Invoke(type);
        }

        void OnDestroy() { if (rt != null) rt.Release(); }
    }
}
