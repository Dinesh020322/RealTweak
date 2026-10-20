using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using System.Collections.Generic;
using System.Linq;
 
public class RoomScanner : MonoBehaviour
{
    [Header("AR Components")]
    public ARPlaneManager planeManager;
    public ARRaycastManager raycastManager;
    public ARMeshManager meshManager;
    
    [Header("Scanning Settings")]
    public float scanDuration = 30f;
    public Material scanMaterial;
    public Material completedMaterial;
    
    [Header("References")]
    public RoomMeshGenerator meshGenerator;
    public FirebaseManager firebaseManager;
    
    private List<ARPlane> detectedPlanes = new List<ARPlane>();
    private List<Vector3> wallPoints = new List<Vector3>();
    private List<Vector3> floorPoints = new List<Vector3>();
    private bool isScanning = false;
    private float scanTimer = 0f;
    private RoomData currentRoom;
    
    public class RoomData
    {
        public string roomId;
        public List<WallSegment> walls;
        public FloorData floor;
        public List<FurnitureItem> furniture;
        public Vector3 roomDimensions;
        public long timestamp;
    }
    
    [System.Serializable]
    public class WallSegment
    {
        public Vector3 startPoint;
        public Vector3 endPoint;
        public float height;
        public float thickness;
    }
    
    [System.Serializable]
    public class FloorData
    {
        public List<Vector3> vertices;
        public Vector3 center;
        public float area;
    }
    
    [System.Serializable]
    public class FurnitureItem
    {
        public string id;
        public string type;
        public Vector3 position;
        public Quaternion rotation;
        public Vector3 scale;
        public long timestamp;
    }
    
    void Start()
{
    if (planeManager != null)
    {
        planeManager.planesChanged += OnPlanesChanged;
    }
    
    // Generate a 4-digit ID (Between 1000 and 9999)
    string simpleRoomId = UnityEngine.Random.Range(1000, 10000).ToString();

    currentRoom = new RoomData
    {
        roomId = simpleRoomId, 
        walls = new List<WallSegment>(),
        floor = new FloorData { vertices = new List<Vector3>() },
        furniture = new List<FurnitureItem>(),
        timestamp = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
    };
    
    // Optional: Log it so you can see it in the console to type into the web app
    Debug.Log($"🏠 Generated Room ID: {currentRoom.roomId}");
}
    
    public void StartScanning()
    {
        isScanning = true;
        scanTimer = 0f;
        detectedPlanes.Clear();
        wallPoints.Clear();
        floorPoints.Clear();
        
        Debug.Log("Started room scanning...");
    }
    
    public void StopScanning()
    {
        isScanning = false;
        ProcessScannedData();
        Debug.Log("Stopped room scanning. Processing data...");
    }
    
    void Update()
    {
        if (isScanning)
        {
            scanTimer += Time.deltaTime;
            
            if (scanTimer >= scanDuration)
            {
                StopScanning();
            }
        }
    }
    
    void OnPlanesChanged(ARPlanesChangedEventArgs args)
    {
        if (!isScanning) return;
        
        foreach (ARPlane plane in args.added)
        {
            ProcessPlane(plane);
        }
        
        foreach (ARPlane plane in args.updated)
        {
            ProcessPlane(plane);
        }
    }
    
    void ProcessPlane(ARPlane plane)
    {
        if (!detectedPlanes.Contains(plane))
        {
            detectedPlanes.Add(plane);
        }
        
        // Classify plane type
        if (plane.alignment == PlaneAlignment.HorizontalUp)
        {
            // This is likely a floor
            ProcessFloorPlane(plane);
        }
        else if (plane.alignment == PlaneAlignment.Vertical)
        {
            // This is likely a wall
            ProcessWallPlane(plane);
        }
    }
    
    void ProcessFloorPlane(ARPlane plane)
    {
        Vector3[] boundary = new Vector3[plane.boundary.Length];
        for (int i = 0; i < plane.boundary.Length; i++)
        {
            Vector3 localPoint = new Vector3(plane.boundary[i].x, 0, plane.boundary[i].y);
            Vector3 worldPoint = plane.transform.TransformPoint(localPoint);
            boundary[i] = worldPoint;
            
            if (!floorPoints.Contains(worldPoint))
            {
                floorPoints.Add(worldPoint);
            }
        }
    }
    
