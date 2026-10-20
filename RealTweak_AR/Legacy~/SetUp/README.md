# RoomPlan for Unity Kit - Complete Implementation

A complete Unity + WebGL room scanning and editing system with Firebase synchronization, inspired by Apple's RoomPlan.

## 🌟 Features

- **AR Room Scanning**: Scan real rooms using ARFoundation (iOS/Android)
- **3D Mesh Generation**: Automatic conversion of scanned data to 3D meshes with dimensions
- **Firebase Sync**: Real-time synchronization between Unity app and WebGL editor
- **WebGL Editor**: Browser-based 3D editor for adding and arranging furniture
- **Bidirectional Updates**: Changes in WebGL reflect in Unity app and vice versa
- **Room Dimensions**: Automatic calculation of room measurements

## 📋 Prerequisites

### Unity Project
- Unity 6.0 or later
- ARFoundation package
- AR Core XR Plugin (Android)
- AR Kit XR Plugin (iOS)
- Firebase SDK for Unity
- TextMeshPro

### Firebase Project
- Firebase project with Firestore and Storage enabled
- Firebase configuration files

### WebGL Editor
- Modern web browser with WebGL support
- Firebase Web SDK

## 🚀 Setup Instructions

### Part 1: Firebase Setup

1. **Create Firebase Project**
   ```
   - Go to https://console.firebase.google.com/
   - Click "Add Project"
   - Follow the setup wizard
   ```

2. **Enable Firestore**
   ```
   - Go to Firestore Database
   - Click "Create Database"
   - Start in test mode (or production mode with rules)
   ```

3. **Enable Firebase Storage**
   ```
   - Go to Storage
   - Click "Get Started"
   - Start in test mode
   ```

4. **Get Firebase Configuration**
   - For Unity: Download `google-services.json` (Android) or `GoogleService-Info.plist` (iOS)
   - For Web: Copy web app configuration from Project Settings

