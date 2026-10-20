// Collects room samples from whatever the device offers and feeds RealTweak's reconstructor:
//   • ARCore depth-from-motion raycasts (most Android phones, no special sensor needed),
//   • feature points (every ARCore/ARKit device),
//   • wall/floor/table planes (with ARKit classifications when available),
//   • the LiDAR scene mesh on Pro iPhones/iPads.
// It also shows live feedback: a point "spray", detected wall outlines and coverage hints.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using RealTweak.Core;
using Unity.Collections;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace RealTweak
{
    public class ScanCapture : MonoBehaviour
    {
        public ARRaycastManager raycastManager;
        public ARPlaneManager planeManager;
        public ARPointCloudManager pointCloudManager;
        public ARMeshManager meshManager;
        public AROcclusionManager occlusionManager;
        public Camera arCamera;
        public ParticleSystem pointSpray;

        public enum Phase { Idle, FindFloor, Capture }
        public Phase phase { get; private set; } = Phase.Idle;
        public readonly ScanGrid grid = new ScanGrid();
        public float? FloorY { get; private set; }
        public readonly List<Vector3> manualCorners = new List<Vector3>();
        public int WallLineCount { get; private set; }
        public float WallLength { get; private set; }
        public string Hint { get; private set; } = "";
        public bool HasDepth => occlusionManager != null && occlusionManager.descriptor != null && occlusionManager.descriptor.environmentDepthImageSupported == Supported.Supported;
        public bool HasLidarMesh => meshManager != null && meshManager.subsystem != null && meshManager.subsystem.running;
        public string Method => HasLidarMesh ? "lidar-mesh" : HasDepth ? "depth" : "feature-points";

        readonly List<ARRaycastHit> hits = new List<ARRaycastHit>();
        readonly List<LineRenderer> previewLines = new List<LineRenderer>();
        Transform previewRoot;
        LineRenderer cornerLine;
        float nextSample, nextCloud, nextPreview, nextTrajectory;
        int floorSamples;

        void Awake()
        {
            previewRoot = new GameObject("Scan Preview").transform;
            cornerLine = MeshKit.Line(previewRoot, "Corners", new Color(1, 0.75f, 0.3f), 0.025f, false);
            cornerLine.useWorldSpace = true; cornerLine.positionCount = 0;
        }

        void OnEnable() { if (meshManager != null) meshManager.meshesChanged += OnMeshes; }
        void OnDisable() { if (meshManager != null) meshManager.meshesChanged -= OnMeshes; }

        public void BeginFloor()
        {
            phase = Phase.FindFloor; FloorY = null; floorSamples = 0; manualCorners.Clear();
            grid.Clear(); ClearPreview();
            SetPlaneVisibility(true);
            if (occlusionManager != null) occlusionManager.requestedEnvironmentDepthMode = EnvironmentDepthMode.Medium;
            if (meshManager != null) meshManager.enabled = true;
        }

        public void BeginCapture()
        {
            if (!FloorY.HasValue) return;
            phase = Phase.Capture;
            grid.Clear(); grid.floorY = FloorY.Value;
            SetPlaneVisibility(false);
        }

        /// <summary>Continue capturing after an unsuccessful reconstruction, keeping all samples.</summary>
        public void Resume() { if (FloorY.HasValue) phase = Phase.Capture; }

        public void Stop()
        {
            phase = Phase.Idle;
            SetPlaneVisibility(false);
            ClearPreview();
            if (meshManager != null) { meshManager.enabled = false; foreach (var m in meshManager.meshes) if (m) m.gameObject.SetActive(false); }
            if (occlusionManager != null) occlusionManager.requestedEnvironmentDepthMode = EnvironmentDepthMode.Disabled;
            if (pointSpray != null) pointSpray.Clear();
        }

        void SetPlaneVisibility(bool visible)
        {
            if (planeManager == null) return;
            foreach (var p in planeManager.trackables) foreach (var r in p.GetComponentsInChildren<Renderer>()) r.enabled = visible;
            planesVisible = visible;
        }
        bool planesVisible;

        void Update()
        {
            // Planes keep being detected after a scan (the live room uses them to lock the floor);
            // keep their visuals hidden unless a scan step wants them shown.
            if (planeManager != null && !planesVisible)
                foreach (var p in planeManager.trackables) foreach (var r in p.GetComponentsInChildren<Renderer>()) if (r.enabled) r.enabled = false;
            if (phase == Phase.Idle) return;
            if (phase == Phase.FindFloor) { DetectFloor(); return; }
            float now = Time.unscaledTime;
            if (now >= nextSample) { nextSample = now + 0.1f; SampleScreen(); }
            if (now >= nextTrajectory) { nextTrajectory = now + 0.2f; var p = arCamera.transform.position; grid.AddTrajectory(p.x, p.z); }
            if (now >= nextCloud) { nextCloud = now + 0.5f; SamplePointClouds(); SamplePlanes(); }
            if (now >= nextPreview) { nextPreview = now + 1f; UpdatePreview(); }
        }

        // ------------------------------------------------------------------ floor
        void DetectFloor()
        {
            if (planeManager == null || arCamera == null) return;
            float camY = arCamera.transform.position.y;
            ARPlane best = null;
            foreach (var p in planeManager.trackables)
            {
                if (p.alignment != PlaneAlignment.HorizontalUp || p.size.x * p.size.y < 0.25f) continue;
                if (p.center.y > camY - 0.5f) continue; // a table, not the floor
                if (best == null || p.center.y < best.center.y - 0.05f || (Mathf.Abs(p.center.y - best.center.y) < 0.05f && p.size.x * p.size.y > best.size.x * best.size.y)) best = p;
            }
            if (best == null) { Hint = "Point your phone at the floor and move it slowly"; return; }
            FloorY = FloorY.HasValue ? Mathf.Lerp(FloorY.Value, best.center.y, 0.2f) : best.center.y;
            floorSamples++;
            Hint = floorSamples > 15 ? "Floor found" : "Finding the floor...";
        }
        public bool FloorReady => FloorY.HasValue && floorSamples > 15;

        // ------------------------------------------------------------------ sampling
        const int Cols = 9, Rows = 15;
        void SampleScreen()
        {
            if (raycastManager == null) return;
            var mask = TrackableType.FeaturePoint | TrackableType.PlaneWithinPolygon | TrackableType.Depth;
            int added = 0;
            for (int i = 0; i < Cols; i++)
                for (int j = 0; j < Rows; j++)
                {
                    // Jitter the grid each frame so the spray covers every pixel over time.
                    var sp = new Vector2((i + UnityEngine.Random.value) / Cols * Screen.width, (j + UnityEngine.Random.value) / Rows * Screen.height);
                    if (!raycastManager.Raycast(sp, hits, mask) || hits.Count == 0) continue;
                    var hit = hits[0];
                    if (hit.distance > 6f) continue; // depth from motion is unreliable far away
                    var p = hit.pose.position;
                    grid.AddPoint(p.x, p.y, p.z);
                    if ((hit.hitType & TrackableType.PlaneWithinPolygon) != 0 && Mathf.Abs(p.y - (float)grid.floorY) < 0.05f) grid.AddFloor(p.x, p.z);
                    if (pointSpray != null && added++ < 40) Spray(p, (hit.hitType & TrackableType.Depth) != 0);
                }
        }

        void Spray(Vector3 p, bool depth)
        {
            var emit = new ParticleSystem.EmitParams { position = p, startSize = 0.018f, startLifetime = 6f, startColor = depth ? new Color(0.75f, 1f, 0.95f, 0.9f) : new Color(1f, 1f, 1f, 0.85f), applyShapeToPosition = false };
            pointSpray.Emit(emit, 1);
        }

        void SamplePointClouds()
        {
            if (pointCloudManager == null) return;
            foreach (var cloud in pointCloudManager.trackables)
            {
                if (!cloud.positions.HasValue) continue;
                var positions = cloud.positions.Value;
                NativeArray<float>? confidence = cloud.confidenceValues;
                for (int i = 0; i < positions.Length; i++)
                {
                    if (confidence.HasValue && confidence.Value.Length == positions.Length && confidence.Value[i] < 0.3f) continue;
                    var p = cloud.transform.TransformPoint(positions[i]);
                    if (Vector3.Distance(p, arCamera.transform.position) > 6f) continue;
                    grid.AddPoint(p.x, p.y, p.z);
                }
            }
        }

        void SamplePlanes()
        {
            if (planeManager == null) return;
            grid.verticalPlanes.Clear(); grid.surfaces.Clear();
            foreach (var p in planeManager.trackables)
            {
                float area = p.size.x * p.size.y;
                if (p.alignment == PlaneAlignment.Vertical && area > 0.3f)
                {
                    var c = p.center; var right = p.transform.right * (p.size.x / 2);
                    Vector3 a = c - right, b = c + right;
                    grid.verticalPlanes.Add((new P2(a.x, a.z), new P2(b.x, b.z), Math.Min(10, area * 3)));
                    // Plane edges also carry height information (ceiling and bands).
                    float top = c.y + p.size.y / 2, bottom = c.y - p.size.y / 2;
                    for (float t = 0; t <= 1.001f; t += 0.1f) { var q = Vector3.Lerp(a, b, t); grid.AddPoint(q.x, top, q.z); grid.AddPoint(q.x, Math.Max(bottom, (float)grid.floorY + 0.1f), q.z); }
                }
                else if (p.alignment == PlaneAlignment.HorizontalUp && p.center.y - grid.floorY > 0.25f && area > 0.08f)
                {
                    string label = (p.classifications & (PlaneClassifications.Table)) != 0 ? "table" : (p.classifications & (PlaneClassifications.Seat | PlaneClassifications.Couch)) != 0 ? "seat" : null;
                    grid.surfaces.Add(new Surface { center = new P2(p.center.x, p.center.z), sizeX = p.size.x, sizeZ = p.size.y, height = p.center.y, label = label });
                }
                else if (p.alignment == PlaneAlignment.HorizontalDown && p.center.y - grid.floorY > 2.0f && area > 0.5f)
                    grid.ceilingY = grid.ceilingY.HasValue ? Math.Min(grid.ceilingY.Value, p.center.y) : p.center.y;
            }
        }

        void OnMeshes(ARMeshesChangedEventArgs args)
        {
            if (phase != Phase.Capture) return;
            foreach (var mf in args.added.Concat(args.updated))
            {
                var mesh = mf.sharedMesh; if (mesh == null) continue;
                var verts = mesh.vertices; int step = Math.Max(1, verts.Length / 4000);
                for (int i = 0; i < verts.Length; i += step) { var p = mf.transform.TransformPoint(verts[i]); grid.AddPoint(p.x, p.y, p.z); }
            }
        }

        // ------------------------------------------------------------------ preview
        void UpdatePreview()
        {
            var segments = RoomReconstructor.PreviewWalls(grid);
            WallLineCount = segments.Count; WallLength = (float)segments.Sum(s => Geo.Dist(s.a, s.b));
            float y = (float)grid.floorY, top = y + 2.4f;
            int k = 0;
            foreach (var (a, b) in segments)
            {
                var lr = Pool(k++);
                lr.positionCount = 5;
                lr.SetPositions(new[] { new Vector3((float)a.x, y, (float)a.z), new Vector3((float)b.x, y, (float)b.z), new Vector3((float)b.x, top, (float)b.z), new Vector3((float)a.x, top, (float)a.z), new Vector3((float)a.x, y, (float)a.z) });
            }
            for (; k < previewLines.Count; k++) previewLines[k].positionCount = 0;
            var tracking = ARSession.notTrackingReason;
            if (ARSession.state != ARSessionState.SessionTracking) Hint = tracking == NotTrackingReason.ExcessiveMotion ? "Slow down a little" : tracking == NotTrackingReason.InsufficientLight ? "It's too dark - turn on a light" : tracking == NotTrackingReason.InsufficientFeatures ? "Aim at something with more detail" : "Hold steady...";
            else if (WallLineCount < 3) Hint = "Walk along the walls and sweep from floor to ceiling";
            else if (grid.trajectory.Count < 10) Hint = "Walk around the room so every wall is seen";
            else Hint = $"{WallLineCount} wall sections | {WallLength:0.0} m captured. Tap Finish when every wall is outlined.";
        }
        LineRenderer Pool(int i)
        {
            while (previewLines.Count <= i)
            {
                var lr = MeshKit.Line(previewRoot, "Wall", Color.white, 0.02f, false); lr.useWorldSpace = true; previewLines.Add(lr);
            }
            return previewLines[i];
        }
        void ClearPreview()
        {
            foreach (var l in previewLines) l.positionCount = 0;
            cornerLine.positionCount = 0;
        }

        // ------------------------------------------------------------------ manual corners
        /// <summary>Floor point under a screen position (ray against the detected floor height).</summary>
        public bool FloorPoint(Vector2 screen, out Vector3 point)
        {
            point = default;
            if (!FloorY.HasValue || arCamera == null) return false;
            var ray = arCamera.ScreenPointToRay(screen);
            var plane = new Plane(Vector3.up, new Vector3(0, FloorY.Value, 0));
            if (!plane.Raycast(ray, out float enter) || enter > 15) return false;
            point = ray.GetPoint(enter);
            return true;
        }
        public void AddCorner(Vector3 p) { manualCorners.Add(p); RedrawCorners(); }
        public void UndoCorner() { if (manualCorners.Count > 0) manualCorners.RemoveAt(manualCorners.Count - 1); RedrawCorners(); }
        void RedrawCorners()
        {
            cornerLine.positionCount = manualCorners.Count == 0 ? 0 : manualCorners.Count + (manualCorners.Count >= 3 ? 1 : 0);
            for (int i = 0; i < manualCorners.Count; i++) cornerLine.SetPosition(i, manualCorners[i] + Vector3.up * 0.01f);
            if (manualCorners.Count >= 3) cornerLine.SetPosition(manualCorners.Count, manualCorners[0] + Vector3.up * 0.01f);
        }

        // ------------------------------------------------------------------ result
        public Task<ScanResult> FinishAsync(bool useCorners)
        {
            phase = Phase.Idle;
            var corners = useCorners && manualCorners.Count >= 3 ? manualCorners.Select(c => new P2(c.x, c.z)).ToList() : null;
            Func<string, (double, double, double)> dims = t => { var d = Catalog.Get(t); return (d.w, d.h, d.d); };
            // Catalog lookups use Unity APIs only on first load; load it here on the main thread.
            _ = Catalog.Items;
            var snapshot = grid.Snapshot();
            return Task.Run(() => RoomReconstructor.Reconstruct(snapshot, corners, dims));
        }

        /// <summary>The raw sample cloud as OBJ line segments (room-local web coordinates) for the website's "Show scan".</summary>
        public static byte[] ExportCloudObj(ScanGrid grid, ScanResult result)
        {
            var sb = new StringBuilder("# RealTweak scan samples (meters, web coordinates)\n");
            int n = 0;
            var ci = System.Globalization.CultureInfo.InvariantCulture;
            foreach (var kv in grid.cells)
            {
                if (kv.Value.count < 2 || n > 120000) continue;
                var local = result.ToLocal(new P2((ScanGrid.IX(kv.Key) + 0.5) * ScanGrid.Cell, (ScanGrid.IZ(kv.Key) + 0.5) * ScanGrid.Cell));
                double y0 = kv.Value.minY - grid.floorY, y1 = Math.Max(kv.Value.maxY - grid.floorY, y0 + 0.02);
                sb.AppendFormat(ci, "v {0:0.###} {1:0.###} {2:0.###}\nv {0:0.###} {3:0.###} {2:0.###}\n", local.x, y0, -local.z, y1);
                n += 2;
                sb.AppendFormat(ci, "l {0} {1}\n", n - 1, n);
            }
            return Encoding.UTF8.GetBytes(sb.ToString());
        }
    }
}
