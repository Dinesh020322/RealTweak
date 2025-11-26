// roomEditor.js - Room Editor with Firebase Integration and Material Changer

// ==================== VIEW SWITCHING ====================
function switchToFloorPlan() {
    document.getElementById('room-editor-view').classList.add('hidden');
    document.getElementById('floorplan-view').classList.remove('hidden');
    
    // Sync room ID from editor to floor plan
    const roomId = document.getElementById('room-id-input').value.trim();
    if (roomId) {
        document.getElementById('floorplan-room-id').value = roomId;
        updateRoomNumberDisplay(roomId);
        
        // Auto-load floor plan if it exists
        if (currentRoomData && currentRoomData.floorPlan && currentRoomData.floorPlan.hasFloorPlan) {
            setTimeout(() => {
                loadFloorplan();
            }, 500);
        }
    }
    
    if (!floorplanInitialized) {
        initFloorplan();
    } else {
        resizeFloorplanCanvas();
    }
}

function switchToRoomEditor() {
    document.getElementById('floorplan-view').classList.add('hidden');
    document.getElementById('room-editor-view').classList.remove('hidden');
    
    // Sync room ID from floor plan back to editor
    const roomId = document.getElementById('floorplan-room-id').value.trim();
    if (roomId) {
        document.getElementById('room-id-input').value = roomId;
    }
}

// ==================== FIREBASE SETUP ====================
const firebaseConfig = {
    apiKey: "AIzaSyDrewDfdhUTG8BsPwKBJcWoJCOJVyXV1Ag",
    authDomain: "realtweak.firebaseapp.com",
    projectId: "realtweak",
    storageBucket: "realtweak.firebasestorage.app",
    messagingSenderId: "943647845136",
    appId: "1:943647845136:android:55bf65a1be671efc2f1395"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ==================== GLOBAL VARIABLES ====================
let scene, camera, renderer, controls, transformControls;
let roomMesh, furnitureObjects = {};
let selectedFurnitureType = null;
let selectedObject = null;
let currentRoomId = null;
let currentRoomData = null;
let loadedOBJMesh = null;

// Material Changer Variables
let materialChangerMode = false;
let materialChangerTarget = 'wall'; // 'wall', 'floor', 'furniture'
let selectedMaterial = null;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const objLoader = new THREE.OBJLoader();

// ==================== MATERIAL DEFINITIONS ====================
const MATERIALS = {
    walls: [
        { id: 'wall1', name: 'White', color: 0xFFFFFF },
        { id: 'wall2', name: 'Beige', color: 0xF5F5DC },
        { id: 'wall3', name: 'Light Gray', color: 0xD3D3D3 },
        { id: 'wall4', name: 'Cream', color: 0xFFFDD0 },
        { id: 'wall5', name: 'Light Blue', color: 0xADD8E6 },
        { id: 'wall6', name: 'Mint', color: 0xAAFFE8 },
        { id: 'wall7', name: 'Peach', color: 0xFFDAB9 },
        { id: 'wall8', name: 'Lavender', color: 0xE6E6FA }
    ],
    floors: [
        { id: 'floor1', name: 'Wood Oak', color: 0x8B7355 },
        { id: 'floor2', name: 'Wood Dark', color: 0x654321 },
        { id: 'floor3', name: 'Wood Light', color: 0xD2B48C },
        { id: 'floor4', name: 'Marble White', color: 0xF8F8FF },
        { id: 'floor5', name: 'Marble Gray', color: 0xC0C0C0 },
        { id: 'floor6', name: 'Tile Beige', color: 0xF5DEB3 },
        { id: 'floor7', name: 'Concrete', color: 0x808080 },
        { id: 'floor8', name: 'Dark Stone', color: 0x696969 }
    ],
    furniture: [
        { id: 'furn1', name: 'Red', color: 0xFF0000 },
        { id: 'furn2', name: 'Blue', color: 0x0000FF },
        { id: 'furn3', name: 'Green', color: 0x00FF00 },
        { id: 'furn4', name: 'Yellow', color: 0xFFFF00 },
        { id: 'furn5', name: 'Orange', color: 0xFFA500 },
        { id: 'furn6', name: 'Purple', color: 0x800080 },
        { id: 'furn7', name: 'Pink', color: 0xFFC0CB },
        { id: 'furn8', name: 'Brown', color: 0x8B4513 },
        { id: 'furn9', name: 'Black', color: 0x000000 },
        { id: 'furn10', name: 'White', color: 0xFFFFFF },
        { id: 'furn11', name: 'Gray', color: 0x808080 },
        { id: 'furn12', name: 'Cyan', color: 0x00FFFF }
    ]
};

// ==================== FURNITURE CATEGORIES ====================
const FURNITURE_TYPES = {
    bedroom: [
        { id: 'bed', name: 'Bed', icon: '🛏️' },
        { id: 'bunk_bed', name: 'Bunk Bed', icon: '🛏️' },
        { id: 'crib', name: 'Crib', icon: '👶' }
    ],
    living: [
        { id: 'sofa', name: 'Sofa', icon: '🛋️' },
        { id: 'sofa_l', name: 'L-Sofa', icon: '🛋️' },
        { id: 'armchair', name: 'Armchair', icon: '🪑' },
        { id: 'tv', name: 'TV', icon: '📺' },
        { id: 'fireplace', name: 'Fireplace', icon: '🔥' },
        { id: 'coffee_table', name: 'Coffee Table', icon: '⬜' }
    ],
    kitchen: [
        { id: 'cabinet', name: 'Cabinet', icon: '🗄️' },
        { id: 'stove', name: 'Stove', icon: '🍳' },
        { id: 'fridge', name: 'Fridge', icon: '🧊' },
        { id: 'sink', name: 'Sink', icon: '🚰' },
        { id: 'dishwasher', name: 'Dishwasher', icon: '🍽️' },
        { id: 'microwave', name: 'Microwave', icon: '📦' }
    ],
    bathroom: [
        { id: 'bathtub', name: 'Bathtub', icon: '🛁' },
        { id: 'shower', name: 'Shower', icon: '🚿' },
        { id: 'toilet', name: 'Toilet', icon: '🚽' },
        { id: 'sink_bath', name: 'Sink', icon: '🚰' },
        { id: 'mirror', name: 'Mirror', icon: '🪞' }
    ],
    office: [
        { id: 'desk', name: 'Desk', icon: '🖥️' },
        { id: 'chair', name: 'Chair', icon: '🪑' },
        { id: 'bookshelf', name: 'Bookshelf', icon: '📚' },
        { id: 'filing_cabinet', name: 'Filing Cabinet', icon: '🗄️' }
    ],
    general: [
        { id: 'table', name: 'Table', icon: '🍽️' },
        { id: 'plant', name: 'Plant', icon: '🌿' },
        { id: 'lamp', name: 'Lamp', icon: '💡' },
        { id: 'rug', name: 'Rug', icon: '🟫' },
        { id: 'closet', name: 'Closet', icon: '🚪' }
    ],
    outdoor: [
        { id: 'tree', name: 'Tree', icon: '🌳' },
        { id: 'car', name: 'Car', icon: '🚗' },
        { id: 'bench', name: 'Bench', icon: '🪑' },
        { id: 'pergola', name: 'Pergola', icon: '⌂' }
    ]
};

// ==================== INITIALIZATION ====================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    transformControls.setMode('translate');
    transformControls.setSize(1.5);
    transformControls.addEventListener('dragging-changed', function (event) {
        controls.enabled = !event.value;
    });
    transformControls.addEventListener('objectChange', function () {
        if (selectedObject && transformControls.object) {
            //saveChanges();
        }
    });
    scene.add(transformControls);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onMouseClick);
    document.addEventListener('keydown', onKeyDown);

    generateFurnitureButtons();
    generateMaterialButtons();
    animate();
    updateStatus('Ready! Load room 5216');
}