    void ProcessWallPlane(ARPlane plane)
    {
        Vector3[] boundary = new Vector3[plane.boundary.Length];
        for (int i = 0; i < plane.boundary.Length; i++)
        {
            Vector3 localPoint = new Vector3(plane.boundary[i].x, plane.boundary[i].y, 0);
            Vector3 worldPoint = plane.transform.TransformPoint(localPoint);
            boundary[i] = worldPoint;
            
            if (!wallPoints.Contains(worldPoint))
            {
                wallPoints.Add(worldPoint);
            }
        }
    }
    
    void ProcessScannedData()
    {
        // Process floor data
        if (floorPoints.Count > 0)
        {
            currentRoom.floor.vertices = floorPoints;
            currentRoom.floor.center = CalculateCenter(floorPoints);
            currentRoom.floor.area = CalculateArea(floorPoints);
        }
        
        // Process wall segments
        currentRoom.walls = ExtractWallSegments(wallPoints);
        
        // Calculate room dimensions
        currentRoom.roomDimensions = CalculateRoomDimensions();
        
        // Generate 3D mesh
        if (meshGenerator != null)
        {
            meshGenerator.GenerateRoomMesh(currentRoom);
        }
        
        // Upload to Firebase
        if (firebaseManager != null)
        {
            firebaseManager.UploadRoomData(currentRoom);
        }
        
        Debug.Log($"Room processed: {currentRoom.walls.Count} walls, floor area: {currentRoom.floor.area}m²");
    }
    
    List<WallSegment> ExtractWallSegments(List<Vector3> points)
    {
        List<WallSegment> walls = new List<WallSegment>();
        
        if (points.Count < 2) return walls;
        
        // Group points by proximity and create wall segments
        List<Vector3> sortedPoints = points.OrderBy(p => p.x).ThenBy(p => p.z).ToList();
        
        for (int i = 0; i < sortedPoints.Count - 1; i++)
        {
            Vector3 start = sortedPoints[i];
            Vector3 end = sortedPoints[i + 1];
            
            float distance = Vector3.Distance(start, end);
            
            // Only create wall segments for points that are reasonably close
            if (distance < 5f && distance > 0.1f)
            {
                WallSegment wall = new WallSegment
                {
                    startPoint = start,
                    endPoint = end,
                    height = Mathf.Abs(end.y - start.y),
                    thickness = 0.1f
                };
                walls.Add(wall);
            }
        }
        
        return walls;
    }
    
    Vector3 CalculateCenter(List<Vector3> points)
    {
        if (points.Count == 0) return Vector3.zero;
        
        Vector3 sum = Vector3.zero;
        foreach (Vector3 point in points)
        {
            sum += point;
        }
        return sum / points.Count;
    }
    
    float CalculateArea(List<Vector3> points)
    {
        if (points.Count < 3) return 0f;
        
        float area = 0f;
        for (int i = 0; i < points.Count; i++)
        {
            Vector3 current = points[i];
            Vector3 next = points[(i + 1) % points.Count];
            area += current.x * next.z - next.x * current.z;
        }
        return Mathf.Abs(area) / 2f;
    }
    
    Vector3 CalculateRoomDimensions()
    {
        if (floorPoints.Count == 0) return Vector3.zero;
        
        float minX = float.MaxValue, maxX = float.MinValue;
        float minY = float.MaxValue, maxY = float.MinValue;
        float minZ = float.MaxValue, maxZ = float.MinValue;
        
        foreach (Vector3 point in floorPoints.Concat(wallPoints))
        {
            minX = Mathf.Min(minX, point.x);
            maxX = Mathf.Max(maxX, point.x);
            minY = Mathf.Min(minY, point.y);
            maxY = Mathf.Max(maxY, point.y);
            minZ = Mathf.Min(minZ, point.z);
            maxZ = Mathf.Max(maxZ, point.z);
        }
        
        return new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
    }
    
    public RoomData GetCurrentRoomData()
    {
        return currentRoom;
    }
    
    public void UpdateFurniture(List<FurnitureItem> furniture)
    {
        currentRoom.furniture = furniture;
        currentRoom.timestamp = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        
        if (meshGenerator != null)
        {
            meshGenerator.UpdateFurniture(furniture);
        }
    }
}
