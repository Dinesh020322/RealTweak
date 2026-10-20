using UnityEngine;
using Firebase;
using Firebase.Firestore;
using Firebase.Storage;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Text;

public class FirebaseManager : MonoBehaviour
{
    [Header("Firebase Settings")]
    public string roomsCollection = "rooms";
    public string targetRoomId = "1244";
    
    [Header("References")]
    public RoomScanner roomScanner;
    public RoomMeshGenerator meshGenerator;
    
    private FirebaseFirestore db;
    private FirebaseStorage storage;
    private bool firebaseInitialized = false;
    private ListenerRegistration roomListener;
    private long lastUpdateTimestamp = 0;
    
    async void Start()
    {
        await InitializeFirebase();
    }
    
    async Task InitializeFirebase()
    {
        try
        {
            Debug.Log("🔥 Initializing Firebase...");
            
            var dependencyStatus = await FirebaseApp.CheckAndFixDependenciesAsync();
            
            if (dependencyStatus == DependencyStatus.Available)
            {
                FirebaseApp app = FirebaseApp.DefaultInstance;
                db = FirebaseFirestore.DefaultInstance;
                storage = FirebaseStorage.DefaultInstance;
                firebaseInitialized = true;
                
                Debug.Log("✅ Firebase initialized successfully!");
                
                // Automatically load and listen to the target room
                //await LoadRoomData(targetRoomId);
                //StartListeningForUpdates(targetRoomId);
            }
            else
            {
                Debug.LogError($"❌ Could not resolve Firebase dependencies: {dependencyStatus}");
            }
        }
        catch (Exception e)
        {
            Debug.LogError($"❌ Firebase initialization error: {e.Message}");
        }
    }
    
    public async Task LoadRoomData(string roomId)
    {
        if (!firebaseInitialized)
        {
            Debug.LogError("❌ Firebase not initialized");
            return;
        }
        
        try
        {
            Debug.Log($"📥 Loading room data for: {roomId}");
            
            DocumentSnapshot snapshot = await db.Collection(roomsCollection)
                .Document(roomId)
                .GetSnapshotAsync();
            
            if (snapshot.Exists)
            {
                Debug.Log("✅ Room data loaded from Firebase!");
                ProcessRoomSnapshot(snapshot);
            }
            else
            {
                Debug.LogWarning($"⚠️ Room {roomId} not found in Firebase");
            }
        }
        catch (Exception e)
        {
            Debug.LogError($"❌ Error loading room data: {e.Message}");
        }
    }
    
    void StartListeningForUpdates(string roomId)
    {
        if (!firebaseInitialized)
        {
            Debug.LogWarning("⚠️ Cannot start listener - Firebase not initialized");
            return;
        }
        
        Debug.Log($"👂 Listening for updates on room: {roomId}");
        
        roomListener = db.Collection(roomsCollection)
            .Document(roomId)
            .Listen(snapshot =>
            {
                if (snapshot.Exists)
                {
                    Debug.Log("🔄 Received update from Firebase!");
                    ProcessRoomSnapshot(snapshot);
                }
            });
    }
    