function generateFurnitureButtons() {
    const container = document.getElementById('furniture-container');
    container.innerHTML = '';

    for (const [category, items] of Object.entries(FURNITURE_TYPES)) {
        const section = document.createElement('div');
        section.className = 'furniture-section';

        const title = document.createElement('h3');
        title.className = 'furniture-category-title';
        title.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'furniture-grid';

        items.forEach(item => {
            const btn = document.createElement('div');
            btn.className = 'furniture-btn';
            btn.onclick = () => selectFurniture(item.id);

            const icon = document.createElement('div');
            icon.className = 'furniture-icon';
            icon.textContent = item.icon;
            btn.appendChild(icon);

            const label = document.createElement('div');
            label.className = 'furniture-label';
            label.textContent = item.name;
            btn.appendChild(label);

            grid.appendChild(btn);
        });

        section.appendChild(grid);
        container.appendChild(section);
    }
}

// ==================== MATERIAL CHANGER FUNCTIONS ====================
function generateMaterialButtons() {
    const container = document.getElementById('material-grid');
    container.innerHTML = '';
    
    updateMaterialGrid();
}

function updateMaterialGrid() {
    const container = document.getElementById('material-grid');
    container.innerHTML = '';
    
    let materials;
    if (materialChangerTarget === 'wall') {
        materials = MATERIALS.walls;
    } else if (materialChangerTarget === 'floor') {
        materials = MATERIALS.floors;
    } else {
        materials = MATERIALS.furniture;
    }
    
    materials.forEach(material => {
        const btn = document.createElement('div');
        btn.className = 'material-btn';
        btn.style.background = `#${material.color.toString(16).padStart(6, '0')}`;
        btn.setAttribute('data-name', material.name);
        btn.onclick = () => selectMaterial(material);
        
        if (selectedMaterial && selectedMaterial.id === material.id) {
            btn.classList.add('active');
        }
        
        container.appendChild(btn);
    });
}

