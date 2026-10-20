using UnityEngine;
using UnityEngine.XR.ARFoundation;
using System.Collections.Generic;

/// <summary>
/// Simplified Room Plan Style Mesh Generator - Version Compatible
/// Works with all AR Foundation versions
/// </summary>
public class RoomPlanStyleMeshGenerator  : MonoBehaviour
{
    [Header("AR References")]
    public ARPlaneManager planeManager;
    public ARMeshManager meshManager;
    
    [Header("Materials")]
    public Material meshMaterial;  // For dense mesh (LiDAR devices)
    public Material planeMaterial; // For planes (non-LiDAR devices)
    public Material furnitureMaterial;
    
    [Header("Device Detection")]
    [Tooltip("Enable this if you're testing on a LiDAR device (iPhone 12 Pro or later, iPad Pro 2020+)")]
    public bool forceLiDARMode = false;
    
    [Tooltip("Let the script auto-detect based on ARMeshManager availability")]
    public bool autoDetectLiDAR = true;
    
    [Header("Mesh Settings")]
    [Tooltip("Show planes even when using dense mesh")]
    public bool showPlanesWithMesh = false;
    
    [Header("Visual Settings")]
    public float meshTransparency = 0.7f;
    
    private GameObject furnitureContainer;
    private List<GameObject> furnitureObjects = new List<GameObject>();
    private List<ARPlane> trackedPlanes = new List<ARPlane>();
    private List<MeshFilter> trackedMeshes = new List<MeshFilter>();
    
    private bool useDenseMesh = false;
    
    void Awake()
    {
        furnitureContainer = new GameObject("Furniture");
        furnitureContainer.transform.SetParent(transform);
    }
    
    void Start()
    {
        DetectDeviceCapabilities();
        SetupARComponents();
    }
    
    void DetectDeviceCapabilities()
    {
        // Simple detection logic
        if (forceLiDARMode)
        {
            useDenseMesh = true;
            Debug.Log("✅ LiDAR mode FORCED by user setting");
        }
        else if (autoDetectLiDAR && meshManager != null)
        {
            // If ARMeshManager is available and can be used, assume LiDAR
            useDenseMesh = true;
            Debug.Log("✅ ARMeshManager available - enabling dense mesh mode");
        }
        else
        {
            useDenseMesh = false;
            Debug.Log("⚠️ Using plane detection mode");
        }
    }
    
    void SetupARComponents()
    {
        if (useDenseMesh && meshManager != null)
        {
            EnableDenseMeshScanning();
        }
        else
        {
            EnablePlaneDetection();
        }
    }
    
    void EnableDenseMeshScanning()
    {
        Debug.Log("🎯 Enabling DENSE MESH scanning (Apple RoomPlan style)");
        
        if (meshManager != null)
        {
            meshManager.enabled = true;
            meshManager.meshesChanged += OnMeshesChanged;
            Debug.Log("✅ ARMeshManager enabled");
        }
        
        if (planeManager != null)
        {
            if (showPlanesWithMesh)
            {
                planeManager.enabled = true;
                planeManager.planesChanged += OnPlanesChanged;
                Debug.Log("✅ ARPlaneManager enabled (with mesh)");
            }
            else
            {
                planeManager.enabled = false;
                Debug.Log("⚠️ ARPlaneManager disabled (using mesh only)");
            }
        }
    }
    
    void EnablePlaneDetection()
    {
        Debug.Log("🎯 Enabling PLANE detection (non-LiDAR mode)");
        
        if (planeManager != null)
        {
            planeManager.enabled = true;
            planeManager.planesChanged += OnPlanesChanged;
            Debug.Log("✅ ARPlaneManager enabled");
        }
        
        if (meshManager != null)
        {
            meshManager.enabled = false;
            Debug.Log("⚠️ ARMeshManager disabled (no LiDAR)");
        }
    }
    
    void OnMeshesChanged(ARMeshesChangedEventArgs args)
    {
        foreach (var meshFilter in args.added)
        {
            ApplyMaterialToMesh(meshFilter);
            trackedMeshes.Add(meshFilter);
            Debug.Log($"➕ Dense mesh added: {meshFilter.name}");
        }
        
        foreach (var meshFilter in args.updated)
        {
            ApplyMaterialToMesh(meshFilter);
        }
        
        foreach (var meshFilter in args.removed)
        {
            trackedMeshes.Remove(meshFilter);
            Debug.Log($"➖ Dense mesh removed: {meshFilter.name}");
        }
    }
    