    void ProcessRoomSnapshot(DocumentSnapshot snapshot)
    {
        try
        {
            var data = snapshot.ToDictionary();
            
            long timestamp = data.ContainsKey("timestamp") 
                ? Convert.ToInt64(data["timestamp"]) 
                : 0;
            
            if (timestamp <= lastUpdateTimestamp && lastUpdateTimestamp != 0)
            {
                Debug.Log("ℹ️ Skipping duplicate update");
                return;
            }
            
            lastUpdateTimestamp = timestamp;
            
            RoomScanner.RoomData roomData = new RoomScanner.RoomData
            {
                roomId = data.ContainsKey("roomId") 
                    ? data["roomId"].ToString() 
                    : snapshot.Id,
                timestamp = timestamp,
                walls = new List<RoomScanner.WallSegment>(),
                furniture = new List<RoomScanner.FurnitureItem>()
            };
            
            if (data.ContainsKey("dimensions"))
            {
                roomData.roomDimensions = DeserializeVector3(data["dimensions"]);
                Debug.Log($"📐 Dimensions: {roomData.roomDimensions}");
            }
            
            if (data.ContainsKey("floor"))
            {
                roomData.floor = DeserializeFloorData(data["floor"]);
                Debug.Log($"🟫 Floor area: {roomData.floor.area} m²");
            }
            
            if (data.ContainsKey("walls"))
            {
                roomData.walls = DeserializeWalls(data["walls"]);
                Debug.Log($"🧱 Walls: {roomData.walls.Count}");
            }
            
            if (data.ContainsKey("furniture"))
            {
                roomData.furniture = DeserializeFurniture(data["furniture"]);
                Debug.Log($"🪑 Furniture items: {roomData.furniture.Count}");
                
                foreach (var item in roomData.furniture)
                {
                    Debug.Log($"   - {item.type} at Unity({item.position.x:F2}, {item.position.y:F2}, {item.position.z:F2})");
                }
            }
            
            if (meshGenerator != null)
            {
                Debug.Log("🎨 Updating room mesh with furniture...");
                meshGenerator.GenerateRoomMesh(roomData);
            }
            
            if (roomScanner != null)
            {
                roomScanner.UpdateFurniture(roomData.furniture);
            }
            
            Debug.Log("✅ Room update complete!");
        }
        catch (Exception e)
        {
            Debug.LogError($"❌ Error processing room update: {e.Message}\n{e.StackTrace}");
        }
    }
    
    public async void UploadRoomData(RoomScanner.RoomData roomData)
    {
        if (!firebaseInitialized) return;
        
        try
        {
            Debug.Log($"📤 Uploading room data: {roomData.roomId}");
            
            Dictionary<string, object> roomDict = new Dictionary<string, object>
            {
                { "roomId", roomData.roomId },
                { "timestamp", roomData.timestamp },
                { "dimensions", SerializeVector3(roomData.roomDimensions) },
                { "floor", SerializeFloorData(roomData.floor) },
                { "walls", SerializeWalls(roomData.walls) },
                { "furniture", SerializeFurniture(roomData.furniture) }
            };
            
            await db.Collection(roomsCollection)
                .Document(roomData.roomId)
                .SetAsync(roomDict);
            
            Debug.Log($"✅ Room data uploaded: {roomData.roomId}");
            await UploadMeshToStorage(roomData.roomId);
        }
        catch (Exception e)
        {
            Debug.LogError($"❌ Error uploading room data: {e.Message}");
        }
    }
    
    async Task UploadMeshToStorage(string roomId)
    {
        if (meshGenerator == null) return;
        try
        {
            Mesh mesh = meshGenerator.ExportRoomMesh();
            string objData = MeshToOBJ(mesh);
            byte[] objBytes = Encoding.UTF8.GetBytes(objData);
            StorageReference meshRef = storage.GetReference($"meshes/{roomId}.obj");
            await meshRef.PutBytesAsync(objBytes);
            Uri downloadUri = await meshRef.GetDownloadUrlAsync();
            
            // Store the mesh URL in Firestore
            await db.Collection(roomsCollection).Document(roomId).UpdateAsync("meshUrl", downloadUri.ToString());
            Debug.Log($"✅ Mesh uploaded: {downloadUri}");
        }
        catch (Exception e) 
        { 
            Debug.LogError($"❌ Error uploading mesh: {e.Message}"); 
        }
    }
    
    // ============ COORDINATE SYSTEM CONVERSION ============
    // Web (Three.js) uses RIGHT-HANDED: X=right, Y=up, Z=forward (toward camera)
    // Unity uses LEFT-HANDED: X=right, Y=up, Z=forward (away from camera)
    // Conversion: Negate Z for positions and adjust rotations
    
