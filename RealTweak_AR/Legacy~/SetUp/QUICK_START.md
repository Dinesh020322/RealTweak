# Quick Start Guide - RoomPlan Unity Kit

## ⚡ Fast Setup (30 minutes)

### Step 1: Firebase Setup (10 min)

1. Create Firebase project: https://console.firebase.google.com/
2. Enable Firestore Database
3. Enable Storage
4. Get configuration:
   - Unity: Download `google-services.json`
   - Web: Copy web config from Project Settings > General

### Step 2: Unity Project Setup (15 min)

```bash
# 1. Create new Unity 6 project (3D template)

# 2. Install packages via Package Manager:
Window > Package Manager > Unity Registry:
- AR Foundation (5.1.0+)
- ARCore XR Plugin (5.1.0+)  # For Android
- ARKit XR Plugin (5.1.0+)   # For iOS
- TextMeshPro

# 3. Import Firebase Unity SDK
Download from: https://firebase.google.com/download/unity
Import packages:
- FirebaseAuth.unitypackage
- FirebaseFirestore.unitypackage
- FirebaseStorage.unitypackage

# 4. Add google-services.json to Assets/ folder
```

**Scene Setup:**
```
1. Create empty scene "RoomScanScene"

2. Add AR Components:
   - GameObject > XR > AR Session
   - GameObject > XR > AR Session Origin
   
3. Configure AR Session Origin:
   - Add AR Plane Manager component
   - Add AR Raycast Manager component
   - Set plane detection mode to "Everything"

4. Create Manager GameObjects:
   GameObject > Create Empty > Name: "RoomScanner"
   - Add RoomScanner.cs script
   - Set scan duration: 30
   
   GameObject > Create Empty > Name: "MeshGenerator"  
   - Add RoomMeshGenerator.cs script
   - Assign materials (create basic materials if needed)
   
   GameObject > Create Empty > Name: "FirebaseManager"
   - Add FirebaseManager.cs script
   - Set collections: rooms="rooms", furniture="furniture"

5. Create UI:
   GameObject > UI > Canvas
   - Add RoomScanUIController.cs to Canvas
   - Create buttons and text elements (see UI setup below)

6. Link everything:
   - RoomScanner: Link AR managers, mesh generator, firebase manager
   - MeshGenerator: Link materials, furniture prefabs
   - FirebaseManager: Link room scanner, mesh generator
   - UIController: Link all UI elements and managers
```

### Step 3: WebGL Editor Setup (5 min)

```bash
# 1. Copy WebGL folder to web server

# 2. Edit roomEditor.js - Update Firebase config:
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "your-app.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-app.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};

# 3. Deploy Firebase rules:
firebase deploy --only firestore:rules
firebase deploy --only storage:rules

# 4. Test:
python -m http.server 8000
# Open http://localhost:8000
```

## 📋 Setup Checklist

### Unity Setup
- [ ] Unity 6.0+ installed
- [ ] New 3D project created
- [ ] AR Foundation package installed
- [ ] ARCore/ARKit plugin installed
- [ ] TextMeshPro imported
- [ ] Firebase SDK imported
- [ ] google-services.json in Assets/
- [ ] All scripts added to project
- [ ] AR Session + AR Session Origin in scene
- [ ] Manager GameObjects created
- [ ] All components linked in Inspector
- [ ] UI Canvas with buttons created
- [ ] Materials created and assigned
- [ ] Build settings configured (iOS/Android)
- [ ] Camera permissions added

### Firebase Setup
- [ ] Firebase project created
- [ ] Firestore enabled
- [ ] Storage enabled
- [ ] Security rules deployed
- [ ] Configuration files downloaded

### WebGL Setup
- [ ] Firebase config updated in roomEditor.js
- [ ] Web server running
- [ ] Can access index.html in browser
- [ ] Three.js loading correctly
- [ ] Firebase connection working

## 🎯 Test Workflow

### 1. Test Unity App
```
1. Build and deploy to device
2. Grant camera permissions
3. Tap "Start Scan"
4. Scan room for 30 seconds
5. Tap "Stop Scan"
6. Review results (walls, dimensions)
7. Tap "Upload"
8. Copy Room ID from screen
```

### 2. Test WebGL Editor
```
1. Open browser to http://localhost:8000
2. Enter Room ID from Unity app
3. Click "Load Room"
4. Verify room loads with correct dimensions
5. Select furniture type (e.g., chair)
6. Click on floor to place furniture
7. Test controls (arrow keys, R to rotate, Delete)
8. Click "Save Changes"
```

