using UnityEngine;
using UnityEngine.XR.ARFoundation;
using System.Collections.Generic;

public class RoomMeshGenerator : MonoBehaviour
{
    [Header("AR References")]
    public ARPlaneManager planeManager;
    
    [Header("Materials")]
    public Material floorMaterial;
    public Material furnitureMaterial;
    
    private GameObject furnitureContainer;
    private List<GameObject> furnitureObjects = new List<GameObject>();
    private List<ARPlane> trackedPlanes = new List<ARPlane>();
    
    void Awake()
    {
        furnitureContainer = new GameObject("Furniture");
        furnitureContainer.transform.SetParent(transform);
    }
    
    void Start()
    {
        if (planeManager != null)
        {
            // Subscribe to plane changes
            planeManager.planesChanged += OnPlanesChanged;
            Debug.Log("✅ Subscribed to AR plane changes");
        }
        else
        {
            Debug.LogError("❌ ARPlaneManager not assigned!");
        }
    }
    
    void OnPlanesChanged(ARPlanesChangedEventArgs args)
    {
        // Apply material to newly detected planes
        foreach (var plane in args.added)
        {
            ApplyMaterialToPlane(plane);
            trackedPlanes.Add(plane);
            Debug.Log($"➕ New plane detected: {plane.trackableId}");
        }
        
        // Update materials on modified planes
        foreach (var plane in args.updated)
        {
            ApplyMaterialToPlane(plane);
        }
        
        // Remove deleted planes from tracking
        foreach (var plane in args.removed)
        {
            trackedPlanes.Remove(plane);
            Debug.Log($"➖ Plane removed: {plane.trackableId}");
        }
    }
    
    void ApplyMaterialToPlane(ARPlane plane)
    {
        // Get the MeshRenderer from the AR plane
        MeshRenderer renderer = plane.GetComponent<MeshRenderer>();
        
        if (renderer != null && floorMaterial != null)
        {
            // Apply your custom floor material to the AR plane
            renderer.material = floorMaterial;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = true;
            
            Debug.Log($"✅ Applied material to AR plane: {plane.trackableId}");
        }
        else
        {
            Debug.LogWarning($"⚠️ Cannot apply material - Renderer: {renderer != null}, Material: {floorMaterial != null}");
        }
    }
    