function setMaterialTarget(target) {
    materialChangerTarget = target;
    selectedMaterial = null;
    materialChangerMode = false;
    
    // Update button states
    document.querySelectorAll('.target-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`target-${target}`).classList.add('active');
    
    // Update material grid
    updateMaterialGrid();
    
    // Deselect furniture selection
    if (target !== 'furniture') {
        document.querySelectorAll('.furniture-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        selectedFurnitureType = null;
    }
    
    updateStatus(`Material target: ${target}. Select a material color.`);
}

function selectMaterial(material) {
    selectedMaterial = material;
    materialChangerMode = true;
    selectedFurnitureType = null;
    
    // Update button states
    document.querySelectorAll('.material-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Deselect furniture
    document.querySelectorAll('.furniture-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    if (materialChangerTarget === 'wall') {
        updateStatus(`✨ Material selected! Click on walls to apply ${material.name}`);
    } else if (materialChangerTarget === 'floor') {
        updateStatus(`✨ Material selected! Click on floor to apply ${material.name}`);
    } else {
        updateStatus(`✨ Material selected! Click on furniture to apply ${material.name}`);
    }
}

function applyMaterialToObject(object, material) {
    object.traverse(child => {
        if (child instanceof THREE.Mesh) {
            // Store original material properties if not already stored
            if (!child.userData.originalColor) {
                child.userData.originalColor = child.material.color.getHex();
            }
            
            // Apply new color
            child.material.color.setHex(material.color);
            child.material.needsUpdate = true;
        }
    });
    
    // Store material info in userData
    object.userData.appliedMaterial = {
        id: material.id,
        name: material.name,
        color: material.color
    };
    
    updateStatus(`✅ Applied ${material.name} to ${materialChangerTarget}!`);
}

function applyMaterialToWalls(material) {
    if (loadedOBJMesh) {
        applyMaterialToObject(loadedOBJMesh, material);
    } else if (roomMesh) {
        roomMesh.traverse(child => {
            if (child instanceof THREE.Mesh && child.geometry.type !== 'PlaneGeometry') {
                if (!child.userData.originalColor) {
                    child.userData.originalColor = child.material.color.getHex();
                }
                child.material.color.setHex(material.color);
                child.material.needsUpdate = true;
            }
        });
        updateStatus(`✅ Applied ${material.name} to walls!`);
    }
}

function applyMaterialToFloor(material) {
    if (roomMesh) {
        roomMesh.traverse(child => {
            if (child instanceof THREE.Mesh && 
                (child.geometry.type === 'PlaneGeometry' || 
                 child.geometry.type === 'ShapeGeometry' ||
                 child.position.y < 0.1)) {
                if (!child.userData.originalColor) {
                    child.userData.originalColor = child.material.color.getHex();
                }
                child.material.color.setHex(material.color);
                child.material.needsUpdate = true;
            }
        });
        updateStatus(`✅ Applied ${material.name} to floor!`);
    }
}

// ==================== ANIMATION ====================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== ROOM LOADING ====================
async function loadRoom() {
    const roomId = document.getElementById('room-id-input').value.trim();
    if (!roomId) {
        alert('Enter a Room ID');
        return;
    }

    showLoading(true);
    console.log('============================================');
    console.log('=== LOADING ROOM ===');
    console.log('============================================');
    console.log('🏠 Room ID:', roomId);

    try {
        currentRoomId = roomId;
        const roomDoc = await db.collection('rooms').doc(roomId).get();

        if (!roomDoc.exists) {
            throw new Error('Room not found in Firebase');
        }

        currentRoomData = roomDoc.data();
        console.log('✅ Room data retrieved successfully');
        console.log('📊 Data structure:');
        console.log('  - Has meshUrl:', !!currentRoomData.meshUrl);
        console.log('  - Has floorPlan:', !!currentRoomData.floorPlan);
        console.log('  - Has furniture:', !!currentRoomData.furniture);
        console.log('  - Has dimensions:', !!currentRoomData.dimensions);
        
        if (currentRoomData.meshUrl) {
            console.log('🔗 meshUrl found:', currentRoomData.meshUrl);
        } else {
            console.warn('⚠️ NO meshUrl in room data!');
            console.warn('   This means the floor plan was not saved with OBJ export');
            console.warn('   Please re-save the floor plan in Floor Plan Designer');
        }
        
        clearRoom();
        
        // Load room mesh (OBJ or create from data)
        if (currentRoomData.meshUrl) {
            console.log('\n🎯 STRATEGY: Load OBJ file from Firebase Storage');
            console.log('   URL:', currentRoomData.meshUrl);
            updateStatus('Loading OBJ mesh...');
            
            const objLoadSuccess = await loadOBJMesh(currentRoomData.meshUrl);
            
            if (!objLoadSuccess) {
                console.error('❌ OBJ loading FAILED - using fallback');
                updateStatus('OBJ failed, creating from data...');
                await loadRoomMesh(currentRoomData);
            } else {
                console.log('✅ OBJ loaded successfully!');
            }
        } else {
            console.log('\n🎯 STRATEGY: Create room geometry from floor plan data');
            console.log('   (No OBJ file available)');
            updateStatus('Creating room from data...');
            await loadRoomMesh(currentRoomData);
        }

        // Load furniture
        if (currentRoomData.furniture && currentRoomData.furniture.length > 0) {
            console.log('\n🪑 Loading', currentRoomData.furniture.length, 'furniture items');
            updateStatus('Loading furniture...');
            loadFurniture(currentRoomData.furniture);
        } else {
            console.log('\nℹ️ No furniture data found');
        }

        // Update dimensions display
        if (currentRoomData.dimensions) {
            updateDimensionsDisplay(currentRoomData.dimensions);
        } else {
            console.warn('⚠️ No dimensions data found');
        }
        
        // Listen for updates
        listenForUpdates(roomId);

        // Check for floor plan indicator
        if (currentRoomData.floorPlan && currentRoomData.floorPlan.hasFloorPlan) {
            console.log('✅ Floor plan exists for this room');
            document.getElementById('floorplan-indicator').style.display = 'block';
        } else {
            console.log('ℹ️ No floor plan data for this room');
            document.getElementById('floorplan-indicator').style.display = 'none';
        }

        console.log('\n============================================');
        console.log('=== ROOM LOADED SUCCESSFULLY ===');
        console.log('============================================\n');
        updateStatus('Room loaded! ✅');
        showLoading(false);
        
    } catch (error) {
        console.error('=== ROOM LOAD ERROR ===');
        console.error('Error details:', error);
        alert(`Error: ${error.message}`);
        updateStatus('❌ Error loading room');
        showLoading(false);
    }
}

async function loadOBJMesh(url) {
    try {
        console.log('\n🔍 === LOADING OBJ FILE ===');
        console.log('📍 URL:', url);
        
        // Extract storage path from URL
        const urlMatch = url.match(/\/o\/(.+?)\?/);
        if (!urlMatch) {
            console.error('❌ Invalid storage URL format');
            console.error('   Expected format: https://.../o/meshes%2F0000.obj?...');
            console.error('   Got:', url);
            throw new Error('Invalid storage URL format');
        }
        
        const storagePath = decodeURIComponent(urlMatch[1]);
        console.log('📂 Storage path:', storagePath);
        console.log('   Expected: meshes/XXXX.obj');
        
        // Get download URL from Firebase Storage
        console.log('\n⬇️ Fetching file from Firebase Storage...');
        const storageRef = storage.ref(storagePath);
        const downloadUrl = await storageRef.getDownloadURL();
        console.log('✅ Download URL obtained');
        console.log('   ', downloadUrl.substring(0, 80) + '...');
        
        // Download OBJ file content
        console.log('\n📥 Downloading OBJ file...');
        const objContent = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', downloadUrl, true);
            xhr.responseType = 'text';
            
            xhr.onload = function() {
                if (xhr.status === 200) {
                    console.log('✅ File downloaded successfully');
                    console.log('   File size:', xhr.response.length, 'characters');
                    resolve(xhr.response);
                } else {
                    console.error('❌ Download failed with status:', xhr.status, xhr.statusText);
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            };
            
            xhr.onerror = function() {
                console.error('❌ Network error during download');
                reject(new Error('Network error'));
            };
            
            xhr.send();
        });
        
        console.log('\n🔬 Parsing OBJ content...');
        console.log('   Total lines:', objContent.split('\n').length);
        
        // Parse material colors from OBJ comments
        const materialColors = new Map();
        const lines = objContent.split('\n');
        let currentMaterial = null;
        let vertexCount = 0;
        let faceCount = 0;
        
        for (let line of lines) {
            line = line.trim();
            
            if (line.startsWith('v ')) {
                vertexCount++;
            } else if (line.startsWith('f ')) {
                faceCount++;
            } else if (line.startsWith('# newmtl ')) {
                currentMaterial = line.substring(9).trim();
            } else if (line.startsWith('# Kd ') && currentMaterial) {
                const parts = line.substring(5).trim().split(/\s+/);
                if (parts.length >= 3) {
                    const r = parseFloat(parts[0]);
                    const g = parseFloat(parts[1]);
                    const b = parseFloat(parts[2]);
                    const colorHex = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
                    materialColors.set(currentMaterial, colorHex);
                    console.log(`   📌 Material "${currentMaterial}": RGB(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)}) = #${colorHex.toString(16).padStart(6, '0')}`);
                }
            } else if (line.startsWith('usemtl ')) {
                currentMaterial = line.substring(7).trim();
            }
        }
        
        console.log('\n📊 OBJ Statistics:');
        console.log('   Vertices:', vertexCount);
        console.log('   Faces:', faceCount);
        console.log('   Materials:', materialColors.size);
        
        if (vertexCount === 0 || faceCount === 0) {
            console.error('❌ OBJ file appears to be empty or invalid!');
            throw new Error('Empty or invalid OBJ file');
        }
        
        // Parse OBJ using THREE.OBJLoader
        console.log('\n🎨 Creating 3D objects...');
        const object = objLoader.parse(objContent);
        
        let meshCount = 0;
        object.traverse(function (child) {
            if (child instanceof THREE.Mesh) {
                meshCount++;
                
                // Determine color for this mesh
                let color = 0xD4A574; // Default orange/tan (wall color from floor plan)
                
                // Try to get color from material colors map
                if (currentMaterial && materialColors.has(currentMaterial)) {
                    color = materialColors.get(currentMaterial);
                }
                
                // Apply material
                child.material = new THREE.MeshPhongMaterial({
                    color: color,
                    side: THREE.DoubleSide
                });
                child.receiveShadow = true;
                child.castShadow = true;
                
                console.log(`   🎨 Mesh ${meshCount}: Color #${color.toString(16).padStart(6, '0').toUpperCase()}`);
            }
        });
        
        if (meshCount === 0) {
            console.error('❌ No meshes found in OBJ file!');
            throw new Error('No meshes in OBJ file');
        }
        
        console.log('\n✅ Created', meshCount, 'mesh(es)');
        
        // Add to scene
        console.log('\n🌍 Adding to scene...');
        loadedOBJMesh = object;
        if (roomMesh) {
            console.log('   Removing old room mesh');
            scene.remove(roomMesh);
        }
        roomMesh = object;
        scene.add(roomMesh);
        console.log('✅ Added to scene');
        
        // Position camera
        console.log('\n📷 Positioning camera...');
        positionCameraToRoom();
        console.log('✅ Camera positioned');
        
        console.log('\n🎉 === OBJ LOADED SUCCESSFULLY ===\n');
        updateStatus('✅ OBJ mesh loaded with original colors!');
        return true;  // SUCCESS
        
    } catch (error) {
        console.error('\n❌ === OBJ LOADING FAILED ===');
        console.error('Error type:', error.name);
        console.error('Error message:', error.message);
        console.error('Stack trace:', error.stack);
        console.error('=====================================\n');
        
        // Don't fallback here - let loadRoom handle it
        return false;  // FAILURE
    }
}

async function loadRoomMesh(roomData) {
    createRoomFromData(roomData);
}

function createRoomFromData(roomData) {
    const roomGroup = new THREE.Group();
    
    console.log('Creating room from data:', roomData);

    // Check if we have floor vertices data
    if (roomData.floor && roomData.floor.vertices && roomData.floor.vertices.length > 0) {
        console.log('Creating floor from vertices:', roomData.floor.vertices);
        const floorGeometry = createFloorGeometry(roomData.floor.vertices);
        const floorMaterial = new THREE.MeshPhongMaterial({
            color: 0x8B7355,
            side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.receiveShadow = true;
        roomGroup.add(floor);
    } else if (roomData.dimensions) {
        // Fallback: Create a simple rectangular room from dimensions
        console.log('No floor vertices found, creating default room from dimensions:', roomData.dimensions);
        const width = roomData.dimensions.x || roomData.dimensions.width || 5;
        const depth = roomData.dimensions.z || roomData.dimensions.depth || 5;
        const height = roomData.dimensions.y || roomData.dimensions.height || 3;
        
        // Create floor
        const floorGeometry = new THREE.PlaneGeometry(width, depth);
        const floorMaterial = new THREE.MeshPhongMaterial({
            color: 0x8B7355,
            side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        floor.position.y = 0;
        roomGroup.add(floor);
        
        // Create walls
        const wallMaterial = new THREE.MeshPhongMaterial({
            color: 0xD3D3D3,
            side: THREE.DoubleSide
        });
        
        // Back wall
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial);
        backWall.position.set(0, height/2, -depth/2);
        backWall.castShadow = true;
        backWall.receiveShadow = true;
        roomGroup.add(backWall);
        
        // Front wall
        const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial);
        frontWall.position.set(0, height/2, depth/2);
        frontWall.rotation.y = Math.PI;
        frontWall.castShadow = true;
        frontWall.receiveShadow = true;
        roomGroup.add(frontWall);
        
        // Left wall
        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial);
        leftWall.position.set(-width/2, height/2, 0);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        roomGroup.add(leftWall);
        
        // Right wall
        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial);
        rightWall.position.set(width/2, height/2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        roomGroup.add(rightWall);
        
        console.log('Default room created with dimensions:', width, 'x', depth, 'x', height);
    } else {
        // Ultimate fallback: Create a 5x5x3 meter room
        console.warn('No floor or dimension data found, creating default 5x5x3 room');
        const width = 5, depth = 5, height = 3;
        
        // Create floor
        const floorGeometry = new THREE.PlaneGeometry(width, depth);
        const floorMaterial = new THREE.MeshPhongMaterial({
            color: 0x8B7355,
            side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        floor.position.y = 0;
        roomGroup.add(floor);
        
        // Create walls
        const wallMaterial = new THREE.MeshPhongMaterial({
            color: 0xD3D3D3,
            side: THREE.DoubleSide
        });
        
        // Back wall
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial);
        backWall.position.set(0, height/2, -depth/2);
        backWall.castShadow = true;
        backWall.receiveShadow = true;
        roomGroup.add(backWall);
        
        // Front wall
        const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial);
        frontWall.position.set(0, height/2, depth/2);
        frontWall.rotation.y = Math.PI;
        frontWall.castShadow = true;
        frontWall.receiveShadow = true;
        roomGroup.add(frontWall);
        
        // Left wall
        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial);
        leftWall.position.set(-width/2, height/2, 0);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        roomGroup.add(leftWall);
        
        // Right wall
        const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), wallMaterial);
        rightWall.position.set(width/2, height/2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        roomGroup.add(rightWall);
        
        console.log('Default fallback room created: 5x5x3 meters');
    }

    if (roomMesh) scene.remove(roomMesh);
    roomMesh = roomGroup;
    scene.add(roomMesh);
    
    // Position camera to see the room
    positionCameraToRoom();
    
    console.log('Room mesh added to scene:', roomMesh);
}

function createFloorGeometry(vertices) {
    const shape = new THREE.Shape();
    if (vertices.length > 0) {
        const first = vertices[0];
        shape.moveTo(first.x, first.z);
        for (let i = 1; i < vertices.length; i++) {
            shape.lineTo(vertices[i].x, vertices[i].z);
        }
        shape.lineTo(first.x, first.z);
    }
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
}

function positionCameraToRoom() {
    if (!roomMesh) return;
    
    // Calculate bounding box of the room
    const box = new THREE.Box3().setFromObject(roomMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Calculate camera distance
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.2;
    
    // Position camera
    camera.position.set(
        center.x + cameraDistance * 0.5,
        center.y + cameraDistance * 0.5,
        center.z + cameraDistance * 0.8
    );
    
    // Look at room center
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
    
    console.log('Camera positioned to view room:', {
        cameraPos: camera.position,
        lookAt: center,
        roomSize: size
    });
}

// ==================== FURNITURE MANAGEMENT ====================
function loadFurniture(furnitureList) {
    furnitureList.forEach(item => {
        if (!item.type) return;
        
        const furniture = createFurniture(item);
        if (furniture) {
            furniture.userData = {
                id: item.id,
                type: item.type,
                timestamp: item.timestamp
            };
            furnitureObjects[item.id] = furniture;
            scene.add(furniture);
        }
    });
}

function createFurniture(item) {
    let mesh = create3DFurnitureModel(item.type);

    mesh.position.set(item.position.x, item.position.y, item.position.z);
    
    if (item.rotation) {
        mesh.rotation.set(
            item.rotation.x || 0,
            item.rotation.y || 0,
            item.rotation.z || 0
        );
    }

    return mesh;
}

// ==================== 3D FURNITURE MODELS - ALL TYPES ====================
function create3DFurnitureModel(type) {
    let group;
    
    switch(type.toLowerCase()) {
        // BEDROOM
        case 'bed':
            group = createBigBed();
            break;
        case 'bunk_bed':
            group = createBunkBed();
            break;
        case 'crib':
            group = createCrib();
            break;

        // LIVING ROOM
        case 'sofa':
            group = createBigSofa();
            break;
        case 'sofa_l':
            group = createLSofa();
            break;
        case 'armchair':
            group = createArmchair();
            break;
        case 'tv':
            group = createTV();
            break;
        case 'fireplace':
            group = createFireplace();
            break;
        case 'coffee_table':
            group = createCoffeeTable();
            break;

        // KITCHEN
        case 'cabinet':
            group = createCabinet();
            break;
        case 'stove':
            group = createStove();
            break;
        case 'fridge':
            group = createFridge();
            break;
        case 'sink':
            group = createKitchenSink();
            break;
        case 'dishwasher':
            group = createDishwasher();
            break;
        case 'microwave':
            group = createMicrowave();
            break;

        // BATHROOM
        case 'bathtub':
            group = createBathtub();
            break;
        case 'shower':
            group = createShower();
            break;
        case 'toilet':
            group = createToilet();
            break;
        case 'sink_bath':
            group = createBathroomSink();
            break;
        case 'mirror':
            group = createMirror();
            break;

        // OFFICE
        case 'desk':
            group = createDesk();
            break;
        case 'chair':
            group = createBigChair();
            break;
        case 'bookshelf':
            group = createBookshelf();
            break;
        case 'filing_cabinet':
            group = createFilingCabinet();
            break;

        // GENERAL
        case 'table':
            group = createBigTable();
            break;
        case 'plant':
            group = createPlant();
            break;
        case 'lamp':
            group = createLamp();
            break;
        case 'rug':
            group = createRug();
            break;
        case 'closet':
            group = createCloset();
            break;

        // OUTDOOR
        case 'tree':
            group = createTree();
            break;
        case 'car':
            group = createCar();
            break;
        case 'bench':
            group = createBench();
            break;
        case 'pergola':
            group = createPergola();
            break;

        default:
            group = createBigChair();
    }
    
    return group;
}

// BEDROOM FURNITURE
function createBigBed() {
    const group = new THREE.Group();
    
    const mattress = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.3, 1.6),
        new THREE.MeshPhongMaterial({ color: 0xDC143C })
    );
    mattress.position.y = 0.45;
    mattress.castShadow = true;
    group.add(mattress);
    
    const headboard = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.8, 0.1),
        new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    );
    headboard.position.set(0, 0.7, -0.85);
    headboard.castShadow = true;
    group.add(headboard);
    
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 0.3, 1.7),
        new THREE.MeshPhongMaterial({ color: 0x654321 })
    );
    frame.position.y = 0.15;
    frame.castShadow = true;
    group.add(frame);
    
    return group;
}