5. **Deploy Security Rules**
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only storage:rules
   ```

### Part 2: Unity Setup

1. **Create New Unity Project**
   ```
   - Unity 6.0 or later
   - 3D template
   - Enable AR support in Project Settings
   ```

2. **Install Required Packages**
   ```
   Window > Package Manager:
   - AR Foundation
   - ARCore XR Plugin (for Android)
   - ARKit XR Plugin (for iOS)
   - TextMeshPro
   ```

3. **Import Firebase SDK**
   ```
   - Download Firebase Unity SDK
   - Import Firebase Auth, Firestore, and Storage packages
   - Add google-services.json to Assets/
   ```

4. **Copy Scripts**
   ```
   Copy all scripts to your Unity project:
   - RoomScanner.cs
   - RoomMeshGenerator.cs
   - FirebaseManager.cs
   - RoomScanUIController.cs
   ```

5. **Setup Scene**
   ```
   a. Create AR Session Origin:
      - GameObject > XR > AR Session Origin
      - GameObject > XR > AR Session
   
   b. Add Components:
      - Add AR Plane Manager to AR Session Origin
      - Add AR Raycast Manager to AR Session Origin
      - Add AR Mesh Manager (optional)
   
   c. Create Manager Objects:
      - Create empty GameObject "RoomScanner"
      - Attach RoomScanner.cs script
      - Create empty GameObject "MeshGenerator"
      - Attach RoomMeshGenerator.cs script
      - Create empty GameObject "FirebaseManager"
      - Attach FirebaseManager.cs script
   
   d. Link References:
      - Connect components in Inspector
      - Add materials for floor, walls, ceiling
      - Add furniture prefabs
   ```

6. **Setup UI**
   ```
   a. Create Canvas:
      - GameObject > UI > Canvas
      - Set to Screen Space - Overlay
   
   b. Add UI Elements:
      - Start Scan Button
      - Stop Scan Button
      - Upload Button
      - Status Text (TextMeshPro)
      - Timer Text
      - Progress Slider
      - Results Panel
   
   c. Connect to UIController:
      - Attach RoomScanUIController.cs to Canvas
      - Link all UI elements in Inspector
   ```

7. **Configure Build Settings**
   ```
   For iOS:
   - Switch platform to iOS
   - Set minimum iOS version to 13.0+
   - Enable ARKit in Player Settings
   - Add camera usage description
   
   For Android:
   - Switch platform to Android
   - Set minimum API level to 24
   - Enable ARCore in XR Plug-in Management
   - Add camera permission in manifest
   ```

### Part 3: WebGL Editor Setup

1. **Setup Web Server**
   ```bash
   # Use any web server, for example:
   cd WebGL/
   python -m http.server 8000
   # Or use VS Code Live Server extension
   ```

2. **Configure Firebase**
   ```javascript
   Edit roomEditor.js:
   
   const firebaseConfig = {
       apiKey: "YOUR_API_KEY",
       authDomain: "YOUR_PROJECT.firebaseapp.com",
       projectId: "YOUR_PROJECT_ID",
       storageBucket: "YOUR_PROJECT.appspot.com",
       messagingSenderId: "YOUR_SENDER_ID",
       appId: "YOUR_APP_ID"
   };
   ```

3. **Test WebGL Editor**
   ```
   - Open index.html in browser
   - Enter a test Room ID
   - Verify connection to Firebase
   ```

## 📱 Usage

### Scanning a Room (Unity App)

1. **Start the App**
   - Launch the app on your device
   - Point camera at floor and walls
   - Wait for AR planes to be detected

2. **Begin Scanning**
   - Tap "Start Scan" button
   - Move device slowly around the room
   - Scan all walls and floor surfaces
   - Default scan duration: 30 seconds

3. **Complete Scan**
   - Tap "Stop Scan" or wait for timer
   - Review detected walls and floor
   - Check room dimensions

4. **Upload to Firebase**
   - Tap "Upload" button
   - Note the Room ID displayed
   - Share Room ID for WebGL editing

### Editing in WebGL

1. **Load Room**
   - Open WebGL editor in browser
   - Enter Room ID from Unity app
   - Click "Load Room"
   - Wait for 3D model to load

2. **Add Furniture**
   - Select furniture type (chair, table, sofa, bed)
   - Click on floor to place
   - Furniture appears at clicked position

3. **Edit Furniture**
   - Click furniture to select (green highlight)
   - Use keyboard controls:
     - Arrow keys: Move furniture
     - R: Rotate 45 degrees
     - Delete/Backspace: Remove furniture

4. **Save Changes**
   - Click "Save Changes" button
   - Changes sync to Firebase
   - Unity app receives updates automatically

### Viewing Updates (Unity App)

1. **Real-time Sync**
   - Keep Unity app open
   - Changes from WebGL appear automatically
   - Furniture positions update in AR view

2. **Visualize Room**
   - View complete room with furniture
   - Walk around in AR
   - Check furniture placement

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Firebase Cloud                        │
│  ┌──────────────┐              ┌────────────────────┐       │
│  │  Firestore   │◄────────────►│  Storage (Meshes)  │       │
│  │   Database   │              │    (.obj files)    │       │
│  └──────────────┘              └────────────────────┘       │
│         ▲ ▼                              ▲ ▼                 │
└─────────┼─┼──────────────────────────────┼─┼─────────────────┘
          │ │                              │ │
          │ │                              │ │
    ┌─────┘ └─────┐                  ┌─────┘ └─────┐
    │             │                  │             │
    ▼             ▼                  ▼             ▼
┌────────────────────┐          ┌────────────────────┐
│   Unity App (AR)   │          │  WebGL Editor      │
│  ┌──────────────┐  │          │  ┌──────────────┐  │
│  │ RoomScanner  │  │          │  │   Three.js   │  │
│  │              │  │          │  │   Viewer     │  │
│  │ ARFoundation │  │          │  │              │  │
│  └──────────────┘  │          │  └──────────────┘  │
│  ┌──────────────┐  │          │  ┌──────────────┐  │
│  │ MeshGenerator│  │          │  │   Furniture  │  │
│  └──────────────┘  │          │  │    Editor    │  │
│  ┌──────────────┐  │          │  └──────────────┘  │
│  │  Firebase    │  │          │  ┌──────────────┐  │
│  │   Manager    │  │          │  │   Firebase   │  │
│  └──────────────┘  │          │  │    Client    │  │
└────────────────────┘          │  └──────────────┘  │
                                └────────────────────┘
```

## 📊 Data Structure