### 3. Test Sync
```
1. Keep Unity app open after upload
2. Add furniture in WebGL editor
3. Click "Save Changes"
4. Check Unity app - furniture should appear
5. Move furniture in WebGL
6. Verify movement in Unity app
```

## 🔧 Minimal UI Setup

### Required UI Elements

```
Canvas (Screen Space - Overlay)
├── Scanning Panel (GameObject)
│   ├── Start Scan Button
│   ├── Stop Scan Button  
│   ├── Timer Text (TMP)
│   ├── Status Text (TMP)
│   └── Progress Slider
├── Results Panel (GameObject)
│   ├── Wall Count Text (TMP)
│   ├── Floor Area Text (TMP)
│   ├── Dimensions Text (TMP)
│   ├── Room ID Text (TMP)
│   └── Upload Button
```

### Quick UI Setup Steps:
```
1. Create Canvas
2. Add Panel (Background): Right-click Canvas > UI > Panel
3. Add buttons: Right-click Panel > UI > Button - TextMeshPro
4. Add text: Right-click Panel > UI > Text - TextMeshPro
5. Add slider: Right-click Panel > UI > Slider
6. Organize and name elements
7. Link to UIController script
```

## 🎨 Quick Materials Setup

Create these basic materials in Unity:

```
1. Floor Material:
   - Shader: Standard
   - Color: Brown/Wood (RGB: 139, 115, 85)
   - Smoothness: 0.3

2. Wall Material:
   - Shader: Standard
   - Color: Light Gray (RGB: 224, 224, 224)
   - Smoothness: 0.1

3. Ceiling Material:
   - Shader: Standard
   - Color: White (RGB: 255, 255, 255)
   - Smoothness: 0.2
```

## 🪑 Simple Furniture Prefabs

For quick testing, create basic cube prefabs:

```
Chair:
1. Create Cube (0.5, 0.5, 0.5)
2. Position: (0, 0.25, 0)
3. Material: Brown
4. Save as prefab

Table:
1. Create Cube (2, 0.1, 1)
2. Position: (0, 0.75, 0)
3. Material: Dark Brown
4. Save as prefab

Sofa:
1. Create Cube (2, 0.5, 0.8)
2. Position: (0, 0.25, 0)
3. Material: Blue
4. Save as prefab

Bed:
1. Create Cube (2, 0.3, 1.5)
2. Position: (0, 0.4, 0)
3. Material: Red
4. Save as prefab
```

## 🐛 Common Issues & Quick Fixes

### Unity Won't Build
```
✓ Check Build Settings > Switch Platform
✓ Verify all scripts compile (no errors)
✓ Check Player Settings > Minimum API Level
✓ Ensure XR Plugin Management configured
```

### AR Not Working
```
✓ Test on real device (AR doesn't work in Unity editor)
✓ Grant camera permissions
✓ Ensure good lighting
✓ Check AR Session and AR Session Origin present
```

### Firebase Connection Failed
```
✓ Verify google-services.json in Assets/
✓ Check Firebase SDK imported correctly
✓ Verify internet connection
✓ Check Firestore and Storage enabled in console
```

### WebGL Not Loading Room
```
✓ Check browser console for errors
✓ Verify Firebase config correct
✓ Check Room ID is correct
✓ Verify security rules allow read
✓ Check CORS settings
```

### No Furniture Appearing
```
Unity: Check prefabs assigned in Inspector
WebGL: Check browser console for Three.js errors
Both: Verify Firebase connection working
```

## 📱 Build Settings

### iOS Build Settings
```
File > Build Settings
Platform: iOS
Minimum iOS Version: 13.0
Target SDK: Device SDK
Architecture: ARM64

Player Settings:
- Camera Usage Description: "AR room scanning"
- Requires ARKit: Yes
```

### Android Build Settings
```
File > Build Settings
Platform: Android
Minimum API Level: 24 (Android 7.0)
Target API Level: Latest

Player Settings:
- Internet Access: Require
- ARCore: Required
- Camera Permission: Required
```

## 🎉 Success Criteria

You've successfully completed setup when:
- ✅ Unity app builds without errors
- ✅ AR planes detected on device
- ✅ Room scan completes and shows results
- ✅ Upload to Firebase succeeds
- ✅ WebGL editor loads room data
- ✅ Furniture can be added in WebGL
- ✅ Changes sync between Unity and WebGL

## 📞 Need Help?

1. Check the full README.md
2. Review Unity console for errors
3. Check browser console for WebGL errors
4. Verify Firebase console for connection issues
5. Ensure all components are properly linked

---

**Total Setup Time: ~30 minutes**
**First Successful Scan: ~5 minutes after setup**

Good luck! 🚀