function createBunkBed() {
    const group = new THREE.Group();
    const lowerBed = createBigBed();
    lowerBed.scale.set(0.8, 0.8, 0.8);
    group.add(lowerBed);
    
    const upperBed = createBigBed();
    upperBed.scale.set(0.8, 0.8, 0.8);
    upperBed.position.y = 1.5;
    group.add(upperBed);
    
    // Ladder
    for (let i = 0; i < 4; i++) {
        const rung = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8),
            new THREE.MeshPhongMaterial({ color: 0x8B4513 })
        );
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0.8, 0.4 + i * 0.4, 0);
        rung.castShadow = true;
        group.add(rung);
    }
    
    return group;
}

function createCrib() {
    const group = new THREE.Group();
    const cribBase = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.3, 0.8),
        new THREE.MeshPhongMaterial({ color: 0xFFE4E1 })
    );
    cribBase.position.y = 0.3;
    cribBase.castShadow = true;
    group.add(cribBase);
    
    for (let i = 0; i < 10; i++) {
        const bar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8),
            new THREE.MeshPhongMaterial({ color: 0x8B4513 })
        );
        bar.position.set(-0.5 + i * 0.11, 0.6, 0.4);
        bar.castShadow = true;
        group.add(bar);
        
        const bar2 = bar.clone();
        bar2.position.z = -0.4;
        group.add(bar2);
    }
    
    return group;
}

