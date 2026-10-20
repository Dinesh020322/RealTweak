// Builds the RealTweak AR scene, materials, prefabs and player settings from code.
//   Menu: RealTweak ▸ Build App Scene      (or -executeMethod RealTweak.EditorTools.RealTweakSetup.BuildScene)
//   Menu: RealTweak ▸ Build Android APK    (or -executeMethod RealTweak.EditorTools.RealTweakSetup.BuildAndroid)
using System.IO;
using Unity.XR.CoreUtils;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace RealTweak.EditorTools
{
    public static class RealTweakSetup
    {
        const string Root = "Assets/RealTweak";
        const string ScenePath = "Assets/Scenes/RealTweakAR.unity";

        [MenuItem("RealTweak/Build App Scene")]
        public static void BuildScene()
        {
            Directory.CreateDirectory($"{Root}/Resources"); Directory.CreateDirectory($"{Root}/Prefabs"); Directory.CreateDirectory("Assets/Scenes");
            AssetDatabase.Refresh();
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            var litMat = SaveMaterial($"{Root}/Resources/RealTweakLit.mat", new Material(lit));
            var transparent = new Material(lit); MeshKit.MakeTransparent(transparent); transparent.SetColor("_BaseColor", new Color(1, 1, 1, 0.3f));
            SaveMaterial($"{Root}/Resources/RealTweakTransparent.mat", transparent);
            SaveMaterial($"{Root}/Resources/RealTweakUnlit.mat", new Material(Shader.Find("Universal Render Pipeline/Unlit")));
            var particles = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit"));
            particles.SetFloat("_Surface", 1); particles.EnableKeyword("_SURFACE_TYPE_TRANSPARENT"); particles.renderQueue = 3000;
            particles.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); particles.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha); particles.SetFloat("_ZWrite", 0);
            particles = SaveMaterial($"{Root}/Resources/RealTweakParticles.mat", particles);
            var planeMat = new Material(lit); MeshKit.MakeTransparent(planeMat); planeMat.SetColor("_BaseColor", new Color(0.55f, 0.85f, 0.75f, 0.22f));
            planeMat = SaveMaterial($"{Root}/Resources/RealTweakPlane.mat", planeMat);
            var meshMat = new Material(lit); MeshKit.MakeTransparent(meshMat); meshMat.SetColor("_BaseColor", new Color(1, 1, 1, 0.18f));
            meshMat = SaveMaterial($"{Root}/Resources/RealTweakLidarMesh.mat", meshMat);

            var planePrefab = SavePrefab($"{Root}/Prefabs/RealTweakPlane.prefab", () =>
            {
                var go = new GameObject("AR Plane");
                go.AddComponent<ARPlane>(); go.AddComponent<MeshFilter>();
                var mr = go.AddComponent<MeshRenderer>(); mr.sharedMaterial = planeMat; mr.shadowCastingMode = ShadowCastingMode.Off;
                go.AddComponent<ARPlaneMeshVisualizer>();
                return go;
            });
            var meshPrefab = SavePrefab($"{Root}/Prefabs/RealTweakLidarMesh.prefab", () =>
            {
                var go = new GameObject("LiDAR Mesh");
                go.AddComponent<MeshFilter>();
                var mr = go.AddComponent<MeshRenderer>(); mr.sharedMaterial = meshMat; mr.shadowCastingMode = ShadowCastingMode.Off;
                return go;
            });

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var session = new GameObject("AR Session");
            session.AddComponent<ARSession>(); session.AddComponent<ARInputManager>();

            var originGo = new GameObject("XR Origin");
            var origin = originGo.AddComponent<XROrigin>();
            var offset = new GameObject("Camera Offset"); offset.transform.SetParent(originGo.transform, false);
            var camGo = new GameObject("AR Camera") { tag = "MainCamera" };
            camGo.transform.SetParent(offset.transform, false);
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = Color.black; cam.nearClipPlane = 0.05f; cam.farClipPlane = 60;
            cam.cullingMask = ~(1 << IconRenderer.Layer);
            var camData = camGo.AddComponent<UniversalAdditionalCameraData>(); camData.renderShadows = true;
            camGo.AddComponent<ARCameraManager>();
            camGo.AddComponent<ARCameraBackground>();
            var occlusion = camGo.AddComponent<AROcclusionManager>();
            occlusion.requestedEnvironmentDepthMode = EnvironmentDepthMode.Disabled;
            occlusion.requestedOcclusionPreferenceMode = OcclusionPreferenceMode.NoOcclusion;
            var tpd = camGo.AddComponent<TrackedPoseDriver>();
            tpd.positionInput = new InputActionProperty(Action("Position", "Vector3", "<XRHMD>/centerEyePosition", "<HandheldARInputDevice>/devicePosition"));
            tpd.rotationInput = new InputActionProperty(Action("Rotation", "Quaternion", "<XRHMD>/centerEyeRotation", "<HandheldARInputDevice>/deviceRotation"));
            tpd.trackingStateInput = new InputActionProperty(Action("Tracking State", "Integer", "<XRHMD>/trackingState", "<HandheldARInputDevice>/trackingState"));
            origin.Camera = cam; origin.CameraFloorOffsetObject = offset;

            var planes = originGo.AddComponent<ARPlaneManager>();
            planes.planePrefab = planePrefab; planes.requestedDetectionMode = PlaneDetectionMode.Horizontal | PlaneDetectionMode.Vertical;
            var raycasts = originGo.AddComponent<ARRaycastManager>();
            var clouds = originGo.AddComponent<ARPointCloudManager>();
            var anchors = originGo.AddComponent<ARAnchorManager>();
            var meshing = new GameObject("LiDAR Meshing"); meshing.transform.SetParent(originGo.transform, false);
            var meshManager = meshing.AddComponent<ARMeshManager>();
            meshManager.meshPrefab = meshPrefab.GetComponent<MeshFilter>(); meshManager.density = 0.5f; meshManager.normals = true; meshManager.enabled = false;

            var light = new GameObject("Directional Light").AddComponent<Light>();
            light.type = LightType.Directional; light.intensity = 1.1f; light.shadows = LightShadows.Soft; light.shadowStrength = 0.55f;
            light.transform.rotation = Quaternion.Euler(55, -35, 0);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.85f, 0.87f, 0.9f); RenderSettings.ambientEquatorColor = new Color(0.62f, 0.62f, 0.6f); RenderSettings.ambientGroundColor = new Color(0.35f, 0.33f, 0.3f);

            var sprayGo = new GameObject("Scan Points");
            var spray = sprayGo.AddComponent<ParticleSystem>();
            var main = spray.main; main.simulationSpace = ParticleSystemSimulationSpace.World; main.maxParticles = 6000; main.startSpeed = 0; main.startLifetime = 6; main.gravityModifier = 0; main.playOnAwake = true; main.loop = true;
            var emission = spray.emission; emission.rateOverTime = 0;
            var shape = spray.shape; shape.enabled = false;
            var psr = sprayGo.GetComponent<ParticleSystemRenderer>(); psr.sharedMaterial = particles; psr.renderMode = ParticleSystemRenderMode.Billboard; psr.minParticleSize = 0.002f; psr.maxParticleSize = 0.02f;

            var app = new GameObject("RealTweak App");
            var scanner = app.AddComponent<ScanCapture>();
            scanner.raycastManager = raycasts; scanner.planeManager = planes; scanner.pointCloudManager = clouds; scanner.meshManager = meshManager; scanner.occlusionManager = occlusion; scanner.arCamera = cam; scanner.pointSpray = spray;
            var interaction = app.AddComponent<ARInteraction>(); interaction.arCamera = cam;
            app.AddComponent<IconRenderer>();
            var controller = app.AddComponent<AppController>();
            controller.arCamera = cam; controller.scanner = scanner; controller.interaction = interaction; controller.anchorManager = anchors; controller.planeManager = planes;

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            ConfigurePlayer();
            AssetDatabase.SaveAssets();
            Debug.Log($"RealTweak: scene built at {ScenePath} with material {litMat.name}.");
        }

        static InputAction Action(string name, string type, params string[] bindings)
        {
            var a = new InputAction(name, InputActionType.Value, expectedControlType: type);
            foreach (var b in bindings) a.AddBinding(b);
            return a;
        }

        static Material SaveMaterial(string path, Material m)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null) { existing.shader = m.shader; existing.CopyPropertiesFromMaterial(m); existing.shaderKeywords = m.shaderKeywords; existing.renderQueue = m.renderQueue; EditorUtility.SetDirty(existing); return existing; }
            AssetDatabase.CreateAsset(m, path); return m;
        }
        static GameObject SavePrefab(string path, System.Func<GameObject> build)
        {
            var go = build();
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, path);
            Object.DestroyImmediate(go);
            return prefab;
        }

        static void ConfigurePlayer()
        {
            PlayerSettings.productName = "RealTweak AR";
            PlayerSettings.companyName = "FourFriendsInteractive";
            PlayerSettings.bundleVersion = "2.0.0";
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Android, "com.FourFriendsInteractive.RealTweakAR");
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.iOS, "com.FourFriendsInteractive.RealTweakAR");
            PlayerSettings.Android.bundleVersionCode = Mathf.Max(PlayerSettings.Android.bundleVersionCode, 2);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.OpenGLES3 });
            // ARCore's minimum (Android 7.0). Lower than this cannot run AR; higher only excludes phones.
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.iOS.cameraUsageDescription = "RealTweak uses the camera to scan your room and show furniture in AR.";
            PlayerSettings.iOS.targetOSVersionString = "15.0";
        }

        [MenuItem("RealTweak/Build Android APK")]
        public static void BuildAndroid()
        {
            if (!File.Exists(ScenePath)) BuildScene();
            ConfigurePlayer();
            Directory.CreateDirectory("Builds");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath }, locationPathName = "Builds/RealTweakAR.apk", target = BuildTarget.Android, options = BuildOptions.None,
            });
            Debug.Log($"RealTweak: Android build {report.summary.result} - {report.summary.totalSize / (1024 * 1024)} MB, {report.summary.totalErrors} errors.");
            if (Application.isBatchMode) EditorApplication.Exit(report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded ? 0 : 1);
        }
    }
}