### Firestore Room Document
```javascript
{
  roomId: "unique-room-id",
  timestamp: 1234567890,
  dimensions: {
    x: 5.5,  // width in meters
    y: 2.8,  // height in meters
    z: 4.2   // depth in meters
  },
  floor: {
    vertices: [
      { x: 0, y: 0, z: 0 },
      // ... more vertices
    ],
    center: { x: 2.75, y: 0, z: 2.1 },
    area: 23.1
  },
  walls: [
    {
      startPoint: { x: 0, y: 0, z: 0 },
      endPoint: { x: 5.5, y: 0, z: 0 },
      height: 2.8,
      thickness: 0.1
    },
    // ... more walls
  ],
  furniture: [
    {
      id: "furniture_123",
      type: "chair",
      position: { x: 1.5, y: 0, z: 2.0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      timestamp: 1234567890
    },
    // ... more furniture
  ],
  meshUrl: "https://storage.googleapis.com/..."
}
```

## 🎨 Customization

### Adding New Furniture Types

**Unity Side (RoomMeshGenerator.cs):**
```csharp
// Add new prefab reference
public GameObject lampPrefab;

// Update GetFurniturePrefab method
GameObject GetFurniturePrefab(string type)
{
    switch (type.ToLower())
    {
        case "lamp":
            return lampPrefab;
        // ... existing cases
    }
}
```

**WebGL Side (roomEditor.js):**
```javascript
// Add button in HTML
<button class="furniture-btn" onclick="selectFurniture('lamp')">💡</button>

// Add geometry creator
function createLampGeometry() {
    const group = new THREE.Group();
    // Add lamp geometry
    return group;
}

// Update createFurniture switch
case 'lamp':
    geometry = createLampGeometry();
    material = new THREE.MeshPhongMaterial({ color: 0xFFD700 });
    break;
```

### Customizing Materials

```csharp
// In Unity Inspector
[Header("Materials")]
public Material floorMaterial;
public Material wallMaterial;
public Material ceilingMaterial;

// Assign your custom materials
```

### Adjusting Scan Settings

```csharp
// In RoomScanner.cs
[Header("Scanning Settings")]
public float scanDuration = 30f;  // Change scan time
public float minWallDistance = 0.1f;  // Minimum wall segment length
public float maxWallDistance = 5f;  // Maximum wall segment length
```

## 🐛 Troubleshooting

### Unity Issues

**AR planes not detected:**
- Ensure good lighting
- Move device slowly
- Scan textured surfaces
- Check ARFoundation permissions

**Firebase not connecting:**
- Verify google-services.json is in Assets/
- Check Firebase SDK version compatibility
- Enable internet permissions in manifest

**Mesh not generating:**
- Check console for errors
- Verify MeshGenerator is linked
- Ensure materials are assigned

### WebGL Issues

**Room not loading:**
- Check Firebase configuration
- Verify Room ID is correct
- Check browser console for errors
- Ensure CORS is properly configured

**Furniture not appearing:**
- Check Three.js library loaded
- Verify furniture geometry functions
- Check Z-fighting with floor

**Changes not saving:**
- Verify Firebase rules allow writes
- Check network connection
- Monitor Firebase console for errors

## 📈 Performance Optimization

### Unity App
- Use object pooling for furniture
- Optimize mesh complexity
- Reduce texture sizes
- Batch mesh rendering

### WebGL Editor
- Use instanced rendering for furniture
- Implement Level of Detail (LOD)
- Optimize geometry complexity
- Use texture atlases

## 🔒 Security Considerations

### Production Deployment

1. **Enable Authentication**
```javascript
// Require auth for all writes
allow write: if request.auth != null;
```

2. **Validate Data Structure**
```javascript
// Add comprehensive validation rules
allow create: if validateRoomData(request.resource.data);
```

3. **Rate Limiting**
```javascript
// Implement rate limiting for uploads
// Use Cloud Functions for additional checks
```

4. **HTTPS Only**
- Serve WebGL over HTTPS
- Use Firebase Hosting

## 📝 License

This is a sample implementation for educational purposes. Adjust for your specific use case and requirements.

## 🤝 Contributing

Feel free to extend this implementation with:
- More furniture types
- Advanced mesh editing
- Material customization
- Multi-room support
- Export to other formats (FBX, GLTF)
- Texture mapping
- Lighting controls

## 📧 Support

For issues and questions:
- Check the troubleshooting section
- Review Unity console logs
- Check browser developer console
- Verify Firebase console for errors

## 🎯 Next Steps

1. Test complete workflow on device
2. Add custom furniture models
3. Implement user authentication
4. Add room templates
5. Enable collaborative editing
6. Add export functionality
7. Implement undo/redo
8. Add measurement tools

---

**Happy Room Scanning! 🏡**