// LIVING ROOM FURNITURE
function createBigSofa() {
    const group = new THREE.Group();
    
    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.4, 0.8),
        new THREE.MeshPhongMaterial({ color: 0x4169E1 })
    );
    seat.position.y = 0.4;
    seat.castShadow = true;
    group.add(seat);
    
    const back = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.6, 0.2),
        new THREE.MeshPhongMaterial({ color: 0x4169E1 })
    );
    back.position.set(0, 0.7, -0.3);
    back.castShadow = true;
    group.add(back);
    
    const leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.5, 0.8),
        new THREE.MeshPhongMaterial({ color: 0x3658B8 })
    );
    leftArm.position.set(-1.0, 0.55, 0);
    leftArm.castShadow = true;
    group.add(leftArm);
    
    const rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.5, 0.8),
        new THREE.MeshPhongMaterial({ color: 0x3658B8 })
    );
    rightArm.position.set(1.0, 0.55, 0);
    rightArm.castShadow = true;
    group.add(rightArm);
    
    return group;
}

function createLSofa() {
    const group = new THREE.Group();
    const mainSofa = createBigSofa();
    group.add(mainSofa);
    
    const sideSofa = createBigSofa();
    sideSofa.rotation.y = Math.PI / 2;
    sideSofa.position.set(1.5, 0, 0.5);
    group.add(sideSofa);
    
    return group;
}

function createArmchair() {
    const group = createBigChair();
    group.scale.set(1.2, 1.2, 1.2);
    return group;
}

function createTV() {
    const group = new THREE.Group();
    const tvScreen = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.9, 0.1),
        new THREE.MeshPhongMaterial({ color: 0x000000 })
    );
    tvScreen.position.y = 1.0;
    tvScreen.castShadow = true;
    group.add(tvScreen);
    
    const tvStand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8),
        new THREE.MeshPhongMaterial({ color: 0x333333 })
    );
    tvStand.position.y = 0.25;
    tvStand.castShadow = true;
    group.add(tvStand);
    
    return group;
}