    void ApplyMaterialToMesh(MeshFilter meshFilter)
    {
        if (meshFilter == null) return;
        
        MeshRenderer renderer = meshFilter.GetComponent<MeshRenderer>();
        if (renderer != null && meshMaterial != null)
        {
            renderer.material = meshMaterial;
            
            Color color = meshMaterial.color;
            color.a = meshTransparency;
            renderer.material.color = color;
        }
    }
    
    void OnPlanesChanged(ARPlanesChangedEventArgs args)
    {
        foreach (var plane in args.added)
        {
            ApplyMaterialToPlane(plane);
            trackedPlanes.Add(plane);
            Debug.Log($"➕ Plane detected: {plane.trackableId}");
        }
        
        foreach (var plane in args.updated)
        {
            ApplyMaterialToPlane(plane);
        }
        
        foreach (var plane in args.removed)
        {
            trackedPlanes.Remove(plane);
        }
    }
    
    void ApplyMaterialToPlane(ARPlane plane)
    {
        MeshRenderer renderer = plane.GetComponent<MeshRenderer>();
        if (renderer != null && planeMaterial != null)
        {
            renderer.material = planeMaterial;
        }
    }
    
    public void GenerateRoomMesh(RoomScanner.RoomData roomData)
    {
        Debug.Log($"🎨 Generating room in {(useDenseMesh ? "DENSE MESH" : "PLANE")} mode");
        
        ClearFurniture();
        
        if (useDenseMesh)
        {
            ApplyMaterialsToAllMeshes();
        }
        else
        {
            ApplyMaterialsToAllPlanes();
        }
        
        if (roomData.furniture != null && roomData.furniture.Count > 0)
        {
            GenerateFurniture(roomData.furniture);
        }
        
        Debug.Log("✅ Room generation complete!");
    }
    
    void ApplyMaterialsToAllMeshes()
    {
        if (meshManager == null) return;
        
        int count = 0;
        foreach (var meshFilter in meshManager.meshes)
        {
            if (meshFilter != null)
            {
                ApplyMaterialToMesh(meshFilter);
                if (!trackedMeshes.Contains(meshFilter))
                {
                    trackedMeshes.Add(meshFilter);
                }
                count++;
            }
        }
        Debug.Log($"✅ Applied materials to {count} dense meshes");
    }
    
    void ApplyMaterialsToAllPlanes()
    {
        if (planeManager == null) return;
        
        int count = 0;
        foreach (var plane in planeManager.trackables)
        {
            ApplyMaterialToPlane(plane);
            if (!trackedPlanes.Contains(plane))
            {
                trackedPlanes.Add(plane);
            }
            count++;
        }
        Debug.Log($"✅ Applied materials to {count} planes");
    }
    
    void GenerateFurniture(List<RoomScanner.FurnitureItem> furniture)
    {
        Debug.Log($"🪑 Generating {furniture.Count} furniture items");
        
        foreach (var item in furniture)
        {
            CreateFurnitureObject(item);
        }
    }
    
    void CreateFurnitureObject(RoomScanner.FurnitureItem item)
    {
        GameObject furnitureObj = null;
        
        switch (item.type.ToLower())
        {
            case "chair":
                furnitureObj = CreateChair();
                break;
            case "table":
                furnitureObj = CreateTable();
                break;
            case "sofa":
                furnitureObj = CreateSofa();
                break;
            case "bed":
                furnitureObj = CreateBed();
                break;
            default:
                furnitureObj = CreateChair();
                break;
        }
        
        if (furnitureObj != null)
        {
            furnitureObj.name = $"{item.type}_{item.id}";
            furnitureObj.transform.SetParent(furnitureContainer.transform);
            furnitureObj.transform.position = item.position;
            furnitureObj.transform.rotation = item.rotation;
            furnitureObj.transform.localScale = item.scale;
            
            furnitureObjects.Add(furnitureObj);
            
            Debug.Log($"✅ Created {item.type} at {item.position}");
        }
    }
    