    public void GenerateRoomMesh(RoomScanner.RoomData roomData)
    {
        Debug.Log("🎨 Using AR plane tracking meshes...");
        
        // Clear existing furniture
        ClearFurniture();
        
        // Apply materials to all currently tracked AR planes
        if (planeManager != null)
        {
            int planeCount = 0;
            foreach (var plane in planeManager.trackables)
            {
                ApplyMaterialToPlane(plane);
                
                if (!trackedPlanes.Contains(plane))
                {
                    trackedPlanes.Add(plane);
                }
                planeCount++;
            }
            
            Debug.Log($"✅ Applied materials to {planeCount} AR planes");
        }
        
        // Generate furniture from Firebase data
        if (roomData.furniture != null && roomData.furniture.Count > 0)
        {
            GenerateFurniture(roomData.furniture);
        }
        
        Debug.Log("✅ Room mesh update complete!");
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
        else
            top.GetComponent<Renderer>().material.color = new Color(0.4f, 0.2f, 0.063f);
        
        float[][] legPositions = new float[][] 
        {
            new float[] { -1.1f, -0.6f },
            new float[] { 1.1f, -0.6f },
            new float[] { -1.1f, 0.6f },
            new float[] { 1.1f, 0.6f }
        };
        
        foreach (var pos in legPositions)
        {
            GameObject leg = GameObject.CreatePrimitive(PrimitiveType.Cube);
            leg.transform.SetParent(table.transform);
            leg.transform.localPosition = new Vector3(pos[0], 0.4f, pos[1]);
            leg.transform.localScale = new Vector3(0.1f, 0.8f, 0.1f);
            
            if (furnitureMaterial != null)
                leg.GetComponent<Renderer>().material = furnitureMaterial;
            else
                leg.GetComponent<Renderer>().material.color = new Color(0.29f, 0.145f, 0.067f);
        }
        
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
        else
            base_obj.GetComponent<Renderer>().material.color = new Color(0.255f, 0.412f, 0.882f);
        
        GameObject back = GameObject.CreatePrimitive(PrimitiveType.Cube);
        back.transform.SetParent(sofa.transform);
        back.transform.localPosition = new Vector3(0, 0.9f, -0.375f);
        back.transform.localScale = new Vector3(2.5f, 0.9f, 0.25f);
        
        if (furnitureMaterial != null)
            back.GetComponent<Renderer>().material = furnitureMaterial;
        else
            back.GetComponent<Renderer>().material.color = new Color(0.255f, 0.412f, 0.882f);
        
        for (int i = 0; i < 2; i++)
        {
            GameObject arm = GameObject.CreatePrimitive(PrimitiveType.Cube);
            arm.transform.SetParent(sofa.transform);
            arm.transform.localPosition = new Vector3(i == 0 ? -1.25f : 1.25f, 0.7f, 0);
            arm.transform.localScale = new Vector3(0.25f, 0.6f, 1.0f);
            
            if (furnitureMaterial != null)
                arm.GetComponent<Renderer>().material = furnitureMaterial;
            else
                arm.GetComponent<Renderer>().material.color = new Color(0.255f, 0.412f, 0.882f);
        }
        
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
        else
            mattress.GetComponent<Renderer>().material.color = new Color(0.863f, 0.078f, 0.235f);
        
        GameObject frame = GameObject.CreatePrimitive(PrimitiveType.Cube);
        frame.transform.SetParent(bed.transform);
        frame.transform.localPosition = new Vector3(0, 0.3f, 0);
        frame.transform.localScale = new Vector3(2.7f, 0.3f, 2.2f);
        
        if (furnitureMaterial != null)
            frame.GetComponent<Renderer>().material = furnitureMaterial;
        else
            frame.GetComponent<Renderer>().material.color = new Color(0.545f, 0.27f, 0.074f);
        
        GameObject headboard = GameObject.CreatePrimitive(PrimitiveType.Cube);
        headboard.transform.SetParent(bed.transform);
        headboard.transform.localPosition = new Vector3(0, 1.0f, -1.0f);
        headboard.transform.localScale = new Vector3(2.8f, 1.2f, 0.15f);
        
        if (furnitureMaterial != null)
            headboard.GetComponent<Renderer>().material = furnitureMaterial;
        else
            headboard.GetComponent<Renderer>().material.color = new Color(0.545f, 0.27f, 0.074f);
        
        return bed;
    }
    
    public void UpdateFurniture(List<RoomScanner.FurnitureItem> furniture)
    {
        ClearFurniture();
        GenerateFurniture(furniture);
    }
    
    public Mesh ExportRoomMesh()
    {
        // Export the combined AR plane meshes
        List<CombineInstance> combineInstances = new List<CombineInstance>();
        
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
        
        // Add furniture meshes
        foreach (var furnitureObj in furnitureObjects)
        {
            if (furnitureObj != null)
            {
                MeshFilter[] meshFilters = furnitureObj.GetComponentsInChildren<MeshFilter>();
                foreach (var mf in meshFilters)
                {
                    if (mf.sharedMesh != null)
                    {
                        CombineInstance ci = new CombineInstance();
                        ci.mesh = mf.sharedMesh;
                        ci.transform = mf.transform.localToWorldMatrix;
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
        combinedMesh.CombineMeshes(combineInstances.ToArray(), true, true);
        combinedMesh.RecalculateNormals();
        combinedMesh.RecalculateBounds();
        
        Debug.Log($"✅ Exported mesh: {combinedMesh.vertexCount} vertices from {trackedPlanes.Count} AR planes");
        return combinedMesh;
    }
    
    void ClearFurniture()
    {
        foreach (var obj in furnitureObjects)
        {
            if (obj != null)
            {
                Destroy(obj);
            }
        }
        furnitureObjects.Clear();
    }
    
    void OnDestroy()
    {
        if (planeManager != null)
        {
            planeManager.planesChanged -= OnPlanesChanged;
        }
    }
}