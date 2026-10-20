# RoomPlan Unity Kit - Project Structure

## 📁 Complete File Structure

```
RoomPlanUnity/
│
├── README.md                          # Complete documentation
├── QUICK_START.md                     # Quick setup guide
│
├── Scripts/                           # Unity C# Scripts
│   ├── RoomScanner.cs                # Main AR scanning logic
│   ├── RoomMeshGenerator.cs          # 3D mesh generation
│   ├── FirebaseManager.cs            # Firebase integration
│   ├── RoomScanUIController.cs       # UI management
│   └── Editor/
│       └── FurniturePrefabCreator.cs # Editor tool for prefab creation
│
├── WebGL/                             # WebGL Editor
│   ├── index.html                    # Main HTML interface
│   └── roomEditor.js                 # Three.js + Firebase logic
│
├── Firebase/                          # Firebase Configuration
│   ├── firestore.rules               # Firestore security rules
│   └── storage.rules                 # Storage security rules
│
└── Unity/                             # Unity Project Files
    └── Packages/
        └── manifest.json              # Package dependencies
```

## 📄 File Descriptions

### Core Unity Scripts

#### RoomScanner.cs
**Purpose**: Main room scanning controller
**Key Features**:
- AR plane detection and tracking
- Wall and floor identification
- Room dimension calculation
- Data structure management

**Dependencies**:
- ARFoundation (AR Plane Manager, AR Raycast Manager)
- RoomMeshGenerator
- FirebaseManager

**Key Classes**:
- `RoomData`: Complete room data structure
- `WallSegment`: Wall definition with dimensions
- `FloorData`: Floor geometry and area
- `FurnitureItem`: Furniture placement data

---

#### RoomMeshGenerator.cs
**Purpose**: Convert scanned data to 3D meshes
**Key Features**:
- Floor mesh generation
- Wall mesh creation
- Ceiling generation
- Furniture instantiation
- Mesh export to OBJ format

**Dependencies**:
- Unity Mesh API
- Furniture prefabs

**Key Methods**:
- `GenerateRoomMesh()`: Creates complete room
- `CreatePolygonMesh()`: Triangulates floor/ceiling
- `CreateWallMesh()`: Generates wall geometry
- `UpdateFurniture()`: Manages furniture objects

---

#### FirebaseManager.cs
**Purpose**: Firebase integration and sync
**Key Features**:
- Firestore document management
- Storage file uploads
- Real-time listeners
- Data serialization/deserialization
- OBJ mesh export

**Dependencies**:
- Firebase SDK (Firestore, Storage)
- RoomScanner
- RoomMeshGenerator

**Key Methods**:
- `UploadRoomData()`: Uploads room to Firestore
- `UploadMeshToStorage()`: Saves mesh to Storage
- `StartListeningForUpdates()`: Real-time sync
- `ProcessRoomUpdate()`: Handles incoming updates

---

#### RoomScanUIController.cs
**Purpose**: UI management and user interaction
**Key Features**:
- Scan control (start/stop)
- Progress tracking
- Results display
- Upload management

**Dependencies**:
- TextMeshPro
- Unity UI
- RoomScanner
- FirebaseManager

**Key Methods**:
- `OnStartScanClicked()`: Initiates scanning
- `OnStopScanClicked()`: Completes scan
- `DisplayScanResults()`: Shows results
- `OnUploadClicked()`: Uploads to Firebase

---

#### FurniturePrefabCreator.cs (Editor)
**Purpose**: Automated prefab creation tool
**Key Features**:
- One-click prefab generation
- Default furniture models
- Material assignment
- Scene cleanup

**Usage**: Tools > RoomPlan > Create Furniture Prefabs

---

### WebGL Files

#### index.html
**Purpose**: WebGL editor interface
**Key Features**:
- Modern responsive UI
- Three.js canvas integration
- Firebase SDK loading
- Control panel
- Furniture selection grid

**Libraries**:
- Three.js r128
- OrbitControls
- OBJLoader
- Firebase 9.22.0

---

#### roomEditor.js
**Purpose**: WebGL application logic
**Key Features**:
- Three.js scene management
- Firebase real-time sync
- Furniture placement/editing
- Room visualization
- User interactions

**Key Functions**:
- `init()`: Scene setup
- `loadRoom()`: Fetch room from Firebase
- `createFurniture()`: Generate furniture objects
- `saveChanges()`: Sync to Firebase
- `listenForUpdates()`: Real-time updates

---

### Firebase Configuration

#### firestore.rules
**Purpose**: Firestore security rules
**Features**:
- Public read access (for demo)
- Authenticated write access
- Data validation
- Collection-level rules

**Collections**:
- `rooms`: Room data and metadata
- `furniture`: Furniture items (optional)
- `users`: User profiles (optional)

---

#### storage.rules
**Purpose**: Storage security rules
**Features**:
- Public read for meshes
- Authenticated write
- File size validation (50MB limit)
- Path-based security

**Buckets**:
- `meshes/`: 3D mesh files (.obj)
- `furniture/`: Furniture models
- `textures/`: Material textures
- `users/`: User-uploaded files

---

## 🔄 Data Flow