function createFireplace() {
    const group = new THREE.Group();
    const fireBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.2, 0.4),
        new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    );
    fireBox.position.y = 0.6;
    fireBox.castShadow = true;
    group.add(fireBox);
    
    const fire = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.4, 0.2),
        new THREE.MeshPhongMaterial({ color: 0xFF6347, emissive: 0xFF4500, emissiveIntensity: 0.5 })
    );
    fire.position.set(0, 0.3, 0);
    group.add(fire);
    
    return group;
}

function createCoffeeTable() {
    const group = createBigTable();
    group.scale.set(0.6, 0.4, 0.6);
    return group;
}

// KITCHEN FURNITURE
function createCabinet() {
    const group = new THREE.Group();
    const cabinet = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.9, 0.6),
        new THREE.MeshPhongMaterial({ color: 0x8B7355 })
    );
    cabinet.position.y = 0.45;
    cabinet.castShadow = true;
    group.add(cabinet);
    return group;
}

function createStove() {
    const group = new THREE.Group();
    const stoveBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.9, 0.8),
        new THREE.MeshPhongMaterial({ color: 0xC0C0C0 })
    );
    stoveBody.position.y = 0.45;
    stoveBody.castShadow = true;
    group.add(stoveBody);
    
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            const burner = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16),
                new THREE.MeshPhongMaterial({ color: 0x000000 })
            );
            burner.position.set(-0.2 + i * 0.4, 0.92, -0.2 + j * 0.4);
            burner.castShadow = true;
            group.add(burner);
        }
    }
    
    return group;
}

function createFridge() {
    const group = new THREE.Group();
    const fridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.8, 0.8),
        new THREE.MeshPhongMaterial({ color: 0xE8E8E8 })
    );
    fridge.position.y = 0.9;
    fridge.castShadow = true;
    group.add(fridge);
    
    const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.3, 0.05),
        new THREE.MeshPhongMaterial({ color: 0x666666 })
    );
    handle.position.set(0.35, 1.2, 0);
    group.add(handle);
    
    return group;
}

function createKitchenSink() {
    const group = new THREE.Group();
    const sinkBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.9, 0.6),
        new THREE.MeshPhongMaterial({ color: 0x8B7355 })
    );
    sinkBase.position.y = 0.45;
    sinkBase.castShadow = true;
    group.add(sinkBase);
    
    const sinkBowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.2, 0.15, 16),
        new THREE.MeshPhongMaterial({ color: 0xC0C0C0 })
    );
    sinkBowl.position.y = 0.85;
    sinkBowl.castShadow = true;
    group.add(sinkBowl);
    
    return group;
}

function createDishwasher() {
    const group = new THREE.Group();
    const dishwasher = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.85, 0.6),
        new THREE.MeshPhongMaterial({ color: 0xE0E0E0 })
    );
    dishwasher.position.y = 0.425;
    dishwasher.castShadow = true;
    group.add(dishwasher);
    return group;
}

function createMicrowave() {
    const group = new THREE.Group();
    const microwave = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.3, 0.4),
        new THREE.MeshPhongMaterial({ color: 0xD3D3D3 })
    );
    microwave.position.y = 0.15;
    microwave.castShadow = true;
    group.add(microwave);
    return group;
}

// BATHROOM FURNITURE
function createBathtub() {
    const group = new THREE.Group();
    const tub = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.6, 0.8),
        new THREE.MeshPhongMaterial({ color: 0xFFFFFF })
    );
    tub.position.y = 0.3;
    tub.castShadow = true;
    group.add(tub);
    return group;
}

function createShower() {
    const group = new THREE.Group();
    const showerBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.1, 0.9),
        new THREE.MeshPhongMaterial({ color: 0xFFFFFF })
    );
    showerBase.position.y = 0.05;
    showerBase.castShadow = true;
    group.add(showerBase);
    
    const showerWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 2.0, 0.05),
        new THREE.MeshPhongMaterial({ color: 0xE0E0E0, transparent: true, opacity: 0.5 })
    );
    showerWall.position.set(0, 1.0, -0.45);
    group.add(showerWall);
    
    return group;
}

function createToilet() {
    const group = new THREE.Group();
    const toiletBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 0.4, 16),
        new THREE.MeshPhongMaterial({ color: 0xFFFFFF })
    );
    toiletBase.position.y = 0.2;
    toiletBase.castShadow = true;
    group.add(toiletBase);
    
    const toiletTank = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.5, 0.2),
        new THREE.MeshPhongMaterial({ color: 0xFFFFFF })
    );
    toiletTank.position.set(0, 0.5, -0.15);
    toiletTank.castShadow = true;
    group.add(toiletTank);
    
    return group;
}

function createBathroomSink() {
    const group = new THREE.Group();
    const sinkBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.8, 0.5),
        new THREE.MeshPhongMaterial({ color: 0xFFFFFF })
    );
    sinkBase.position.y = 0.4;
    sinkBase.castShadow = true;
    group.add(sinkBase);
    
    const sinkBowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.15, 0.1, 16),
        new THREE.MeshPhongMaterial({ color: 0xC0C0C0 })
    );
    sinkBowl.position.y = 0.75;
    sinkBowl.castShadow = true;
    group.add(sinkBowl);
    
    return group;
}

function createMirror() {
    const group = new THREE.Group();
    const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.0, 0.05),
        new THREE.MeshPhongMaterial({ color: 0xB0E0E6, shininess: 100 })
    );
    mirror.position.y = 1.0;
    group.add(mirror);
    return group;
}

// OFFICE FURNITURE
function createDesk() {
    return createBigTable();
}

function createBigChair() {
    const group = new THREE.Group();

    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.1, 0.6),
        new THREE.MeshPhongMaterial({ color: 0x8B4513, emissive: 0x442200 })
    );
    seat.position.y = 0.45;
    seat.castShadow = true;
    group.add(seat);

    const backrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.5, 0.1),
        new THREE.MeshPhongMaterial({ color: 0x8B4513, emissive: 0x442200 })
    );
    backrest.position.set(0, 0.75, -0.25);
    backrest.castShadow = true;
    group.add(backrest);

    const legPositions = [
        [-0.25, -0.25],
        [0.25, -0.25],
        [-0.25, 0.25],
        [0.25, 0.25]
    ];
    
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8),
            new THREE.MeshPhongMaterial({ color: 0x654321 })
        );
        leg.position.set(pos[0], 0.225, pos[1]);
        leg.castShadow = true;
        group.add(leg);
    });

    return group;
}