    Vector3 WebToUnityPosition(object data)
    {
        if (data is Dictionary<string, object> dict)
        {
            try
            {
                float x = dict.ContainsKey("x") ? Convert.ToSingle(dict["x"]) : 0f;
                float y = dict.ContainsKey("y") ? Convert.ToSingle(dict["y"]) : 0f;
                float z = dict.ContainsKey("z") ? Convert.ToSingle(dict["z"]) : 0f;
                
                // CRITICAL: Negate Z to convert from Web (right-handed) to Unity (left-handed)
                return new Vector3(x, y, -z);
            }
            catch (Exception e) 
            { 
                Debug.LogError($"Error converting position: {e.Message}"); 
            }
        }
        return Vector3.zero;
    }
    
    Vector3 UnityToWebPosition(Vector3 unityPos)
    {
        // Convert Unity position back to Web coordinates
        return new Vector3(unityPos.x, unityPos.y, -unityPos.z);
    }

    Vector3 DeserializeVector3(object data)
    {
        // For dimensions and scale - no coordinate conversion needed
        if (data is Dictionary<string, object> dict)
        {
            try
            {
                float x = dict.ContainsKey("x") ? Convert.ToSingle(dict["x"]) : 0f;
                float y = dict.ContainsKey("y") ? Convert.ToSingle(dict["y"]) : 0f;
                float z = dict.ContainsKey("z") ? Convert.ToSingle(dict["z"]) : 0f;
                return new Vector3(x, y, z);
            }
            catch (Exception e) 
            { 
                Debug.LogError($"Error deserializing Vector3: {e.Message}"); 
            }
        }
        return Vector3.zero;
    }
    
    Quaternion WebToUnityRotation(object data)
    {
        if (data is Dictionary<string, object> dict)
        {
            try
            {
                // Check if it's a Quaternion (from Unity) or Euler angles (from Web)
                if (dict.ContainsKey("w"))
                {
                    // Quaternion from Unity
                    float x = Convert.ToSingle(dict["x"]);
                    float y = Convert.ToSingle(dict["y"]);
                    float z = Convert.ToSingle(dict["z"]);
                    float w = Convert.ToSingle(dict["w"]);
                    return new Quaternion(x, y, z, w);
                }
                else
                {
                    // Euler angles from Web (in radians)
                    float x = dict.ContainsKey("x") ? Convert.ToSingle(dict["x"]) : 0f;
                    float y = dict.ContainsKey("y") ? Convert.ToSingle(dict["y"]) : 0f;
                    float z = dict.ContainsKey("z") ? Convert.ToSingle(dict["z"]) : 0f;

                    // Convert radians to degrees
                    float xDeg = x * Mathf.Rad2Deg;
                    float yDeg = y * Mathf.Rad2Deg;
                    float zDeg = z * Mathf.Rad2Deg;

                    // For right-to-left handed conversion: negate Y rotation
                    Quaternion rotation = Quaternion.Euler(xDeg, -yDeg, zDeg);
                    
                    Debug.Log($"Web Euler (deg): ({xDeg:F1}, {yDeg:F1}, {zDeg:F1}) → Unity: ({rotation.eulerAngles.x:F1}, {rotation.eulerAngles.y:F1}, {rotation.eulerAngles.z:F1})");
                    
                    return rotation;
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"Error converting rotation: {e.Message}");
            }
        }
        return Quaternion.identity;
    }

    RoomScanner.FloorData DeserializeFloorData(object data)
    {
        RoomScanner.FloorData floor = new RoomScanner.FloorData
        {
            vertices = new List<Vector3>()
        };
        
        if (data is Dictionary<string, object> dict)
        {
            if (dict.ContainsKey("vertices") && dict["vertices"] is List<object> verticesList)
            {
                foreach (var vertex in verticesList)
                {
                    floor.vertices.Add(WebToUnityPosition(vertex));
                }
            }
            
            if (dict.ContainsKey("center"))
            {
                floor.center = WebToUnityPosition(dict["center"]);
            }
            
            if (dict.ContainsKey("area"))
            {
                floor.area = Convert.ToSingle(dict["area"]);
            }
        }
        
        return floor;
    }
    