### Scanning Flow (Unity → Firebase)
```
1. User starts scan in Unity app
2. ARFoundation detects planes
3. RoomScanner processes plane data
4. RoomMeshGenerator creates 3D mesh
5. FirebaseManager uploads to Firestore + Storage
6. Room ID generated and displayed
```

### Editing Flow (WebGL → Firebase → Unity)
```
1. User enters Room ID in WebGL
2. roomEditor.js fetches from Firebase
3. Three.js renders room + furniture
4. User adds/edits furniture
5. Changes saved to Firestore
6. Unity app receives real-time update
7. RoomMeshGenerator updates scene
```

### Sync Flow (Bidirectional)
```
Unity App ←→ Firebase (Firestore + Storage) ←→ WebGL Editor
     ↓                      ↓                        ↓
Real-time           Document listeners         Real-time
updates             + Storage refs              updates
```

## 🎯 Key Components Interaction

```
┌─────────────────────────────────────────────────────────┐
│                    Unity Application                    │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                 │
│  │ ARFoundation │───→│ RoomScanner  │                 │
│  │   (Input)    │    │   (Logic)    │                 │
│  └──────────────┘    └───────┬──────┘                 │
│                              │                          │
│                              ↓                          │
│                     ┌────────────────┐                 │
│                     │ MeshGenerator  │                 │
│                     │  (Rendering)   │                 │
│                     └────────┬───────┘                 │
│                              │                          │
│                              ↓                          │
│                     ┌────────────────┐                 │
│                     │FirebaseManager │                 │
│                     │     (Sync)     │                 │
│                     └────────┬───────┘                 │
│                              │                          │
│  ┌──────────────────────────┼─────────────────┐       │
│  │   RoomScanUIController   │                 │       │
│  │     (User Interface)     │                 │       │
│  └──────────────────────────┴─────────────────┘       │
└─────────────────────────────────────────────────────────┘
                              ↕
                    ┌─────────────────┐
                    │    Firebase     │
                    │ (Cloud Backend) │
                    └────────┬────────┘
                             ↕
┌─────────────────────────────────────────────────────────┐
│                    WebGL Application                    │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                 │
│  │   Three.js   │───→│ Scene Manager│                 │
│  │  (Renderer)  │    │   (Logic)    │                 │
│  └──────────────┘    └───────┬──────┘                 │
│                              │                          │
│                              ↓                          │
│                     ┌────────────────┐                 │
│                     │Furniture Editor│                 │
│                     │  (Interaction) │                 │
│                     └────────┬───────┘                 │
│                              │                          │
│                              ↓                          │
│                     ┌────────────────┐                 │
│                     │Firebase Client │                 │
│                     │     (Sync)     │                 │
│                     └────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

## 📦 Required Unity Packages

```json
{
  "com.unity.xr.arfoundation": "5.1.0",      // Core AR functionality
  "com.unity.xr.arcore": "5.1.0",            // Android AR support
  "com.unity.xr.arkit": "5.1.0",             // iOS AR support
  "com.unity.textmeshpro": "3.0.6",          // UI text rendering
  "com.unity.ugui": "1.0.0"                  // UI system
}
```

## 📚 External Dependencies

### Unity
- Firebase Unity SDK 11.0.0+
  - FirebaseAuth.unitypackage
  - FirebaseFirestore.unitypackage
  - FirebaseStorage.unitypackage

### WebGL
- Three.js r128 (via CDN)
- Firebase Web SDK 9.22.0 (via CDN)

## 🎨 Asset Requirements

### Materials (Create in Unity)
- Floor Material (Brown/Wood)
- Wall Material (Light Gray)
- Ceiling Material (White)

### Prefabs
- Chair (0.5m cube-based)
- Table (2m x 1m)
- Sofa (2m x 0.8m)
- Bed (2m x 1.5m)

*Note: Use FurniturePrefabCreator.cs to auto-generate*

## 🔧 Configuration Files

### Unity Configuration
- `google-services.json` (Android)
- `GoogleService-Info.plist` (iOS)
- Place in Assets/ folder

### WebGL Configuration
- Firebase config in `roomEditor.js`
- Update with your Firebase credentials

### Firebase Configuration
- Deploy `firestore.rules` to Firestore
- Deploy `storage.rules` to Storage

## 📱 Platform-Specific Files

### iOS
- ARKit framework
- Camera usage description in Info.plist
- Location usage (optional)

### Android
- ARCore SDK
- Camera permission in AndroidManifest.xml
- Internet permission

## 🚀 Build Outputs

### Unity App
- iOS: .ipa file
- Android: .apk or .aab file

### WebGL Editor
- Static HTML/JS files
- Deploy to Firebase Hosting or any web server

## 📊 Data Storage

### Firestore Collections
```
rooms/
  {roomId}/
    - roomId: string
    - timestamp: number
    - dimensions: object
    - floor: object
    - walls: array
    - furniture: array
    - meshUrl: string
```

### Storage Structure
```
meshes/
  {roomId}.obj
furniture/
  {furnitureId}/
    model.obj
    texture.png
```

## 🔐 Security Notes

### Development Mode
- Public read/write access
- No authentication required
- For testing only

### Production Mode
- Require authentication
- Implement user ownership
- Rate limiting
- Data validation

---

**Project Version**: 1.0
**Unity Version**: 6.0+
**Last Updated**: 2024