function createBookshelf() {
    const group = new THREE.Group();
    const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 1.8, 0.3),
        new THREE.MeshPhongMaterial({ color: 0x8B7355 })
    );
    shelf.position.y = 0.9;
    shelf.castShadow = true;
    group.add(shelf);
    
    for (let i = 0; i < 5; i++) {
        const shelfPlank = new THREE.Mesh(
            new THREE.BoxGeometry(0.95, 0.03, 0.28),
            new THREE.MeshPhongMaterial({ color: 0x654321 })
        );
        shelfPlank.position.y = 0.1 + i * 0.4;
        shelfPlank.castShadow = true;
        group.add(shelfPlank);
    }
    
    return group;
}

function createFilingCabinet() {
    const group = new THREE.Group();
    const fileCab = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1.2, 0.6),
        new THREE.MeshPhongMaterial({ color: 0x808080 })
    );
    fileCab.position.y = 0.6;
    fileCab.castShadow = true;
    group.add(fileCab);
    return group;
}

// GENERAL FURNITURE
function createBigTable() {
    const group = new THREE.Group();

    const top = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.08, 1.0),
        new THREE.MeshPhongMaterial({ color: 0x8B7355 })
    );
    top.position.y = 0.75;
    top.castShadow = true;
    group.add(top);

    const legPositions = [
        [-0.65, -0.4],
        [0.65, -0.4],
        [-0.65, 0.4],
        [0.65, 0.4]
    ];
    
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.75, 0.08),
            new THREE.MeshPhongMaterial({ color: 0x654321 })
        );
        leg.position.set(pos[0], 0.375, pos[1]);
        leg.castShadow = true;
        group.add(leg);
    });

    return group;
}

function createPlant() {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 0.3, 16),
        new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    );
    pot.position.y = 0.15;
    pot.castShadow = true;
    group.add(pot);
    
    const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshPhongMaterial({ color: 0x228B22 })
    );
    leaves.position.y = 0.5;
    leaves.castShadow = true;
    group.add(leaves);
    
    return group;
}

function createLamp() {
    const group = new THREE.Group();
    const lampStand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.05, 0.6, 8),
        new THREE.MeshPhongMaterial({ color: 0xFFD700 })
    );
    lampStand.position.y = 0.3;
    lampStand.castShadow = true;
    group.add(lampStand);
    
    const lampShade = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.3, 16),
        new THREE.MeshPhongMaterial({ color: 0xFFF8DC, emissive: 0xFFFF00, emissiveIntensity: 0.2 })
    );
    lampShade.position.y = 0.75;
    group.add(lampShade);
    
    return group;
}

function createRug() {
    const group = new THREE.Group();
    const rug = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 1.5),
        new THREE.MeshPhongMaterial({ color: 0xD2691E, side: THREE.DoubleSide })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.01;
    rug.receiveShadow = true;
    group.add(rug);
    return group;
}

function createCloset() {
    const group = new THREE.Group();
    const closet = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 2.0, 0.6),
        new THREE.MeshPhongMaterial({ color: 0x8B7355 })
    );
    closet.position.y = 1.0;
    closet.castShadow = true;
    group.add(closet);
    return group;
}

// OUTDOOR FURNITURE
function createTree() {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 1.5, 8),
        new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    );
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    group.add(trunk);
    
    const foliage = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 8, 8),
        new THREE.MeshPhongMaterial({ color: 0x228B22 })
    );
    foliage.position.y = 1.8;
    foliage.castShadow = true;
    group.add(foliage);
    
    return group;
}

function createCar() {
    const group = new THREE.Group();
    const carBody = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.8, 1.0),
        new THREE.MeshPhongMaterial({ color: 0xFF4500 })
    );
    carBody.position.y = 0.4;
    carBody.castShadow = true;
    group.add(carBody);
    
    const carRoof = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.5, 0.9),
        new THREE.MeshPhongMaterial({ color: 0xFF4500 })
    );
    carRoof.position.y = 1.05;
    carRoof.castShadow = true;
    group.add(carRoof);
    
    [-0.6, 0.6].forEach(z => {
        [-0.7, 0.7].forEach(x => {
            const wheel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16),
                new THREE.MeshPhongMaterial({ color: 0x000000 })
            );
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, 0.2, z);
            wheel.castShadow = true;
            group.add(wheel);
        });
    });
    
    return group;
}

function createBench() {
    const group = new THREE.Group();
    const benchSeat = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.1, 0.4),
        new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    );
    benchSeat.position.y = 0.45;
    benchSeat.castShadow = true;
    group.add(benchSeat);
    
    [-0.6, 0.6].forEach(x => {
        const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.45, 0.1),
            new THREE.MeshPhongMaterial({ color: 0x654321 })
        );
        leg.position.set(x, 0.225, 0);
        leg.castShadow = true;
        group.add(leg);
    });
    
    return group;
}

function createPergola() {
    const group = new THREE.Group();
    const pergolaBeam = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 0.2, 0.2),
        new THREE.MeshPhongMaterial({ color: 0x8B4513 })
    );
    pergolaBeam.position.y = 2.5;
    pergolaBeam.castShadow = true;
    group.add(pergolaBeam);
    
    [-1.4, 1.4].forEach(x => {
        [-1.4, 1.4].forEach(z => {
            const post = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 2.5, 0.15),
                new THREE.MeshPhongMaterial({ color: 0x8B4513 })
            );
            post.position.set(x, 1.25, z);
            post.castShadow = true;
            group.add(post);
        });
    });
    
    return group;
}

function selectFurniture(type) {
    selectedFurnitureType = type;
    materialChangerMode = false;
    selectedMaterial = null;
    
    document.querySelectorAll('.furniture-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    event.target.closest('.furniture-btn').classList.add('selected');
    
    // Deselect materials
    document.querySelectorAll('.material-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    updateStatus(`Selected: ${type}. Click floor to place!`);
}

// ==================== MOUSE & KEYBOARD INTERACTION ====================
function onMouseClick(event) {
    if (!currentRoomId) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Material Changer Mode
    if (materialChangerMode && selectedMaterial) {
        if (materialChangerTarget === 'wall') {
            applyMaterialToWalls(selectedMaterial);
            return;
        } else if (materialChangerTarget === 'floor') {
            applyMaterialToFloor(selectedMaterial);
            return;
        } else if (materialChangerTarget === 'furniture') {
            const furnitureArray = Object.values(furnitureObjects);
            const furnitureIntersects = raycaster.intersectObjects(furnitureArray, true);
            
            if (furnitureIntersects.length > 0) {
                let object = furnitureIntersects[0].object;
                while (object.parent && !object.userData.id) {
                    object = object.parent;
                }
                applyMaterialToObject(object, selectedMaterial);
                return;
            } else {
                updateStatus('Click on a furniture item to apply material');
                return;
            }
        }
    }

    // Furniture Selection Mode
    const furnitureArray = Object.values(furnitureObjects);
    const furnitureIntersects = raycaster.intersectObjects(furnitureArray, true);

    if (furnitureIntersects.length > 0) {
        let object = furnitureIntersects[0].object;
        while (object.parent && !object.userData.id) {
            object = object.parent;
        }
        selectObject(object);
        return;
    }

    // Furniture Placement Mode
    if (selectedFurnitureType && roomMesh) {
        const intersects = raycaster.intersectObjects([roomMesh], true);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            point.y = 0;
            placeFurniture(selectedFurnitureType, point);
        }
    }
}

function placeFurniture(type, position) {
    const furnitureId = generateId();
    const furnitureData = {
        id: furnitureId,
        type: type,
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        timestamp: Date.now()
    };

    const furniture = createFurniture(furnitureData);
    furniture.userData = {
        id: furnitureId,
        type: type,
        timestamp: furnitureData.timestamp
    };

    furnitureObjects[furnitureId] = furniture;
    scene.add(furniture);

    updateStatus(`✅ Placed ${type}!`);
    //saveChanges();
}

function selectObject(object) {
    if (selectedObject) {
        selectedObject.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.material.emissive = new THREE.Color(0x000000);
            }
        });
        transformControls.detach();
    }

    selectedObject = object;

    if (selectedObject) {
        selectedObject.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.material.emissive = new THREE.Color(0x00ff00);
                child.material.emissiveIntensity = 0.5;
            }
        });
        
        transformControls.attach(selectedObject);
        updateStatus(`Selected: ${selectedObject.userData.type} (G=move, R=rotate, S=scale)`);
    }
}