    GameObject CreateChair()
    {
        GameObject chair = new GameObject("Chair");
        
        GameObject seat = GameObject.CreatePrimitive(PrimitiveType.Cube);
        seat.transform.SetParent(chair.transform);
        seat.transform.localPosition = new Vector3(0, 0.6f, 0);
        seat.transform.localScale = new Vector3(0.6f, 0.15f, 0.6f);
        if (furnitureMaterial != null)
            seat.GetComponent<Renderer>().material = furnitureMaterial;
        else
            seat.GetComponent<Renderer>().material.color = new Color(0.545f, 0.27f, 0.074f);
        
        GameObject backrest = GameObject.CreatePrimitive(PrimitiveType.Cube);
        backrest.transform.SetParent(chair.transform);
        backrest.transform.localPosition = new Vector3(0, 1.0f, -0.25f);
        backrest.transform.localScale = new Vector3(0.6f, 0.8f, 0.1f);
        if (furnitureMaterial != null)
            backrest.GetComponent<Renderer>().material = furnitureMaterial;
        else
            backrest.GetComponent<Renderer>().material.color = new Color(0.545f, 0.27f, 0.074f);
        
        float[] legPositions = { -0.25f, 0.25f };
        foreach (float x in legPositions)
        {
            foreach (float z in legPositions)
            {
                GameObject leg = GameObject.CreatePrimitive(PrimitiveType.Cube);
                leg.transform.SetParent(chair.transform);
                leg.transform.localPosition = new Vector3(x, 0.3f, z);
                leg.transform.localScale = new Vector3(0.08f, 0.6f, 0.08f);
                if (furnitureMaterial != null)
                    leg.GetComponent<Renderer>().material = furnitureMaterial;
                else
                    leg.GetComponent<Renderer>().material.color = new Color(0.4f, 0.2f, 0.063f);
            }
        }
        
        return chair;
    }
    
    GameObject CreateTable()
    {
        GameObject table = new GameObject("Table");
        GameObject top = GameObject.CreatePrimitive(PrimitiveType.Cube);
        top.transform.SetParent(table.transform);
        top.transform.localPosition = new Vector3(0, 0.85f, 0);
        top.transform.localScale = new Vector3(2.5f, 0.15f, 1.5f);
        if (furnitureMaterial != null)
            top.GetComponent<Renderer>().material = furnitureMaterial;
        return table;
    }
    
    GameObject CreateSofa()
    {
        GameObject sofa = new GameObject("Sofa");
        GameObject base_obj = GameObject.CreatePrimitive(PrimitiveType.Cube);
        base_obj.transform.SetParent(sofa.transform);
        base_obj.transform.localPosition = new Vector3(0, 0.5f, 0);
        base_obj.transform.localScale = new Vector3(2.5f, 0.6f, 1.0f);
        if (furnitureMaterial != null)
            base_obj.GetComponent<Renderer>().material = furnitureMaterial;
        return sofa;
    }
    
    GameObject CreateBed()
    {
        GameObject bed = new GameObject("Bed");
        GameObject mattress = GameObject.CreatePrimitive(PrimitiveType.Cube);
        mattress.transform.SetParent(bed.transform);
        mattress.transform.localPosition = new Vector3(0, 0.5f, 0);
        mattress.transform.localScale = new Vector3(2.5f, 0.4f, 2.0f);
        if (furnitureMaterial != null)
            mattress.GetComponent<Renderer>().material = furnitureMaterial;
        return bed;
    }
    
    public void UpdateFurniture(List<RoomScanner.FurnitureItem> furniture)
    {
        ClearFurniture();
        GenerateFurniture(furniture);
    }
    
    public Mesh ExportRoomMesh()
    {
        List<CombineInstance> combineInstances = new List<CombineInstance>();
        
        if (useDenseMesh)
        {
            foreach (var meshFilter in trackedMeshes)
            {
                if (meshFilter != null && meshFilter.sharedMesh != null)
                {
                    CombineInstance ci = new CombineInstance();
                    ci.mesh = meshFilter.sharedMesh;
                    ci.transform = meshFilter.transform.localToWorldMatrix;
                    combineInstances.Add(ci);
                }
            }
        }
        else
        {
            foreach (var plane in trackedPlanes)
            {
                if (plane != null)
                {
                    MeshFilter mf = plane.GetComponent<MeshFilter>();
                    if (mf != null && mf.sharedMesh != null)
                    {
                        CombineInstance ci = new CombineInstance();
                        ci.mesh = mf.sharedMesh;
                        ci.transform = plane.transform.localToWorldMatrix;
                        combineInstances.Add(ci);
                    }
                }
            }
        }
        
        if (combineInstances.Count == 0)
        {
            Debug.LogWarning("⚠️ No meshes to export!");
            return null;
        }
        
        Mesh combinedMesh = new Mesh();
        combinedMesh.name = "ExportedRoomMesh";
        combinedMesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
        combinedMesh.CombineMeshes(combineInstances.ToArray(), true, true);
        combinedMesh.RecalculateNormals();
        combinedMesh.RecalculateBounds();
        
        Debug.Log($"✅ Exported mesh: {combinedMesh.vertexCount} vertices");
        return combinedMesh;
    }
    
    void ClearFurniture()
    {
        foreach (var obj in furnitureObjects)
        {
            if (obj != null) Destroy(obj);
        }
        furnitureObjects.Clear();
    }
    
    void OnDestroy()
    {
        if (planeManager != null)
            planeManager.planesChanged -= OnPlanesChanged;
        
        if (meshManager != null)
            meshManager.meshesChanged -= OnMeshesChanged;
    }
}