    List<RoomScanner.WallSegment> DeserializeWalls(object data)
    {
        List<RoomScanner.WallSegment> walls = new List<RoomScanner.WallSegment>();
        
        if (data is List<object> wallsList)
        {
            foreach (var wallObj in wallsList)
            {
                if (wallObj is Dictionary<string, object> wallDict)
                {
                    RoomScanner.WallSegment wall = new RoomScanner.WallSegment
                    {
                        startPoint = wallDict.ContainsKey("startPoint") 
                            ? WebToUnityPosition(wallDict["startPoint"])
                            : Vector3.zero,
                        endPoint = wallDict.ContainsKey("endPoint") 
                            ? WebToUnityPosition(wallDict["endPoint"])
                            : Vector3.zero,
                        height = wallDict.ContainsKey("height") 
                            ? Convert.ToSingle(wallDict["height"]) 
                            : 2.5f,
                        thickness = wallDict.ContainsKey("thickness") 
                            ? Convert.ToSingle(wallDict["thickness"]) 
                            : 0.1f
                    };
                    walls.Add(wall);
                }
            }
        }
        
        return walls;
    }
    
    List<RoomScanner.FurnitureItem> DeserializeFurniture(object data)
    {
        List<RoomScanner.FurnitureItem> furniture = new List<RoomScanner.FurnitureItem>();
        
        if (data is List<object> furnitureList)
        {
            Debug.Log($"🔍 Parsing {furnitureList.Count} furniture items from Web");
            
            foreach (var itemObj in furnitureList)
            {
                if (itemObj is Dictionary<string, object> itemDict)
                {
                    try
                    {
                        Vector3 webPos = WebToUnityPosition(itemDict["position"]);
                        Quaternion webRot = WebToUnityRotation(itemDict["rotation"]);
                        
                        RoomScanner.FurnitureItem item = new RoomScanner.FurnitureItem
                        {
                            id = itemDict.ContainsKey("id") 
                                ? itemDict["id"].ToString() 
                                : Guid.NewGuid().ToString(),
                            type = itemDict.ContainsKey("type") 
                                ? itemDict["type"].ToString() 
                                : "chair",
                            position = webPos,
                            rotation = webRot,
                            scale = itemDict.ContainsKey("scale") 
                                ? DeserializeVector3(itemDict["scale"]) 
                                : Vector3.one,
                            timestamp = itemDict.ContainsKey("timestamp") 
                                ? Convert.ToInt64(itemDict["timestamp"]) 
                                : 0
                        };
                        
                        furniture.Add(item);
                        Debug.Log($"✅ {item.type} → Unity pos({webPos.x:F2}, {webPos.y:F2}, {webPos.z:F2})");
                    }
                    catch (Exception e)
                    {
                        Debug.LogError($"❌ Error parsing furniture: {e.Message}");
                    }
                }
            }
        }
        
        return furniture;
    }
    
    // ============ SERIALIZATION (Unity → Web) ============
    
    Dictionary<string, object> SerializeVector3(Vector3 v)
    {
        return new Dictionary<string, object>
        {
            { "x", v.x },
            { "y", v.y },
            { "z", v.z }
        };
    }
    
    Dictionary<string, object> SerializePosition(Vector3 unityPos)
    {
        Vector3 webPos = UnityToWebPosition(unityPos);
        return new Dictionary<string, object>
        {
            { "x", webPos.x },
            { "y", webPos.y },
            { "z", webPos.z }
        };
    }
    
    Dictionary<string, object> SerializeFloorData(RoomScanner.FloorData floor)
    {
        List<Dictionary<string, object>> vertices = new List<Dictionary<string, object>>();
        foreach (Vector3 v in floor.vertices)
        {
            vertices.Add(SerializePosition(v));
        }
        
        return new Dictionary<string, object>
        {
            { "vertices", vertices },
            { "center", SerializePosition(floor.center) },
            { "area", floor.area }
        };
    }
    