function onKeyDown(event) {
    if ((event.key.toLowerCase() === 'delete' || event.key === 'Backspace') && selectedObject) {
        deleteSelected();
        return;
    }
    
    if (!selectedObject) return;

    const key = event.key.toLowerCase();
    
    switch (key) {
        case 'g':
            transformControls.setMode('translate');
            updateStatus(`Move mode (G)`);
            break;
        case 'r':
            transformControls.setMode('rotate');
            updateStatus(`Rotate mode (R)`);
            break;
        case 's':
            transformControls.setMode('scale');
            updateStatus(`Scale mode (S)`);
            break;
        case 'escape':
            transformControls.detach();
            if (selectedObject) {
                selectedObject.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child.material.emissive = new THREE.Color(0x000000);
                    }
                });
            }
            selectedObject = null;
            updateStatus('Deselected');
            break;
        case '+':
        case '=':
            transformControls.setSize(transformControls.size + 0.1);
            break;
        case '-':
        case '_':
            transformControls.setSize(Math.max(0.5, transformControls.size - 0.1));
            break;
    }
}

function deleteSelected() {
    if (!selectedObject) {
        alert('No object selected');
        return;
    }

    const id = selectedObject.userData.id;
    const type = selectedObject.userData.type;
    
    transformControls.detach();
    scene.remove(selectedObject);
    delete furnitureObjects[id];
    selectedObject = null;

    updateStatus(`Deleted ${type}`);
    //saveChanges();
}

// ==================== 3-ANGLE RENDER DOWNLOAD ====================
async function downloadRoomRenders() {
    updateStatus('Generating renders...');
    showLoading(true);
    
    const originalPosition = camera.position.clone();
    const originalRotation = camera.rotation.clone();
    
    // Calculate room center and bounds
    const center = new THREE.Vector3();
    const box = new THREE.Box3();
    
    if (roomMesh) {
        box.setFromObject(roomMesh);
        box.getCenter(center);
    }
    
    Object.values(furnitureObjects).forEach(obj => {
        box.expandByObject(obj);
    });
    
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;
    
    const angles = [
        { name: 'front', position: new THREE.Vector3(center.x, center.y + distance * 0.5, center.z + distance) },
        { name: 'top', position: new THREE.Vector3(center.x, center.y + distance * 1.5, center.z) },
        { name: 'perspective', position: new THREE.Vector3(center.x + distance * 0.7, center.y + distance * 0.6, center.z + distance * 0.7) }
    ];
    
    const renders = [];
    
    for (const angle of angles) {
        camera.position.copy(angle.position);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
        
        // Render at high resolution
        const originalSize = renderer.getSize(new THREE.Vector2());
        renderer.setSize(1920, 1080);
        renderer.render(scene, camera);
        
        const dataURL = renderer.domElement.toDataURL('image/png');
        renders.push({ name: angle.name, data: dataURL });
        
        renderer.setSize(originalSize.x, originalSize.y);
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Download all renders
    renders.forEach(render => {
        const link = document.createElement('a');
        link.download = `room_${currentRoomId}_${render.name}.png`;
        link.href = render.data;
        link.click();
    });
    
    camera.position.copy(originalPosition);
    camera.rotation.copy(originalRotation);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    
    updateStatus('✅ Renders downloaded!');
    showLoading(false);
}

// ==================== FIREBASE SAVE ====================
async function saveChanges() {
    if (!currentRoomId) return;

    try {
        const furnitureList = Object.values(furnitureObjects).map(obj => {
            return {
                id: obj.userData.id,
                type: obj.userData.type,
                position: { 
                    x: obj.position.x, 
                    y: obj.position.y, 
                    z: obj.position.z 
                },
                rotation: { 
                    x: obj.rotation.x, 
                    y: obj.rotation.y, 
                    z: obj.rotation.z 
                },
                scale: { 
                    x: obj.scale.x, 
                    y: obj.scale.y, 
                    z: obj.scale.z 
                },
                timestamp: Date.now()
            };
        });

        await db.collection('rooms').doc(currentRoomId).update({
            furniture: furnitureList,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Save error:', error);
    }
}

// ==================== UTILITY FUNCTIONS ====================
function listenForUpdates(roomId) {
    db.collection('rooms').doc(roomId).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (currentRoomData && data.timestamp !== currentRoomData.timestamp) {
                // Handle updates
            }
        }
    });
}

function clearRoom() {
    if (transformControls) {
        transformControls.detach();
    }
    
    if (roomMesh) {
        scene.remove(roomMesh);
        roomMesh = null;
    }
    if (loadedOBJMesh) {
        scene.remove(loadedOBJMesh);
        loadedOBJMesh = null;
    }
    Object.values(furnitureObjects).forEach(obj => scene.remove(obj));
    furnitureObjects = {};
    selectedObject = null;
}

function updateDimensionsDisplay(dimensions) {
    if (!dimensions) return;

    document.getElementById('dim-width').textContent = dimensions.x.toFixed(2) + ' m';
    document.getElementById('dim-height').textContent = dimensions.y.toFixed(2) + ' m';
    document.getElementById('dim-depth').textContent = dimensions.z.toFixed(2) + ' m';
    
    const area = (dimensions.x * dimensions.z).toFixed(2);
    document.getElementById('dim-area').textContent = area + ' m²';
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function generateId() {
    return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}


// ==================== START ====================
window.addEventListener('load', init);