    List<Dictionary<string, object>> SerializeWalls(List<RoomScanner.WallSegment> walls)
    {
        List<Dictionary<string, object>> wallsList = new List<Dictionary<string, object>>();
        
        foreach (var wall in walls)
        {
            wallsList.Add(new Dictionary<string, object>
            {
                { "startPoint", SerializePosition(wall.startPoint) },
                { "endPoint", SerializePosition(wall.endPoint) },
                { "height", wall.height },
                { "thickness", wall.thickness }
            });
        }
        
        return wallsList;
    }
    
    List<Dictionary<string, object>> SerializeFurniture(List<RoomScanner.FurnitureItem> furniture)
    {
        List<Dictionary<string, object>> furnitureList = new List<Dictionary<string, object>>();
        
        foreach (var item in furniture)
        {
            furnitureList.Add(new Dictionary<string, object>
            {
                { "id", item.id },
                { "type", item.type },
                { "position", SerializePosition(item.position) },
                { "rotation", new Dictionary<string, object>
                    {
                        { "x", item.rotation.x },
                        { "y", item.rotation.y },
                        { "z", item.rotation.z },
                        { "w", item.rotation.w }
                    }
                },
                { "scale", SerializeVector3(item.scale) },
                { "timestamp", item.timestamp }
            });
        }
        
        return furnitureList;
    }
    
    string MeshToOBJ(Mesh mesh)
    {
        StringBuilder sb = new StringBuilder();
        
        sb.Append("# Room Mesh Export from Unity\n");
        sb.Append($"# Generated: {DateTime.Now}\n");
        sb.Append($"# Vertices: {mesh.vertices.Length}\n");
        sb.Append($"# Triangles: {mesh.triangles.Length / 3}\n\n");
        
        // Export vertices (convert to Web coordinates)
        foreach (Vector3 v in mesh.vertices)
        {
            Vector3 webV = UnityToWebPosition(v);
            sb.AppendFormat("v {0} {1} {2}\n", webV.x, webV.y, webV.z);
        }
        
        sb.Append("\n");
        
        // Export UVs
        if (mesh.uv != null && mesh.uv.Length > 0)
        {
            foreach (Vector2 uv in mesh.uv)
            {
                sb.AppendFormat("vt {0} {1}\n", uv.x, uv.y);
            }
            sb.Append("\n");
        }
        
        // Export normals (convert to Web coordinates)
        if (mesh.normals != null && mesh.normals.Length > 0)
        {
            foreach (Vector3 n in mesh.normals)
            {
                Vector3 webN = UnityToWebPosition(n).normalized;
                sb.AppendFormat("vn {0} {1} {2}\n", webN.x, webN.y, webN.z);
            }
            sb.Append("\n");
        }
        
        // Export faces (reverse winding order for coordinate system conversion)
        bool hasUVs = mesh.uv != null && mesh.uv.Length > 0;
        bool hasNormals = mesh.normals != null && mesh.normals.Length > 0;
        
        for (int i = 0; i < mesh.triangles.Length; i += 3)
        {
            int i1 = mesh.triangles[i] + 1;
            int i2 = mesh.triangles[i + 1] + 1;
            int i3 = mesh.triangles[i + 2] + 1;
            
            // Reverse winding order for right-handed system
            if (hasUVs && hasNormals)
            {
                sb.AppendFormat("f {0}/{0}/{0} {2}/{2}/{2} {1}/{1}/{1}\n", i1, i2, i3);
            }
            else if (hasUVs)
            {
                sb.AppendFormat("f {0}/{0} {2}/{2} {1}/{1}\n", i1, i2, i3);
            }
            else if (hasNormals)
            {
                sb.AppendFormat("f {0}//{0} {2}//{2} {1}//{1}\n", i1, i2, i3);
            }
            else
            {
                sb.AppendFormat("f {0} {2} {1}\n", i1, i2, i3);
            }
        }
        
        return sb.ToString();
    }
    
    void OnDestroy()
    {
        roomListener?.Stop();
        Debug.Log("👋 Firebase listener stopped");
    }
}