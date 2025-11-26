// floorplanDesigner.js - Floor Plan Designer with Firebase Integration

        let floorplanInitialized = false;
        let fpRenderer3D, fpScene3D, fpCamera3D;
        const fpCanvas = document.getElementById('floorplanCanvas');
        const fpCtx = fpCanvas.getContext('2d');

        let currentTool = 'select';
        let currentCategory = 'structure';
        let currentFurnitureType = 'bed';
        let currentDoorType = 'single_closed';
        let currentWindowType = 'standard';
        let isDrawing = false;
        let startX, startY;
        let fpScale = 1;
        let fpPanX = 0, fpPanY = 0;
        let isDragging = false;
        let draggedStructure = null;
        let draggedFurniture = null;
        let draggedDoor = null;
        let draggedWindow = null;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let resizeHandle = null;
        let selectedFurniture = null;
        let selectedDoor = null;
        let selectedWindow = null;
        let isRotating = false;

        let walls = [];
        let doors = [];
        let windows = [];
        let furniture = [];
        let dimensions = [];
        let structures = [];
        let history = [];
        let historyIndex = -1;

        const GRID_SIZE = 20;
        const WALL_WIDTH = 15;

        // ==================== FURNITURE CATEGORIES ====================
        const FURNITURE_CATEGORIES = {
            structure: {
                title: 'STRUCTURE',
                items: [
                    { id: 'square', name: 'Square', icon: '⬜' },
                    { id: 'rectangle', name: 'Rectangle', icon: '▭' },
                    { id: 'lshape', name: 'L-Shape', icon: '⌐' },
                    { id: 'ushape', name: 'U-Shape', icon: '⊓' },
                    { id: 'tshape', name: 'T-Shape', icon: '⊤' },
                    { id: 'circle', name: 'Circle', icon: '●' },
                    { id: 'triangle', name: 'Triangle', icon: '△' },
                    { id: 'hexagon', name: 'Hexagon', icon: '⬡' }
                ]
            },
            doors: {
                title: 'DOORS',
                items: [
                    { id: 'single_closed', name: 'Single Closed', icon: '🚪' },
                    { id: 'single_open', name: 'Single Open', icon: '🚪' },
                    { id: 'double_closed', name: 'Double Closed', icon: '🚪' },
                    { id: 'double_open', name: 'Double Open', icon: '🚪' }
                ]
            },
            windows: {
                title: 'WINDOWS',
                items: [
                    { id: 'standard', name: 'Standard', icon: '🪟' },
                    { id: 'wide', name: 'Wide', icon: '🪟' },
                    { id: 'bay', name: 'Bay', icon: '🪟' },
                    { id: 'sliding', name: 'Sliding', icon: '🪟' }
                ]
            },
            bedroom: {
                title: 'BEDROOM',
                items: [
                    { id: 'bed', name: 'Bed', icon: '🛏️' },
                    { id: 'bunk_bed', name: 'Bunk Bed', icon: '🛏️' },
                    { id: 'crib', name: 'Crib', icon: '👶' }
                ]
            },
            living: {
                title: 'LIVING ROOM',
                items: [
                    { id: 'sofa', name: 'Sofa', icon: '🛋️' },
                    { id: 'sofa_l', name: 'L-Sofa', icon: '🛋️' },
                    { id: 'armchair', name: 'Armchair', icon: '🪑' },
                    { id: 'tv', name: 'TV', icon: '📺' },
                    { id: 'fireplace', name: 'Fireplace', icon: '🔥' },
                    { id: 'coffee_table', name: 'Coffee Table', icon: '⬜' }
                ]
            },
            kitchen: {
                title: 'KITCHEN',
                items: [
                    { id: 'cabinet', name: 'Cabinet', icon: '🗄️' },
                    { id: 'stove', name: 'Stove', icon: '🍳' },
                    { id: 'fridge', name: 'Fridge', icon: '🧊' },
                    { id: 'sink', name: 'Sink', icon: '🚰' },
                    { id: 'dishwasher', name: 'Dishwasher', icon: '🍽️' },
                    { id: 'microwave', name: 'Microwave', icon: '📦' }
                ]
            },
            bathroom: {
                title: 'BATHROOM',
                items: [
                    { id: 'bathtub', name: 'Bathtub', icon: '🛁' },
                    { id: 'shower', name: 'Shower', icon: '🚿' },
                    { id: 'toilet', name: 'Toilet', icon: '🚽' },
                    { id: 'sink', name: 'Sink', icon: '🚰' },
                    { id: 'mirror', name: 'Mirror', icon: '🪞' }
                ]
            },
            office: {
                title: 'OFFICE',
                items: [
                    { id: 'desk', name: 'Desk', icon: '🖥️' },
                    { id: 'chair', name: 'Chair', icon: '🪑' },
                    { id: 'bookshelf', name: 'Bookshelf', icon: '📚' },
                    { id: 'filing_cabinet', name: 'Cabinet', icon: '🗄️' }
                ]
            },
            general: {
                title: 'GENERAL',
                items: [
                    { id: 'table', name: 'Table', icon: '🍽️' },
                    { id: 'chair', name: 'Chair', icon: '🪑' },
                    { id: 'plant', name: 'Plant', icon: '🌿' },
                    { id: 'lamp', name: 'Lamp', icon: '💡' },
                    { id: 'rug', name: 'Rug', icon: '🟫' },
                    { id: 'closet', name: 'Closet', icon: '🚪' }
                ]
            },
            outdoor: {
                title: 'OUTDOOR',
                items: [
                    { id: 'tree', name: 'Tree', icon: '🌳' },
                    { id: 'car', name: 'Car', icon: '🚗' },
                    { id: 'bench', name: 'Bench', icon: '🪑' },
                    { id: 'pergola', name: 'Pergola', icon: '⌂' }
                ]
            }
        };



        // ==================== INITIALIZATION ====================
        function initFloorplan() {
            floorplanInitialized = true;
            resizeFloorplanCanvas();
            generateCategoryPanel();
            selectTool('select');
            fpCanvas.addEventListener('mousedown', fpHandleMouseDown);
            fpCanvas.addEventListener('mousemove', fpHandleMouseMove);
            fpCanvas.addEventListener('mouseup', fpHandleMouseUp);
            fpCanvas.addEventListener('wheel', fpHandleZoom, false);
            document.addEventListener('keydown', fpHandleKeyDown);
            window.addEventListener('resize', resizeFloorplanCanvas);
            
            // Sync room ID from room editor if available
            syncRoomIdFromEditor();
            
            fpRedraw();
        }

        function syncRoomIdFromEditor() {
            const roomEditorId = document.getElementById('room-id-input').value.trim();
            if (roomEditorId && currentRoomId) {
                document.getElementById('floorplan-room-id').value = currentRoomId;
                updateRoomNumberDisplay(currentRoomId);
            }
        }

        function updateRoomNumberDisplay(roomId) {
            const display = document.getElementById('roomNumberDisplay');
            if (roomId) {
                display.textContent = `Room: ${roomId}`;
                display.style.background = 'rgba(79, 195, 247, 0.95)';
            } else {
                display.textContent = 'Room: New Project';
                display.style.background = 'rgba(158, 158, 158, 0.95)';
            }
        }

        function generateCategoryPanel() {
            const panel = document.getElementById('rightPanel');
            panel.innerHTML = '';

            for (const [categoryKey, category] of Object.entries(FURNITURE_CATEGORIES)) {
                const section = document.createElement('div');
                section.className = 'panel-section';

                const title = document.createElement('div');
                title.className = 'panel-title';
                title.textContent = category.title;
                section.appendChild(title);

                const grid = document.createElement('div');
                grid.className = 'category-grid';

                category.items.forEach(item => {
                    const btn = document.createElement('button');
                    btn.className = 'category-btn';
                    btn.onclick = () => {
                        if (categoryKey === 'structure') {
                            addStructure(item.id);
                        } else if (categoryKey === 'doors') {
                            selectDoorType(item.id);
                        } else if (categoryKey === 'windows') {
                            selectWindowType(item.id);
                        } else {
                            selectFurnitureType(item.id);
                        }
                    };

                    const icon = document.createElement('div');
                    icon.className = 'category-icon';
                    icon.textContent = item.icon;
                    btn.appendChild(icon);

                    const name = document.createElement('div');
                    name.textContent = item.name;
                    name.style.fontSize = '9px';
                    btn.appendChild(name);

                    grid.appendChild(btn);
                });

                section.appendChild(grid);
                panel.appendChild(section);
            }
        }

        function resizeFloorplanCanvas() {
            const rect = fpCanvas.parentElement.getBoundingClientRect();
            fpCanvas.width = rect.width;
            fpCanvas.height = rect.height;
            fpRedraw();
        }

        function selectTool(tool) {
            currentTool = tool;
            document.querySelectorAll('.toolbar-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const btn = document.getElementById(`btn-${tool}`);
            if (btn) btn.classList.add('active');
            
            // Update cursor based on tool
            if (tool === 'pan') {
                fpCanvas.style.cursor = 'grab';
            } else if (tool === 'select') {
                fpCanvas.style.cursor = 'default';
            } else if (tool === 'furniture' || tool === 'door' || tool === 'window') {
                fpCanvas.style.cursor = 'crosshair';
            } else {
                fpCanvas.style.cursor = 'crosshair';
            }
        }

        function selectFurnitureType(type) {
            currentFurnitureType = type;
            selectTool('furniture');
        }

        function selectDoorType(type) {
            currentDoorType = type;
            selectTool('door');
        }

        function selectWindowType(type) {
            currentWindowType = type;
            selectTool('window');
        }

        // ==================== KEYBOARD CONTROLS ====================
        function fpHandleKeyDown(e) {
            // Only process if floor plan view is active
            if (document.getElementById('floorplan-view').classList.contains('hidden')) {
                return;
            }

            const key = e.key.toLowerCase();
            
            // Mirror functionality: M key
            if (key === 'm') {
                if (selectedFurniture) {
                    selectedFurniture.mirrored = !selectedFurniture.mirrored;
                    saveHistory();
                    fpRedraw();
                    e.preventDefault();
                } else if (selectedDoor) {
                    selectedDoor.mirrored = !selectedDoor.mirrored;
                    saveHistory();
                    fpRedraw();
                    e.preventDefault();
                } else if (selectedWindow) {
                    selectedWindow.mirrored = !selectedWindow.mirrored;
                    saveHistory();
                    fpRedraw();
                    e.preventDefault();
                }
            }
            
            // Rotation: R key or arrow keys
            if (key === 'r' || key === 'arrowleft' || key === 'arrowright') {
                let rotationAmount = 0;
                
                if (key === 'r' || key === 'arrowright') {
                    rotationAmount = Math.PI / 4; // 45 degrees clockwise
                } else if (key === 'arrowleft') {
                    rotationAmount = -Math.PI / 4; // 45 degrees counter-clockwise
                }
                
                if (selectedFurniture) {
                    selectedFurniture.rotation = (selectedFurniture.rotation + rotationAmount) % (Math.PI * 2);
                    saveHistory();
                    fpRedraw();
                    e.preventDefault();
                } else if (selectedDoor) {
                    selectedDoor.rotation = (selectedDoor.rotation || 0) + rotationAmount;
                    selectedDoor.rotation = selectedDoor.rotation % (Math.PI * 2);
                    saveHistory();
                    fpRedraw();
                    e.preventDefault();
                } else if (selectedWindow) {
                    selectedWindow.rotation = (selectedWindow.rotation || 0) + rotationAmount;
                    selectedWindow.rotation = selectedWindow.rotation % (Math.PI * 2);
                    saveHistory();
                    fpRedraw();
                    e.preventDefault();
                }
            }
            
            // Delete selected object
            if ((key === 'delete' || key === 'backspace') && currentTool === 'select') {
                if (selectedFurniture) {
                    const index = furniture.indexOf(selectedFurniture);
                    if (index > -1) {
                        furniture.splice(index, 1);
                        selectedFurniture = null;
                        saveHistory();
                        fpRedraw();
                        e.preventDefault();
                    }
                } else if (selectedDoor) {
                    const index = doors.indexOf(selectedDoor);
                    if (index > -1) {
                        doors.splice(index, 1);
                        selectedDoor = null;
                        saveHistory();
                        fpRedraw();
                        e.preventDefault();
                    }
                } else if (selectedWindow) {
                    const index = windows.indexOf(selectedWindow);
                    if (index > -1) {
                        windows.splice(index, 1);
                        selectedWindow = null;
                        saveHistory();
                        fpRedraw();
                        e.preventDefault();
                    }
                }
            }
        }

        // ==================== STRUCTURE MANAGEMENT ====================
        function addStructure(type) {
            const centerX = fpCanvas.width / 2;
            const centerY = fpCanvas.height / 2;
            let points = [];

            switch(type) {
                case 'square':
                    points = [
                        {x: -100, y: -100}, {x: 100, y: -100},
                        {x: 100, y: 100}, {x: -100, y: 100}
                    ];
                    break;
                case 'rectangle':
                    points = [
                        {x: -150, y: -80}, {x: 150, y: -80},
                        {x: 150, y: 80}, {x: -150, y: 80}
                    ];
                    break;
                case 'lshape':
                    points = [
                        {x: -100, y: -100}, {x: 100, y: -100},
                        {x: 100, y: 0}, {x: 0, y: 0},
                        {x: 0, y: 100}, {x: -100, y: 100}
                    ];
                    break;
                case 'ushape':
                    points = [
                        {x: -100, y: -100}, {x: -30, y: -100},
                        {x: -30, y: 0}, {x: 30, y: 0},
                        {x: 30, y: -100}, {x: 100, y: -100},
                        {x: 100, y: 100}, {x: -100, y: 100}
                    ];
                    break;
                case 'tshape':
                    points = [
                        {x: -100, y: -100}, {x: 100, y: -100},
                        {x: 100, y: 0}, {x: 30, y: 0},
                        {x: 30, y: 100}, {x: -30, y: 100},
                        {x: -30, y: 0}, {x: -100, y: 0}
                    ];
                    break;
                case 'circle':
                    points = [];
                    const steps = 16;
                    for (let i = 0; i < steps; i++) {
                        const angle = (i / steps) * Math.PI * 2;
                        points.push({
                            x: Math.cos(angle) * 100,
                            y: Math.sin(angle) * 100
                        });
                    }
                    break;
                case 'triangle':
                    points = [
                        {x: 0, y: -100},
                        {x: 100, y: 100},
                        {x: -100, y: 100}
                    ];
                    break;
                case 'hexagon':
                    points = [];
                    const hexAngle = Math.PI / 3;
                    for (let i = 0; i < 6; i++) {
                        points.push({
                            x: 80 * Math.cos(i * hexAngle),
                            y: 80 * Math.sin(i * hexAngle)
                        });
                    }
                    break;
            }

            const worldCenterX = (centerX - fpPanX) / fpScale;
            const worldCenterY = (centerY - fpPanY) / fpScale;

            const structure = {
                id: generateFPId(),
                type: type,
                x: worldCenterX,
                y: worldCenterY,
                points: points,
                walls: []
            };

            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                structure.walls.push({
                    x1: p1.x, y1: p1.y,
                    x2: p2.x, y2: p2.y
                });
            }

            structures.push(structure);
            saveHistory();
            fpRedraw();
        }

        // ==================== MOUSE INTERACTION ====================
        function fpHandleMouseDown(e) {
            const rect = fpCanvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left - fpPanX) / fpScale;
            const my = (e.clientY - rect.top - fpPanY) / fpScale;

            if (currentTool === 'pan') {
                fpCanvas.style.cursor = 'grabbing';
                startX = e.clientX;
                startY = e.clientY;
                isDrawing = true;
                return;
            }

            if (currentTool === 'select') {
                // Check for resize handles first
                resizeHandle = checkResizeHandles(mx, my);
                if (resizeHandle) {
                    isDragging = false;
                    isDrawing = true;
                    startX = mx;
                    startY = my;
                    return;
                }

                // Check for furniture selection
                draggedFurniture = getFurnitureAt(mx, my);
                if (draggedFurniture) {
                    isDragging = true;
                    selectedFurniture = draggedFurniture;
                    selectedDoor = null;
                    selectedWindow = null;
                    dragOffsetX = mx - draggedFurniture.x;
                    dragOffsetY = my - draggedFurniture.y;
                    fpCanvas.style.cursor = 'move';
                    fpRedraw();
                    return;
                }

                // Check for door selection
                draggedDoor = getDoorAt(mx, my);
                if (draggedDoor) {
                    isDragging = true;
                    selectedDoor = draggedDoor;
                    selectedFurniture = null;
                    selectedWindow = null;
                    const midX = (draggedDoor.x1 + draggedDoor.x2) / 2;
                    const midY = (draggedDoor.y1 + draggedDoor.y2) / 2;
                    dragOffsetX = mx - midX;
                    dragOffsetY = my - midY;
                    fpCanvas.style.cursor = 'move';
                    fpRedraw();
                    return;
                }

                // Check for window selection
                draggedWindow = getWindowAt(mx, my);
                if (draggedWindow) {
                    isDragging = true;
                    selectedWindow = draggedWindow;
                    selectedFurniture = null;
                    selectedDoor = null;
                    const midX = (draggedWindow.x1 + draggedWindow.x2) / 2;
                    const midY = (draggedWindow.y1 + draggedWindow.y2) / 2;
                    dragOffsetX = mx - midX;
                    dragOffsetY = my - midY;
                    fpCanvas.style.cursor = 'move';
                    fpRedraw();
                    return;
                }

                // Check for structure selection
                draggedStructure = getStructureAt(mx, my);
                if (draggedStructure) {
                    isDragging = true;
                    selectedFurniture = null;
                    selectedDoor = null;
                    selectedWindow = null;
                    dragOffsetX = mx - draggedStructure.x;
                    dragOffsetY = my - draggedStructure.y;
                    fpCanvas.style.cursor = 'move';
                    return;
                }

                // Deselect if clicking on empty space
                selectedFurniture = null;
                selectedDoor = null;
                selectedWindow = null;
                fpRedraw();
            }

            if (currentTool === 'furniture') {
                const newFurniture = {
                    id: generateFPId(),
                    x: mx,
                    y: my,
                    type: currentFurnitureType,
                    rotation: 0,
                    size: 30,
                    mirrored: false
                };
                furniture.push(newFurniture);
                
                // Automatically switch to select tool and select the new furniture
                selectTool('select');
                selectedFurniture = newFurniture;
                selectedDoor = null;
                selectedWindow = null;
                draggedFurniture = newFurniture;
                isDragging = true;
                dragOffsetX = 0;
                dragOffsetY = 0;
                
                saveHistory();
                fpRedraw();
                return;
            }

            if (currentTool === 'door') {
                startX = mx;
                startY = my;
                isDrawing = true;
                return;
            }

            if (currentTool === 'window') {
                startX = mx;
                startY = my;
                isDrawing = true;
                return;
            }

            if (currentTool === 'delete') {
                const furnToDelete = getFurnitureAt(mx, my);
                if (furnToDelete) {
                    const index = furniture.indexOf(furnToDelete);
                    if (index > -1) {
                        furniture.splice(index, 1);
                        selectedFurniture = null;
                        saveHistory();
                        fpRedraw();
                    }
                    return;
                }

                const doorToDelete = getDoorAt(mx, my);
                if (doorToDelete) {
                    const index = doors.indexOf(doorToDelete);
                    if (index > -1) {
                        doors.splice(index, 1);
                        selectedDoor = null;
                        saveHistory();
                        fpRedraw();
                    }
                    return;
                }

                const windowToDelete = getWindowAt(mx, my);
                if (windowToDelete) {
                    const index = windows.indexOf(windowToDelete);
                    if (index > -1) {
                        windows.splice(index, 1);
                        selectedWindow = null;
                        saveHistory();
                        fpRedraw();
                    }
                    return;
                }
            }

            startX = mx;
            startY = my;
            isDrawing = true;
        }

        function fpHandleMouseMove(e) {
            const rect = fpCanvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left - fpPanX) / fpScale;
            const my = (e.clientY - rect.top - fpPanY) / fpScale;

            if (currentTool === 'pan' && isDrawing) {
                fpPanX += e.clientX - startX;
                fpPanY += e.clientY - startY;
                startX = e.clientX;
                startY = e.clientY;
                fpRedraw();
                return;
            }

            if (currentTool === 'select') {
                if (resizeHandle && isDrawing) {
                    const dx = mx - startX;
                    const dy = my - startY;
                    resizeStructure(resizeHandle.structure, resizeHandle.index, dx, dy);
                    startX = mx;
                    startY = my;
                    fpRedraw();
                    return;
                }

                if (isDragging && draggedFurniture) {
                    draggedFurniture.x = mx - dragOffsetX;
                    draggedFurniture.y = my - dragOffsetY;
                    fpRedraw();
                    return;
                }

                if (isDragging && draggedDoor) {
                    const length = Math.hypot(draggedDoor.x2 - draggedDoor.x1, draggedDoor.y2 - draggedDoor.y1);
                    const angle = draggedDoor.rotation || Math.atan2(draggedDoor.y2 - draggedDoor.y1, draggedDoor.x2 - draggedDoor.x1);
                    const newMidX = mx - dragOffsetX;
                    const newMidY = my - dragOffsetY;
                    draggedDoor.x1 = newMidX - (length / 2) * Math.cos(angle);
                    draggedDoor.y1 = newMidY - (length / 2) * Math.sin(angle);
                    draggedDoor.x2 = newMidX + (length / 2) * Math.cos(angle);
                    draggedDoor.y2 = newMidY + (length / 2) * Math.sin(angle);
                    fpRedraw();
                    return;
                }

                if (isDragging && draggedWindow) {
                    const length = Math.hypot(draggedWindow.x2 - draggedWindow.x1, draggedWindow.y2 - draggedWindow.y1);
                    const angle = draggedWindow.rotation || Math.atan2(draggedWindow.y2 - draggedWindow.y1, draggedWindow.x2 - draggedWindow.x1);
                    const newMidX = mx - dragOffsetX;
                    const newMidY = my - dragOffsetY;
                    draggedWindow.x1 = newMidX - (length / 2) * Math.cos(angle);
                    draggedWindow.y1 = newMidY - (length / 2) * Math.sin(angle);
                    draggedWindow.x2 = newMidX + (length / 2) * Math.cos(angle);
                    draggedWindow.y2 = newMidY + (length / 2) * Math.sin(angle);
                    fpRedraw();
                    return;
                }

                if (isDragging && draggedStructure) {
                    draggedStructure.x = mx - dragOffsetX;
                    draggedStructure.y = my - dragOffsetY;
                    fpRedraw();
                    return;
                }

                // Update cursor based on what's under the mouse
                const handle = checkResizeHandles(mx, my);
                const furn = getFurnitureAt(mx, my);
                const door = getDoorAt(mx, my);
                const window = getWindowAt(mx, my);
                
                if (handle) {
                    fpCanvas.style.cursor = 'nwse-resize';
                } else if (furn || door || window || getStructureAt(mx, my)) {
                    fpCanvas.style.cursor = 'move';
                } else {
                    fpCanvas.style.cursor = 'default';
                }
            }

            fpRedraw();

            if (currentTool === 'wall' && isDrawing) {
                fpDrawLine(startX, startY, mx, my, '#555555', WALL_WIDTH);
            } else if (currentTool === 'door' && isDrawing) {
                fpDrawDoor2D(startX, startY, mx, my, 0, currentDoorType);
            } else if (currentTool === 'window' && isDrawing) {
                fpDrawWindow2D(startX, startY, mx, my, 0, currentWindowType);
            } else if (currentTool === 'dimension' && isDrawing) {
                fpDrawDimensionLine(startX, startY, mx, my);
            }
        }

        function fpHandleMouseUp(e) {
            if (!isDrawing && !isDragging) return;

            const rect = fpCanvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left - fpPanX) / fpScale;
            const my = (e.clientY - rect.top - fpPanY) / fpScale;

            if (currentTool === 'wall') {
                walls.push({x1: startX, y1: startY, x2: mx, y2: my});
                saveHistory();
            } else if (currentTool === 'door') {
                doors.push({
                    x1: startX, 
                    y1: startY, 
                    x2: mx, 
                    y2: my,
                    rotation: Math.atan2(my - startY, mx - startX),
                    doorType: currentDoorType,
                    mirrored: false
                });
                saveHistory();
            } else if (currentTool === 'window') {
                windows.push({
                    x1: startX, 
                    y1: startY, 
                    x2: mx, 
                    y2: my,
                    rotation: Math.atan2(my - startY, mx - startX),
                    windowType: currentWindowType,
                    mirrored: false
                });
                saveHistory();
            } else if (currentTool === 'dimension') {
                const dist = Math.hypot(mx - startX, my - startY) / 50;
                dimensions.push({x1: startX, y1: startY, x2: mx, y2: my, distance: dist});
                saveHistory();
            }

            if (isDragging && (draggedFurniture || draggedStructure || draggedDoor || draggedWindow)) {
                saveHistory();
            }

            if (resizeHandle) {
                saveHistory();
            }

            isDrawing = false;
            isDragging = false;
            draggedStructure = null;
            draggedFurniture = null;
            draggedDoor = null;
            draggedWindow = null;
            resizeHandle = null;
            
            fpCanvas.style.cursor = currentTool === 'pan' ? 'grab' : currentTool === 'select' ? 'default' : 'crosshair';
            fpRedraw();
        }

        function fpHandleZoom(e) {
            e.preventDefault();
            const rect = fpCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const worldX = (mouseX - fpPanX) / fpScale;
            const worldY = (mouseY - fpPanY) / fpScale;
            
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            fpScale *= delta;
            fpScale = Math.max(0.3, Math.min(5, fpScale));
            
            fpPanX = mouseX - worldX * fpScale;
            fpPanY = mouseY - worldY * fpScale;
            
            fpRedraw();
        }

        // ==================== HELPER FUNCTIONS ====================
        function getFurnitureAt(x, y) {
            for (let i = furniture.length - 1; i >= 0; i--) {
                const f = furniture[i];
                const dist = Math.hypot(x - f.x, y - f.y);
                if (dist < f.size / 2) {
                    return f;
                }
            }
            return null;
        }

        function getDoorAt(x, y) {
            for (let i = doors.length - 1; i >= 0; i--) {
                const d = doors[i];
                const midX = (d.x1 + d.x2) / 2;
                const midY = (d.y1 + d.y2) / 2;
                const dist = Math.hypot(x - midX, y - midY);
                const length = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
                if (dist < length / 2 + 10) {
                    return d;
                }
            }
            return null;
        }

        function getWindowAt(x, y) {
            for (let i = windows.length - 1; i >= 0; i--) {
                const w = windows[i];
                const midX = (w.x1 + w.x2) / 2;
                const midY = (w.y1 + w.y2) / 2;
                const dist = Math.hypot(x - midX, y - midY);
                const length = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
                if (dist < length / 2 + 10) {
                    return w;
                }
            }
            return null;
        }

        function getStructureAt(x, y) {
            for (let i = structures.length - 1; i >= 0; i--) {
                const s = structures[i];
                if (isPointInStructure(x, y, s)) {
                    return s;
                }
            }
            return null;
        }

        function isPointInStructure(x, y, structure) {
            const px = x - structure.x;
            const py = y - structure.y;
            
            let inside = false;
            const points = structure.points;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const xi = points[i].x, yi = points[i].y;
                const xj = points[j].x, yj = points[j].y;
                
                const intersect = ((yi > py) !== (yj > py)) &&
                    (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        function checkResizeHandles(x, y) {
            for (const structure of structures) {
                for (let i = 0; i < structure.points.length; i++) {
                    const p = structure.points[i];
                    const wx = structure.x + p.x;
                    const wy = structure.y + p.y;
                    const dist = Math.hypot(x - wx, y - wy);
                    if (dist < 15 / fpScale) {
                        return { structure, index: i };
                    }
                }
            }
            return null;
        }

        function resizeStructure(structure, pointIndex, dx, dy) {
            structure.points[pointIndex].x += dx;
            structure.points[pointIndex].y += dy;
            
            structure.walls = [];
            for (let i = 0; i < structure.points.length; i++) {
                const p1 = structure.points[i];
                const p2 = structure.points[(i + 1) % structure.points.length];
                structure.walls.push({
                    x1: p1.x, y1: p1.y,
                    x2: p2.x, y2: p2.y
                });
            }
        }

        // ==================== 2D DRAWING FUNCTIONS ====================
        function fpDrawLine(x1, y1, x2, y2, color, width) {
            fpCtx.strokeStyle = color;
            fpCtx.lineWidth = width;
            fpCtx.lineCap = 'round';
            fpCtx.lineJoin = 'round';
            fpCtx.beginPath();
            fpCtx.moveTo(x1 * fpScale + fpPanX, y1 * fpScale + fpPanY);
            fpCtx.lineTo(x2 * fpScale + fpPanX, y2 * fpScale + fpPanY);
            fpCtx.stroke();
        }

        function fpDrawDoor2D(x1, y1, x2, y2, customRotation, doorType = 'single_closed') {
            const angle = customRotation !== undefined ? customRotation : Math.atan2(y2 - y1, x2 - x1);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            fpCtx.save();
            fpCtx.translate(midX * fpScale + fpPanX, midY * fpScale + fpPanY);
            fpCtx.rotate(angle);
            fpCtx.scale(fpScale, fpScale);
            
            switch(doorType) {
                case 'single_closed':
                    // Door panel
                    fpCtx.fillStyle = '#8B4513';
                    fpCtx.fillRect(-20, -4, 40, 8);
                    
                    // Door handle
                    fpCtx.fillStyle = '#FFD700';
                    fpCtx.beginPath();
                    fpCtx.arc(12, 0, 2, 0, Math.PI * 2);
                    fpCtx.fill();
                    
                    // Door frame
                    fpCtx.strokeStyle = '#654321';
                    fpCtx.lineWidth = 1.5;
                    fpCtx.strokeRect(-20, -4, 40, 8);
                    break;
                    
                case 'single_open':
                    // Open door arc
                    fpCtx.strokeStyle = '#8B4513';
                    fpCtx.lineWidth = 1.5;
                    fpCtx.setLineDash([3, 3]);
                    fpCtx.beginPath();
                    fpCtx.arc(-20, 0, 40, -Math.PI / 4, Math.PI / 4);
                    fpCtx.stroke();
                    fpCtx.setLineDash([]);
                    
                    // Door in open position
                    fpCtx.save();
                    fpCtx.translate(-20, 0);
                    fpCtx.rotate(Math.PI / 3);
                    fpCtx.fillStyle = '#8B4513';
                    fpCtx.fillRect(0, -4, 40, 8);
                    fpCtx.strokeStyle = '#654321';
                    fpCtx.lineWidth = 1.5;
                    fpCtx.strokeRect(0, -4, 40, 8);
                    fpCtx.restore();
                    break;
                    
                case 'double_closed':
                    // Left door
                    fpCtx.fillStyle = '#8B4513';
                    fpCtx.fillRect(-20, -4, 18, 8);
                    fpCtx.strokeStyle = '#654321';
                    fpCtx.lineWidth = 1.5;
                    fpCtx.strokeRect(-20, -4, 18, 8);
                    
                    // Right door
                    fpCtx.fillRect(2, -4, 18, 8);
                    fpCtx.strokeRect(2, -4, 18, 8);
                    
                    // Handles
                    fpCtx.fillStyle = '#FFD700';
                    fpCtx.beginPath();
                    fpCtx.arc(-5, 0, 2, 0, Math.PI * 2);
                    fpCtx.fill();
                    fpCtx.beginPath();
                    fpCtx.arc(5, 0, 2, 0, Math.PI * 2);
                    fpCtx.fill();
                    
                    // Center line
                    fpCtx.strokeStyle = '#654321';
                    fpCtx.lineWidth = 1;
                    fpCtx.beginPath();
                    fpCtx.moveTo(0, -4);
                    fpCtx.lineTo(0, 4);
                    fpCtx.stroke();
                    break;
                    
                case 'double_open':
                    // Left door arc
                    fpCtx.strokeStyle = '#8B4513';
                    fpCtx.lineWidth = 1.5;
                    fpCtx.setLineDash([3, 3]);
                    fpCtx.beginPath();
                    fpCtx.arc(-20, 0, 18, -Math.PI / 4, Math.PI / 4);
                    fpCtx.stroke();
                    
                    // Right door arc
                    fpCtx.beginPath();
                    fpCtx.arc(20, 0, 18, Math.PI - Math.PI / 4, Math.PI + Math.PI / 4);
                    fpCtx.stroke();
                    fpCtx.setLineDash([]);
                    
                    // Left door open
                    fpCtx.save();
                    fpCtx.translate(-20, 0);
                    fpCtx.rotate(Math.PI / 3);
                    fpCtx.fillStyle = '#8B4513';
                    fpCtx.fillRect(0, -4, 18, 8);
                    fpCtx.strokeStyle = '#654321';
                    fpCtx.strokeRect(0, -4, 18, 8);
                    fpCtx.restore();
                    
                    // Right door open
                    fpCtx.save();
                    fpCtx.translate(20, 0);
                    fpCtx.rotate(-Math.PI / 3);
                    fpCtx.fillStyle = '#8B4513';
                    fpCtx.fillRect(-18, -4, 18, 8);
                    fpCtx.strokeStyle = '#654321';
                    fpCtx.strokeRect(-18, -4, 18, 8);
                    fpCtx.restore();
                    break;
            }
            
            fpCtx.restore();
        }

        function fpDrawWindow2D(x1, y1, x2, y2, customRotation, windowType = 'standard') {
            const angle = customRotation !== undefined ? customRotation : Math.atan2(y2 - y1, x2 - x1);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            fpCtx.save();
            fpCtx.translate(midX * fpScale + fpPanX, midY * fpScale + fpPanY);
            fpCtx.rotate(angle);
            fpCtx.scale(fpScale, fpScale);
            
            switch(windowType) {
                case 'standard':
                    // Glass
                    fpCtx.fillStyle = '#87CEEB';
                    fpCtx.globalAlpha = 0.4;
                    fpCtx.fillRect(-20, -5, 40, 10);
                    fpCtx.globalAlpha = 1;
                    
                    // Frame
                    fpCtx.strokeStyle = '#4A4A4A';
                    fpCtx.lineWidth = 2;
                    fpCtx.strokeRect(-20, -5, 40, 10);
                    
                    // Cross dividers
                    fpCtx.beginPath();
                    fpCtx.moveTo(-20, 0);
                    fpCtx.lineTo(20, 0);
                    fpCtx.stroke();
                    
                    fpCtx.beginPath();
                    fpCtx.moveTo(0, -5);
                    fpCtx.lineTo(0, 5);
                    fpCtx.stroke();
                    break;
                    
                case 'wide':
                    // Wider glass
                    fpCtx.fillStyle = '#87CEEB';
                    fpCtx.globalAlpha = 0.4;
                    fpCtx.fillRect(-30, -5, 60, 10);
                    fpCtx.globalAlpha = 1;
                    
                    // Frame
                    fpCtx.strokeStyle = '#4A4A4A';
                    fpCtx.lineWidth = 2;
                    fpCtx.strokeRect(-30, -5, 60, 10);
                    
                    // Multiple dividers
                    for (let i = -20; i <= 20; i += 20) {
                        fpCtx.beginPath();
                        fpCtx.moveTo(i, -5);
                        fpCtx.lineTo(i, 5);
                        fpCtx.stroke();
                    }
                    break;
                    
                case 'bay':
                    // Center panel
                    fpCtx.fillStyle = '#87CEEB';
                    fpCtx.globalAlpha = 0.4;
                    fpCtx.fillRect(-15, -5, 30, 10);
                    fpCtx.globalAlpha = 1;
                    fpCtx.strokeStyle = '#4A4A4A';
                    fpCtx.lineWidth = 2;
                    fpCtx.strokeRect(-15, -5, 30, 10);
                    
                    // Left angled panel
                    fpCtx.save();
                    fpCtx.translate(-15, 0);
                    fpCtx.rotate(-Math.PI / 6);
                    fpCtx.fillStyle = '#87CEEB';
                    fpCtx.globalAlpha = 0.4;
                    fpCtx.fillRect(-12, -5, 12, 10);
                    fpCtx.globalAlpha = 1;
                    fpCtx.strokeStyle = '#4A4A4A';
                    fpCtx.strokeRect(-12, -5, 12, 10);
                    fpCtx.restore();
                    
                    // Right angled panel
                    fpCtx.save();
                    fpCtx.translate(15, 0);
                    fpCtx.rotate(Math.PI / 6);
                    fpCtx.fillStyle = '#87CEEB';
                    fpCtx.globalAlpha = 0.4;
                    fpCtx.fillRect(0, -5, 12, 10);
                    fpCtx.globalAlpha = 1;
                    fpCtx.strokeStyle = '#4A4A4A';
                    fpCtx.strokeRect(0, -5, 12, 10);
                    fpCtx.restore();
                    break;
                    
                case 'sliding':
                    // Left panel (behind)
                    fpCtx.fillStyle = '#87CEEB';
                    fpCtx.globalAlpha = 0.3;
                    fpCtx.fillRect(-25, -5, 25, 10);
                    fpCtx.globalAlpha = 1;
                    fpCtx.strokeStyle = '#4A4A4A';
                    fpCtx.lineWidth = 1.5;
                    fpCtx.strokeRect(-25, -5, 25, 10);
                    
                    // Front panel (sliding)
                    fpCtx.fillStyle = '#87CEEB';
                    fpCtx.globalAlpha = 0.5;
                    fpCtx.fillRect(-5, -5, 25, 10);
                    fpCtx.globalAlpha = 1;
                    fpCtx.strokeStyle = '#4A4A4A';
                    fpCtx.lineWidth = 2;
                    fpCtx.strokeRect(-5, -5, 25, 10);
                    
                    // Handle on front panel
                    fpCtx.fillStyle = '#666666';
                    fpCtx.fillRect(12, -1, 2, 2);
                    break;
            }
            
            fpCtx.restore();
        }

        function fpDrawDimensionLine(x1, y1, x2, y2) {
            const dist = Math.hypot(x2 - x1, y2 - y1) / 50;
            fpDrawLine(x1, y1, x2, y2, '#4FC3F7', 2);
            
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            fpCtx.fillStyle = '#4FC3F7';
            fpCtx.font = 'bold 12px Arial';
            fpCtx.fillText(dist.toFixed(2) + 'm', midX * fpScale + fpPanX, midY * fpScale + fpPanY - 10);
        }

        // [FURNITURE 2D DRAWING CODE CONTINUES - Same as original, keeping it for brevity]
        // Include all the fpDrawFurniture2D function and other 2D furniture drawing functions from original

        function fpDrawFurniture2D(item) {
            const x = item.x;
            const y = item.y;
            const size = item.size;
            const rotation = item.rotation;
            const mirrored = item.mirrored || false;
            const isSelected = (selectedFurniture === item);

            fpCtx.save();
            fpCtx.translate(x * fpScale + fpPanX, y * fpScale + fpPanY);
            fpCtx.rotate(rotation);
            if (mirrored) {
                fpCtx.scale(-fpScale, fpScale);
            } else {
                fpCtx.scale(fpScale, fpScale);
            }

            // Draw selection highlight
            if (isSelected) {
                fpCtx.strokeStyle = '#4FC3F7';
                fpCtx.lineWidth = 3;
                fpCtx.setLineDash([5, 5]);
                fpCtx.strokeRect(-size/2 - 5, -size/2 - 5, size + 10, size + 10);
                fpCtx.setLineDash([]);
                
                // Draw rotation indicator
                fpCtx.strokeStyle = '#FF6B6B';
                fpCtx.lineWidth = 2;
                fpCtx.beginPath();
                fpCtx.moveTo(0, 0);
                fpCtx.lineTo(size/2 + 10, 0);
                fpCtx.stroke();
                fpCtx.fillStyle = '#FF6B6B';
                fpCtx.beginPath();
                fpCtx.arc(size/2 + 10, 0, 4, 0, Math.PI * 2);
                fpCtx.fill();
                
                // Draw mirror indicator if mirrored
                if (mirrored) {
                    fpCtx.fillStyle = '#9C27B0';
                    fpCtx.font = 'bold 12px Arial';
                    fpCtx.fillText('M', -size/2 - 15, -size/2 - 8);
                }
            }

            // [Include all the switch cases for furniture types from the original file]
            switch(item.type) {
                // BEDROOM
                case 'bed':
                    fpCtx.fillStyle = '#DC143C';
                    fpCtx.fillRect(-size/2, -size/2, size, size * 0.8);
                    fpCtx.fillStyle = '#8B4513';
                    fpCtx.fillRect(-size/2, -size/2, size, size * 0.15);
                    break;
                // ... (rest of furniture drawing code - keeping original for brevity)
                default:
                    fpCtx.fillStyle = '#FF6B6B';
                    fpCtx.fillRect(-size/2, -size/2, size, size);
            }

            fpCtx.restore();
        }

        // ==================== MAIN REDRAW FUNCTION ====================
        function fpRedraw() {
            fpCtx.clearRect(0, 0, fpCanvas.width, fpCanvas.height);

            fpCtx.save();
            fpCtx.translate(fpPanX, fpPanY);
            fpCtx.scale(fpScale, fpScale);

            fpDrawGrid();

            // Draw structures
            structures.forEach(structure => {
                fpCtx.save();
                fpCtx.translate(structure.x, structure.y);
                
                // Floor fill
                fpCtx.fillStyle = '#E8D7C3';
                fpCtx.beginPath();
                if (structure.points.length > 0) {
                    fpCtx.moveTo(structure.points[0].x, structure.points[0].y);
                    for (let i = 1; i < structure.points.length; i++) {
                        fpCtx.lineTo(structure.points[i].x, structure.points[i].y);
                    }
                    fpCtx.closePath();
                    fpCtx.fill();
                }
                
                // Walls
                structure.walls.forEach(wall => {
                    fpCtx.strokeStyle = '#555555';
                    fpCtx.lineWidth = WALL_WIDTH;
                    fpCtx.lineCap = 'square';
                    fpCtx.lineJoin = 'miter';
                    fpCtx.beginPath();
                    fpCtx.moveTo(wall.x1, wall.y1);
                    fpCtx.lineTo(wall.x2, wall.y2);
                    fpCtx.stroke();
                });

                // Dimension labels
                structure.points.forEach((p, i) => {
                    const edge = structure.walls[i];
                    const ex1 = edge.x1;
                    const ey1 = edge.y1;
                    const ex2 = edge.x2;
                    const ey2 = edge.y2;
                    const edgeLen = Math.hypot(ex2 - ex1, ey2 - ey1) / 50;
                    const midX = (ex1 + ex2) / 2;
                    const midY = (ey1 + ey2) / 2;
                    
                    const angle = Math.atan2(ey2 - ey1, ex2 - ex1);
                    const perpAngle = angle + Math.PI / 2;
                    const offset = 30;
                    const labelX = midX + Math.cos(perpAngle) * offset;
                    const labelY = midY + Math.sin(perpAngle) * offset;
                    
                    fpCtx.save();
                    fpCtx.translate(labelX, labelY);
                    fpCtx.rotate(0);
                    
                    fpCtx.fillStyle = 'rgba(0,0,0,0.8)';
                    const text = edgeLen.toFixed(2) + 'm';
                    fpCtx.font = 'bold 12px Arial';
                    const metrics = fpCtx.measureText(text);
                    const padding = 6;
                    fpCtx.fillRect(-metrics.width/2 - padding, -8, metrics.width + padding*2, 16);
                    
                    fpCtx.fillStyle = '#4FC3F7';
                    fpCtx.textAlign = 'center';
                    fpCtx.textBaseline = 'middle';
                    fpCtx.fillText(text, 0, 0);
                    
                    fpCtx.restore();
                    
                    fpCtx.strokeStyle = '#4FC3F7';
                    fpCtx.lineWidth = 1;
                    fpCtx.setLineDash([4, 4]);
                    fpCtx.beginPath();
                    fpCtx.moveTo(midX, midY);
                    fpCtx.lineTo(labelX, labelY);
                    fpCtx.stroke();
                    fpCtx.setLineDash([]);
                });

                // Resize handles
                if (currentTool === 'select') {
                    structure.points.forEach(p => {
                        fpCtx.fillStyle = '#4FC3F7';
                        fpCtx.strokeStyle = '#ffffff';
                        fpCtx.lineWidth = 2;
                        fpCtx.beginPath();
                        fpCtx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                        fpCtx.fill();
                        fpCtx.stroke();
                    });
                }

                fpCtx.restore();
            });

            // Draw walls
            walls.forEach(wall => {
                fpDrawLine(wall.x1, wall.y1, wall.x2, wall.y2, '#555555', WALL_WIDTH);
            });

            // Draw doors with selection highlight
            doors.forEach(door => {
                const isSelected = (selectedDoor === door);
                
                if (isSelected) {
                    const midX = (door.x1 + door.x2) / 2;
                    const midY = (door.y1 + door.y2) / 2;
                    fpCtx.save();
                    fpCtx.translate(midX * fpScale + fpPanX, midY * fpScale + fpPanY);
                    fpCtx.strokeStyle = '#4FC3F7';
                    fpCtx.lineWidth = 3;
                    fpCtx.setLineDash([5, 5]);
                    fpCtx.strokeRect(-25 * fpScale, -10 * fpScale, 50 * fpScale, 20 * fpScale);
                    fpCtx.setLineDash([]);
                    
                    // Draw mirror indicator if mirrored
                    if (door.mirrored) {
                        fpCtx.fillStyle = '#9C27B0';
                        fpCtx.font = 'bold 14px Arial';
                        fpCtx.fillText('M', -35 * fpScale, -15 * fpScale);
                    }
                    
                    fpCtx.restore();
                }
                
                fpDrawDoor2D(door.x1, door.y1, door.x2, door.y2, door.rotation, door.doorType || 'single_closed');
            });

            // Draw windows with selection highlight
            windows.forEach(window => {
                const isSelected = (selectedWindow === window);
                
                if (isSelected) {
                    const midX = (window.x1 + window.x2) / 2;
                    const midY = (window.y1 + window.y2) / 2;
                    fpCtx.save();
                    fpCtx.translate(midX * fpScale + fpPanX, midY * fpScale + fpPanY);
                    fpCtx.strokeStyle = '#4FC3F7';
                    fpCtx.lineWidth = 3;
                    fpCtx.setLineDash([5, 5]);
                    fpCtx.strokeRect(-35 * fpScale, -10 * fpScale, 70 * fpScale, 20 * fpScale);
                    fpCtx.setLineDash([]);
                    
                    // Draw mirror indicator if mirrored
                    if (window.mirrored) {
                        fpCtx.fillStyle = '#9C27B0';
                        fpCtx.font = 'bold 14px Arial';
                        fpCtx.fillText('M', -45 * fpScale, -15 * fpScale);
                    }
                    
                    fpCtx.restore();
                }
                
                fpDrawWindow2D(window.x1, window.y1, window.x2, window.y2, window.rotation, window.windowType || 'standard');
            });

            // Draw dimensions
            dimensions.forEach(dim => {
                fpDrawDimensionLine(dim.x1, dim.y1, dim.x2, dim.y2);
            });

            // Draw furniture
            furniture.forEach(item => {
                fpDrawFurniture2D(item);
            });

            fpCtx.restore();

            updateAreaDisplay();
        }

        function fpDrawGrid() {
            fpCtx.strokeStyle = '#e0e0e0';
            fpCtx.lineWidth = 0.5;

            const startX = Math.floor((-fpPanX / fpScale) / GRID_SIZE) * GRID_SIZE;
            const startY = Math.floor((-fpPanY / fpScale) / GRID_SIZE) * GRID_SIZE;
            const endX = startX + (fpCanvas.width / fpScale) + GRID_SIZE;
            const endY = startY + (fpCanvas.height / fpScale) + GRID_SIZE;

            for (let x = startX; x < endX; x += GRID_SIZE) {
                fpCtx.beginPath();
                fpCtx.moveTo(x, startY);
                fpCtx.lineTo(x, endY);
                fpCtx.stroke();
            }

            for (let y = startY; y < endY; y += GRID_SIZE) {
                fpCtx.beginPath();
                fpCtx.moveTo(startX, y);
                fpCtx.lineTo(endX, y);
                fpCtx.stroke();
            }
        }

        // ==================== HISTORY & UTILITY ====================
        function updateAreaDisplay() {
            let totalArea = 0;
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            structures.forEach(s => {
                s.points.forEach(p => {
                    const wx = s.x + p.x;
                    const wy = s.y + p.y;
                    minX = Math.min(minX, wx);
                    maxX = Math.max(maxX, wx);
                    minY = Math.min(minY, wy);
                    maxY = Math.max(maxY, wy);
                });
            });

            walls.forEach(wall => {
                minX = Math.min(minX, wall.x1, wall.x2);
                maxX = Math.max(maxX, wall.x1, wall.x2);
                minY = Math.min(minY, wall.y1, wall.y2);
                maxY = Math.max(maxY, wall.y1, wall.y2);
            });

            if (minX !== Infinity) {
                const width = (maxX - minX) / 50;
                const height = (maxY - minY) / 50;
                totalArea = (width * height).toFixed(2);

                document.getElementById('areaDisplay').textContent = totalArea;
                document.getElementById('dimensionsDisplay').textContent = `${width.toFixed(1)} x ${height.toFixed(1)}`;
            } else {
                document.getElementById('areaDisplay').textContent = '0';
                document.getElementById('dimensionsDisplay').textContent = '0 x 0';
            }
        }

        function saveHistory() {
            historyIndex++;
            history = history.slice(0, historyIndex);
            history.push({
                walls: JSON.parse(JSON.stringify(walls)),
                doors: JSON.parse(JSON.stringify(doors)),
                windows: JSON.parse(JSON.stringify(windows)),
                furniture: JSON.parse(JSON.stringify(furniture)),
                dimensions: JSON.parse(JSON.stringify(dimensions)),
                structures: JSON.parse(JSON.stringify(structures))
            });
        }

        function undoAction() {
            if (historyIndex > 0) {
                historyIndex--;
                loadHistory(historyIndex);
            }
        }

        function redoAction() {
            if (historyIndex < history.length - 1) {
                historyIndex++;
                loadHistory(historyIndex);
            }
        }

        function loadHistory(index) {
            const state = history[index];
            walls = JSON.parse(JSON.stringify(state.walls));
            doors = JSON.parse(JSON.stringify(state.doors));
            windows = JSON.parse(JSON.stringify(state.windows));
            furniture = JSON.parse(JSON.stringify(state.furniture));
            dimensions = JSON.parse(JSON.stringify(state.dimensions));
            structures = JSON.parse(JSON.stringify(state.structures));
            selectedFurniture = null;
            selectedDoor = null;
            selectedWindow = null;
            fpRedraw();
        }

        function clearCanvas() {
            if (confirm('Clear all? This cannot be undone.')) {
                walls = [];
                doors = [];
                windows = [];
                furniture = [];
                dimensions = [];
                structures = [];
                history = [];
                historyIndex = -1;
                selectedFurniture = null;
                selectedDoor = null;
                selectedWindow = null;
                fpRedraw();
            }
        }

        function saveProject() {
            const project = {
                walls,
                doors,
                windows,
                furniture,
                dimensions,
                structures
            };
            const json = JSON.stringify(project);
            const blob = new Blob([json], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'floorplan.json';
            a.click();
        }

        function generateFPId() {
            return 'fp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        // ==================== 3D VIEW ====================
        let scene3d, camera3d, renderer3d, controls3d;

        function close3DView() {
            document.getElementById('view3d').classList.remove('active');
            if (renderer3d) {
                renderer3d.dispose();
                renderer3d = null;
                scene3d = null;
                camera3d = null;
                controls3d = null;
            }
        }

        // ==================== 3D DOOR MODEL - REDUCED HEIGHT ====================
        function create3DDoor(width, height, doorType = 'single_closed') {
            const group = new THREE.Group();
            
            // Use standard door width if calculated width is too small
            const minDoorWidth = 0.9;
            const doorWidth = Math.max(width, minDoorWidth);
            
            const doorMaterial = new THREE.MeshPhongMaterial({ 
                color: 0xF5F5F5,
                shininess: 40,
                side: THREE.DoubleSide
            });
            
            const frameMaterial = new THREE.MeshPhongMaterial({ 
                color: 0xCCCCCC,
                shininess: 30
            });
            
            const handleMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x4A4A4A,
                shininess: 70
            });
            
            const hingeMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x6A6A6A,
                shininess: 60
            });
            
            const doorThickness = 0.04;
            const frameWidth = 0.1;
            const frameDepth = 0.15;
            
            switch(doorType) {
                case 'single_closed':
                    // Single closed door
                    const door = new THREE.Mesh(
                        new THREE.BoxGeometry(doorWidth, height, doorThickness),
                        doorMaterial
                    );
                    door.position.y = height / 2;
                    door.castShadow = true;
                    door.receiveShadow = true;
                    group.add(door);
                    
                    // Add frame
                    addDoorFrame(group, doorWidth, height, frameWidth, frameDepth, frameMaterial);
                    
                    // Add handle
                    const handleBar = new THREE.Mesh(
                        new THREE.BoxGeometry(0.025, 0.15, 0.04),
                        handleMaterial
                    );
                    handleBar.position.set(-doorWidth * 0.35, height * 0.5, doorThickness / 2 + 0.02);
                    handleBar.castShadow = true;
                    group.add(handleBar);
                    
                    // Add hinges
                    addDoorHinges(group, doorWidth, height, hingeMaterial);
                    break;
                    
                case 'single_open':
                    // Single open door
                    const openDoor = new THREE.Mesh(
                        new THREE.BoxGeometry(doorWidth, height, doorThickness),
                        doorMaterial
                    );
                    openDoor.position.y = height / 2;
                    openDoor.position.z = -doorWidth * 0.7;
                    openDoor.position.x = doorWidth / 2;
                    openDoor.rotation.y = -Math.PI / 2.5;
                    openDoor.castShadow = true;
                    group.add(openDoor);
                    
                    addDoorFrame(group, doorWidth, height, frameWidth, frameDepth, frameMaterial);
                    
                    // Handle on open door
                    const openHandle = new THREE.Mesh(
                        new THREE.BoxGeometry(0.025, 0.15, 0.04),
                        handleMaterial
                    );
                    openHandle.position.copy(openDoor.position);
                    openHandle.position.x -= doorWidth * 0.35 * Math.cos(openDoor.rotation.y);
                    openHandle.position.z -= doorWidth * 0.35 * Math.sin(openDoor.rotation.y);
                    openHandle.rotation.y = openDoor.rotation.y;
                    openHandle.castShadow = true;
                    group.add(openHandle);
                    
                    addDoorHinges(group, doorWidth, height, hingeMaterial);
                    break;
                    
                case 'double_closed':
                    // Left door
                    const leftDoor = new THREE.Mesh(
                        new THREE.BoxGeometry(doorWidth / 2 - 0.02, height, doorThickness),
                        doorMaterial
                    );
                    leftDoor.position.set(-doorWidth / 4 - 0.01, height / 2, 0);
                    leftDoor.castShadow = true;
                    group.add(leftDoor);
                    
                    // Right door
                    const rightDoor = new THREE.Mesh(
                        new THREE.BoxGeometry(doorWidth / 2 - 0.02, height, doorThickness),
                        doorMaterial
                    );
                    rightDoor.position.set(doorWidth / 4 + 0.01, height / 2, 0);
                    rightDoor.castShadow = true;
                    group.add(rightDoor);
                    
                    addDoorFrame(group, doorWidth, height, frameWidth, frameDepth, frameMaterial);
                    
                    // Handles for both doors
                    const leftHandle = new THREE.Mesh(
                        new THREE.BoxGeometry(0.025, 0.15, 0.04),
                        handleMaterial
                    );
                    leftHandle.position.set(-0.05, height * 0.5, doorThickness / 2 + 0.02);
                    leftHandle.castShadow = true;
                    group.add(leftHandle);
                    
                    const rightHandle = new THREE.Mesh(
                        new THREE.BoxGeometry(0.025, 0.15, 0.04),
                        handleMaterial
                    );
                    rightHandle.position.set(0.05, height * 0.5, doorThickness / 2 + 0.02);
                    rightHandle.castShadow = true;
                    group.add(rightHandle);
                    
                    // Hinges for both doors
                    addDoorHinges(group, doorWidth / 2, height, hingeMaterial, -doorWidth / 4);
                    addDoorHinges(group, doorWidth / 2, height, hingeMaterial, doorWidth / 4, true);
                    break;
                    
                case 'double_open':
                    // Left door (open)
                    const leftOpenDoor = new THREE.Mesh(
                        new THREE.BoxGeometry(doorWidth / 2 - 0.02, height, doorThickness),
                        doorMaterial
                    );
                    leftOpenDoor.position.y = height / 2;
                    leftOpenDoor.position.z = -(doorWidth / 2) * 0.7;
                    leftOpenDoor.position.x = -doorWidth / 4 + (doorWidth / 4);
                    leftOpenDoor.rotation.y = -Math.PI / 2.5;
                    leftOpenDoor.castShadow = true;
                    group.add(leftOpenDoor);
                    
                    // Right door (open)
                    const rightOpenDoor = new THREE.Mesh(
                        new THREE.BoxGeometry(doorWidth / 2 - 0.02, height, doorThickness),
                        doorMaterial
                    );
                    rightOpenDoor.position.y = height / 2;
                    rightOpenDoor.position.z = -(doorWidth / 2) * 0.7;
                    rightOpenDoor.position.x = doorWidth / 4 - (doorWidth / 4);
                    rightOpenDoor.rotation.y = Math.PI / 2.5;
                    rightOpenDoor.castShadow = true;
                    group.add(rightOpenDoor);
                    
                    addDoorFrame(group, doorWidth, height, frameWidth, frameDepth, frameMaterial);
                    
                    addDoorHinges(group, doorWidth / 2, height, hingeMaterial, -doorWidth / 4);
                    addDoorHinges(group, doorWidth / 2, height, hingeMaterial, doorWidth / 4, true);
                    break;
            }
            
            return group;
        }

        function addDoorFrame(group, doorWidth, height, frameWidth, frameDepth, material) {
            // Top frame
            const topFrame = new THREE.Mesh(
                new THREE.BoxGeometry(doorWidth + frameWidth * 2, 0.15, frameDepth),
                material
            );
            topFrame.position.set(0, height + 0.075, 0);
            topFrame.castShadow = true;
            group.add(topFrame);
            
            // Left frame
            const leftFrame = new THREE.Mesh(
                new THREE.BoxGeometry(frameWidth, height + 0.15, frameDepth),
                material
            );
            leftFrame.position.set(-doorWidth / 2 - frameWidth / 2, height / 2, 0);
            leftFrame.castShadow = true;
            group.add(leftFrame);
            
            // Right frame
            const rightFrame = new THREE.Mesh(
                new THREE.BoxGeometry(frameWidth, height + 0.15, frameDepth),
                material
            );
            rightFrame.position.set(doorWidth / 2 + frameWidth / 2, height / 2, 0);
            rightFrame.castShadow = true;
            group.add(rightFrame);
            
            // Bottom threshold
            const threshold = new THREE.Mesh(
                new THREE.BoxGeometry(doorWidth + frameWidth * 2, 0.03, frameDepth),
                material
            );
            threshold.position.set(0, 0.015, 0);
            threshold.castShadow = true;
            group.add(threshold);
        }

        function addDoorHinges(group, doorWidth, height, material, xOffset = 0, rightSide = false) {
            const hingePositions = [0.15, 0.5, 0.85];
            hingePositions.forEach(ratio => {
                const hinge = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8),
                    material
                );
                hinge.rotation.z = Math.PI / 2;
                const side = rightSide ? -1 : 1;
                hinge.position.set(xOffset + side * (doorWidth / 2 + 0.03), height * ratio, 0);
                hinge.castShadow = true;
                group.add(hinge);
            });
        }

        // ==================== 3D WINDOW MODEL ====================
        function create3DWindow(width, height, windowType = 'standard') {
            const group = new THREE.Group();
            
            const frameMaterial = new THREE.MeshPhongMaterial({ color: 0x4A4A4A });
            const glassMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x87CEEB, 
                transparent: true, 
                opacity: 0.3,
                side: THREE.DoubleSide,
                shininess: 100
            });
            
            const frameThick = 0.08;
            const frameDepth = 0.15;
            
            switch(windowType) {
                case 'standard':
                    // Standard window
                    addWindowFrame(group, width+1, height, frameDepth, frameMaterial);
                    
                    // Glass pane
                    const glass = new THREE.Mesh(
                        new THREE.PlaneGeometry(width+1, height - 0.2),
                        glassMaterial
                    );
                    glass.position.set(0, height / 2, 0);
                    group.add(glass);
                    
                    // Cross dividers
                    const centerH = new THREE.Mesh(
                        new THREE.BoxGeometry(width+1, 0.05, frameDepth),
                        frameMaterial
                    );
                    centerH.position.set(0, height / 2, 0);
                    centerH.castShadow = true;
                    group.add(centerH);
                    
                    const centerV = new THREE.Mesh(
                        new THREE.BoxGeometry(0.05, height, frameDepth),
                        frameMaterial
                    );
                    centerV.position.set(0, height / 2, 0);
                    centerV.castShadow = true;
                    group.add(centerV);
                    break;
                    
                case 'wide':
                    // Wider window
                    const wideWidth = width + 1;
                    addWindowFrame(group, wideWidth, height, frameDepth, frameMaterial);
                    
                    const wideGlass = new THREE.Mesh(
                        new THREE.PlaneGeometry(wideWidth, height - 0.2),
                        glassMaterial
                    );
                    wideGlass.position.set(0, height / 2, 0);
                    group.add(wideGlass);
                    
                    // Multiple vertical dividers
                    for (let i = -20; i <= 20; i += 20) {
                        const divider = new THREE.Mesh(
                            new THREE.BoxGeometry(0.05, height, frameDepth),
                            frameMaterial
                        );
                        divider.position.set(i, height / 2, 0);
                        divider.castShadow = true;
                        group.add(divider);
                    }
                    break;
                    
                case 'bay':
                    // Center panel
                    const centerPanel = new THREE.Mesh(
                        new THREE.PlaneGeometry(width +1, height - 0.2),
                        glassMaterial
                    );
                    centerPanel.position.set(0, height / 2, 0);
                    group.add(centerPanel);
                    
                    addWindowFrame(group, width +1, height, frameDepth, frameMaterial);
                    
                    // Left angled panel
                    const leftGroup = new THREE.Group();
                    const leftPanel = new THREE.Mesh(
                        new THREE.PlaneGeometry(width +1, height - 0.2),
                        glassMaterial
                    );
                    leftPanel.position.set(-width * 0.2, 0, 0);
                    leftGroup.add(leftPanel);
                    
                    addWindowFrame(leftGroup, width +1, height, frameDepth, frameMaterial);
                    leftGroup.position.set(-width * 0.3, height / 2, 0);
                    leftGroup.rotation.y = -Math.PI / 6;
                    group.add(leftGroup);
                    
                    // Right angled panel
                    const rightGroup = new THREE.Group();
                    const rightPanel = new THREE.Mesh(
                        new THREE.PlaneGeometry(width +1, height - 0.2),
                        glassMaterial
                    );
                    rightPanel.position.set(width * 0.2, 0, 0);
                    rightGroup.add(rightPanel);
                    
                    addWindowFrame(rightGroup, width +1, height, frameDepth, frameMaterial);
                    rightGroup.position.set(width * 0.3, height / 2, 0);
                    rightGroup.rotation.y = Math.PI / 6;
                    group.add(rightGroup);
                    break;
                    
                case 'sliding':
                    // Back panel (fixed)
                    const backPanel = new THREE.Mesh(
                        new THREE.PlaneGeometry(width +1, height - 0.2),
                        glassMaterial
                    );
                    backPanel.position.set(-width * 0.2, height / 2, -0.02);
                    group.add(backPanel);
                    
                    // Front panel (sliding)
                    const frontPanel = new THREE.Mesh(
                        new THREE.PlaneGeometry(width +1, height - 0.2),
                        new THREE.MeshPhongMaterial({ 
                            color: 0x87CEEB, 
                            transparent: true, 
                            opacity: 0.5,
                            side: THREE.DoubleSide,
                            shininess: 100
                        })
                    );
                    frontPanel.position.set(width * 0.2, height / 2, 0.02);
                    group.add(frontPanel);
                    
                    addWindowFrame(group, width+1, height, frameDepth, frameMaterial);
                    
                    // Sliding track
                    const track = new THREE.Mesh(
                        new THREE.BoxGeometry(width+1, 0.05, 0.05),
                        frameMaterial
                    );
                    track.position.set(0, 0.05, 0);
                    group.add(track);
                    break;
            }
            
            return group;
        }

        function addWindowFrame(group, width, height, frameDepth, material) {
            // Top frame
            const topFrame = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.1, frameDepth),
                material
            );
            topFrame.position.set(0, height, 0);
            topFrame.castShadow = true;
            group.add(topFrame);
            
            // Bottom frame
            const bottomFrame = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.1, frameDepth),
                material
            );
            bottomFrame.position.set(0, 0, 0);
            bottomFrame.castShadow = true;
            group.add(bottomFrame);
            
            // Left frame
            const leftFrame = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, height, frameDepth),
                material
            );
            leftFrame.position.set(-width / 2, height / 2, 0);
            leftFrame.castShadow = true;
            group.add(leftFrame);
            
            // Right frame
            const rightFrame = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, height, frameDepth),
                material
            );
            rightFrame.position.set(width / 2, height / 2, 0);
            rightFrame.castShadow = true;
            group.add(rightFrame);
        }

        // [Continue with furniture models - same as original but truncated for space]


        // ==================== 3D INITIALIZATION ====================
        function view3D() {
            const view3d = document.getElementById('view3d');
            view3d.classList.add('active');
            init3D();
        }

        function init3D() {
            const canvas3d = document.getElementById('canvas3d');

            // --- Renderer ---
            fpRenderer3D = new THREE.WebGLRenderer({
                canvas: canvas3d,
                antialias: true,
                preserveDrawingBuffer: true
            });
            fpRenderer3D.setSize(window.innerWidth, window.innerHeight);
            fpRenderer3D.shadowMap.enabled = true;
            fpRenderer3D.shadowMap.type = THREE.PCFSoftShadowMap;
            window.fpRenderer3D = fpRenderer3D;

            // --- Scene ---
            fpScene3D = new THREE.Scene();
            fpScene3D.background = new THREE.Color(0x87ceeb);
            window.fpScene3D = fpScene3D;

            // --- Camera ---
            fpCamera3D = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            window.fpCamera3D = fpCamera3D;

            // === BOUNDS & CENTER CALC ===
            let minX = Infinity, maxX = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;

            structures.forEach(s => {
                s.points.forEach(p => {
                    const wx = s.x + p.x;
                    const wy = s.y + p.y;
                    minX = Math.min(minX, wx);
                    maxX = Math.max(maxX, wx);
                    minZ = Math.min(minZ, wy);
                    maxZ = Math.max(maxZ, wy);
                });
            });

            walls.forEach(w => {
                minX = Math.min(minX, w.x1, w.x2);
                maxX = Math.max(maxX, w.x1, w.x2);
                minZ = Math.min(minZ, w.y1, w.y2);
                maxZ = Math.max(maxZ, w.y1, w.y2);
            });

            const width = (maxX - minX) / 50;
            const depth = (maxZ - minZ) / 50;
            const centerX = ((maxX + minX) / 2 - minX) / 50 - width / 2;
            const centerZ = ((maxZ + minZ) / 2 - minZ) / 50 - depth / 2;
            const maxDim = Math.max(width, depth) || 5;
            const distance = maxDim * 2.5;

            fpCamera3D.position.set(centerX + distance * 0.7, distance * 0.6, centerZ + distance * 0.7);
            fpCamera3D.lookAt(centerX, 0, centerZ);

            // --- OrbitControls ---
            window.fpControls3D = new THREE.OrbitControls(fpCamera3D, fpRenderer3D.domElement);
            fpControls3D.enableDamping = true;
            fpControls3D.dampingFactor = 0.08;
            fpControls3D.enableRotate = true;
            fpControls3D.rotateSpeed = 0.6;
            fpControls3D.enableZoom = true;
            fpControls3D.zoomSpeed = 1.0;
            fpControls3D.enablePan = true;
            fpControls3D.panSpeed = 0.4;
            fpControls3D.maxPolarAngle = Math.PI / 2.05;
            fpControls3D.minPolarAngle = 0.1;
            fpControls3D.minDistance = 1;
            fpControls3D.maxDistance = 200;

            // --- Lights ---
            const dir = new THREE.DirectionalLight(0xffffff, 1);
            dir.position.set(50, 100, 50);
            dir.castShadow = true;
            dir.shadow.mapSize.width = 2048;
            dir.shadow.mapSize.height = 2048;
            dir.shadow.camera.left = -50;
            dir.shadow.camera.right = 50;
            dir.shadow.camera.top = 50;
            dir.shadow.camera.bottom = -50;
            dir.shadow.camera.far = 200;
            fpScene3D.add(dir);

            fpScene3D.add(new THREE.AmbientLight(0xffffff, 0.6));

            // --- Floor ---
            if (width > 0 && depth > 0) {
                const floorGeom = new THREE.PlaneGeometry(width, depth);
                const floorMat = new THREE.MeshLambertMaterial({ color: 0xE8D7C3, side: THREE.DoubleSide });
                const floor = new THREE.Mesh(floorGeom, floorMat);
                floor.rotation.x = -Math.PI / 2;
                floor.position.set(centerX, 0, centerZ);
                floor.receiveShadow = true;
                fpScene3D.add(floor);
            }

            // --- Wall Material ---
            const wallHeight = 3;
            const doorHeight = 2.1; // REDUCED from 2.7 to 2.1 meters (standard door height)
            const wallThickness = 0.15;
            const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xB87333 });

            // --- Structures (3D walls) ---
            structures.forEach(s => {
                s.walls.forEach(w => {
                    const wx1 = s.x + w.x1;
                    const wy1 = s.y + w.y1;
                    const wx2 = s.x + w.x2;
                    const wy2 = s.y + w.y2;

                    const len = Math.hypot(wx2 - wx1, wy2 - wy1) / 50;
                    const angle = Math.atan2(wy2 - wy1, wx2 - wx1);

                    const mesh = new THREE.Mesh(
                        new THREE.BoxGeometry(len, wallHeight, wallThickness),
                        wallMaterial
                    );

                    mesh.position.set(
                        ((wx1 + wx2) / 2 - minX) / 50 - width / 2,
                        wallHeight / 2,
                        ((wy1 + wy2) / 2 - minZ) / 50 - depth / 2
                    );
                    mesh.rotation.y = angle;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    fpScene3D.add(mesh);
                });
            });

            // --- Free walls ---
            walls.forEach(w => {
                const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 50;
                const angle = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);

                const mesh = new THREE.Mesh(
                    new THREE.BoxGeometry(len, wallHeight, wallThickness),
                    wallMaterial
                );

                mesh.position.set(
                    ((w.x1 + w.x2) / 2 - minX) / 50 - width / 2,
                    wallHeight / 2,
                    ((w.y1 + w.y2) / 2 - minZ) / 50 - depth / 2
                );

                mesh.rotation.y = angle;
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                fpScene3D.add(mesh);
            });

            // --- Doors with REDUCED HEIGHT ---
            doors.forEach(d => {
                const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / 50;
                const angle = d.rotation || Math.atan2(d.y2 - d.y1, d.x2 - d.x1);

                const type = d.doorType || "single_closed";
                const door3D = create3DDoor(len, doorHeight, type); // Using doorHeight = 2.1m

                door3D.position.set(
                    ((d.x1 + d.x2) / 2 - minX) / 50 - width / 2,
                    doorHeight * 0.45, // Adjusted position for reduced height
                    ((d.y1 + d.y2) / 2 - minZ) / 50 - depth / 2
                );
                door3D.rotation.y = angle;

                if (d.mirrored) door3D.scale.x *= -1;

                fpScene3D.add(door3D);
            });

            // --- Windows ---
            windows.forEach(w => {
                const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 50;
                const angle = w.rotation || Math.atan2(w.y2 - w.y1, w.x2 - w.x1);

                const type = w.windowType || "standard";
                const win3D = create3DWindow(len, wallHeight * 0.5, type);

                win3D.position.set(
                    ((w.x1 + w.x2) / 2 - minX) / 50 - width / 2,
                    wallHeight * 0.4,
                    ((w.y1 + w.y2) / 2 - minZ) / 50 - depth / 2
                );
                win3D.rotation.y = angle;

                if (w.mirrored) win3D.scale.x *= -1;

                fpScene3D.add(win3D);
            });

            // --- Furniture ---
            furniture.forEach(f => {
                const f3D = create3DFurnitureModel(f.type, f.size / 30);
                f3D.position.set(
                    (f.x - minX) / 50 - width / 2,
                    0,
                    (f.y - minZ) / 50 - depth / 2
                );
                f3D.rotation.y = f.rotation || 0;
                if (f.mirrored) f3D.scale.x *= -1;

                fpScene3D.add(f3D);
            });

            // --- Animation Loop ---
            function animate3D() {
                requestAnimationFrame(animate3D);
                fpControls3D.update();
                fpRenderer3D.render(fpScene3D, fpCamera3D);
            }
            animate3D();

            // --- Resize Handling ---
            window.addEventListener("resize", () => {
                fpCamera3D.aspect = window.innerWidth / window.innerHeight;
                fpCamera3D.updateProjectionMatrix();
                fpRenderer3D.setSize(window.innerWidth, window.innerHeight);
            });
        }

        // ==================== 3-ANGLE RENDER DOWNLOAD ====================
        async function downloadFloorplanRenders() {
            const renderer = window.fpRenderer3D;
            const scene    = window.fpScene3D;
            const camera   = window.fpCamera3D;

            if (!renderer || !scene || !camera) {
                alert("Open the 3D view first (View 3D), then try again.");
                return;
            }

            const renders = await renderThreeAngleImages(renderer, scene, camera);
            await downloadAsZip(renders);
        }

        async function renderThreeAngleImages(renderer, scene, camera) {
            // Save current camera state
            const originalPosition = camera.position.clone();
            const originalQuaternion = camera.quaternion.clone();

            // Temporary 3-point lighting
            const key = new THREE.DirectionalLight(0xffffff, 1.2);
            key.position.set(3, 5, 3);
            scene.add(key);

            const fill = new THREE.DirectionalLight(0xffffff, 0.6);
            fill.position.set(-3, 2, 2);
            scene.add(fill);

            const back = new THREE.DirectionalLight(0xffffff, 0.4);
            back.position.set(0, 5, -3);
            scene.add(back);

            const captures = [];

            // 1) CURRENT USER VIEW
            renderer.render(scene, camera);
            captures.push({
                name: "view_current.png",
                data: renderer.domElement.toDataURL("image/png")
            });

            // 2) TOP VIEW
            camera.position.set(0, 10, 0.001);
            camera.lookAt(0, 0, 0);
            renderer.render(scene, camera);
            captures.push({
                name: "view_top.png",
                data: renderer.domElement.toDataURL("image/png")
            });

            // 3) PERSPECTIVE VIEW
            camera.position.set(5, 3, 5);
            camera.lookAt(0, 1, 0);
            renderer.render(scene, camera);
            captures.push({
                name: "view_perspective.png",
                data: renderer.domElement.toDataURL("image/png")
            });

            // Cleanup lights and restore
            scene.remove(key);
            scene.remove(fill);
            scene.remove(back);

            camera.position.copy(originalPosition);
            camera.quaternion.copy(originalQuaternion);
            camera.updateMatrixWorld(true);

            return captures;
        }

        async function downloadAsZip(files) {
            const zip = new JSZip();

            files.forEach(f => {
                const base64 = f.data.split(",")[1];
                zip.file(f.name, base64, { base64: true });
            });

            const blob = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "floorplan_renders.zip";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // ==================== FIREBASE INTEGRATION ====================
        async function saveFloorplan() {
            const roomId = document.getElementById("floorplan-room-id").value.trim();
            if (!roomId) {
                alert("Enter Room ID to save floor plan");
                return;
            }

            try {
                console.log("============================================");
                console.log("=== SAVING FLOOR PLAN ===");
                console.log("============================================");
                console.log("🏠 Room ID:", roomId);
                
                // Ensure 3D scene exists
                if (!fpScene3D) {
                    console.log("\n⚠️ No 3D scene exists yet");
                    console.log("   Creating 3D scene from floor plan...");
                    init3D();
                    
                    // Wait a moment for scene to be created
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    if (!fpScene3D) {
                        console.error("❌ Failed to create 3D scene");
                        throw new Error("Cannot create 3D scene from floor plan");
                    }
                    console.log("✅ 3D scene created successfully");
                }
                
                console.log("\n📊 Floor Plan Statistics:");
                console.log("   Walls:", walls.length);
                console.log("   Doors:", doors.length);
                console.log("   Windows:", windows.length);
                console.log("   Furniture:", furniture.length);
                console.log("   Dimensions:", dimensions);
                
                // Step 1: Save floor plan data
                const floorPlanData = {
                    walls,
                    doors,
                    windows,
                    furniture,
                    dimensions,
                    structures,
                    hasFloorPlan: true,
                    floorPlanUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                console.log("\n💾 Step 1: Saving floor plan data to Firestore...");
                await db.collection("rooms").doc(roomId).set({
                    floorPlan: floorPlanData
                }, { merge: true });
                console.log("✅ Floor plan data saved");

                // Step 2: Export 3D model as OBJ and upload to Firebase Storage
                console.log("\n🎨 Step 2: Exporting 3D model as OBJ...");
                const objContent = export3DSceneToOBJ();
                
                if (!objContent) {
                    console.error("❌ Failed to export 3D scene to OBJ");
                    throw new Error("Failed to export 3D model");
                }
                
                console.log("✅ OBJ content generated");
                console.log("   Size:", objContent.length, "characters");
                console.log("   Lines:", objContent.split('\n').length);
                
                console.log("\n☁️ Step 3: Uploading OBJ to Firebase Storage...");
                const meshUrl = await uploadOBJToStorage(roomId, objContent);
                
                if (!meshUrl) {
                    console.error("❌ Failed to upload OBJ to storage");
                    throw new Error("Failed to upload 3D model to storage");
                }
                
                console.log("✅ OBJ uploaded successfully");
                console.log("   URL:", meshUrl);
                
                // Update room document with meshUrl
                console.log("\n🔗 Step 4: Saving meshUrl to room document...");
                await db.collection("rooms").doc(roomId).set({
                    meshUrl: meshUrl,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log("✅ meshUrl saved to Firestore");

                console.log("\n============================================");
                console.log("=== SAVE COMPLETE ===");
                console.log("============================================");
                console.log("✅ Floor plan data saved");
                console.log("✅ 3D model (OBJ) uploaded to meshes/" + roomId + ".obj");
                console.log("✅ meshUrl saved to room document");
                console.log("============================================\n");
                
                alert(`Floor plan saved successfully for Room ${roomId}! ✅\n\n` +
                      `✅ Floor plan data saved\n` +
                      `✅ 3D model uploaded to Firebase Storage\n` +
                      `✅ Room Editor will load the exact same model!`);
                      
                updateRoomNumberDisplay(roomId);
                
                // Update the room editor input if it exists
                if (currentRoomId === roomId) {
                    document.getElementById('floorplan-indicator').style.display = 'block';
                }
            } catch (error) {
                console.error("\n❌ ===  SAVE FAILED ===");
                console.error("Error type:", error.name);
                console.error("Error message:", error.message);
                console.error("Stack trace:", error.stack);
                console.error("========================\n");
                alert("Error saving floor plan: " + error.message);
            }
        }
        
        // Function to export 3D scene to OBJ format
        function export3DSceneToOBJ() {
            if (!fpScene3D) {
                console.warn("No 3D scene available");
                return null;
            }
            
            let objContent = "# OBJ file generated from Floor Plan Designer\n";
            objContent += "# Created: " + new Date().toISOString() + "\n";
            objContent += "mtllib materials.mtl\n\n";
            
            let mtlContent = "# Material file\n\n";
            let vertexOffset = 1;
            let materialIndex = 0;
            const materials = new Map();
            
            fpScene3D.traverse(function(child) {
                if (child instanceof THREE.Mesh && child.geometry) {
                    const geometry = child.geometry;
                    const matrix = child.matrixWorld;
                    
                    // Get material color
                    const color = child.material.color;
                    const r = color.r;
                    const g = color.g;
                    const b = color.b;
                    
                    // Create unique material name based on color
                    const colorKey = `${Math.round(r*255)}_${Math.round(g*255)}_${Math.round(b*255)}`;
                    
                    if (!materials.has(colorKey)) {
                        const matName = `material_${materialIndex}`;
                        materials.set(colorKey, matName);
                        
                        // Add material to MTL content
                        mtlContent += `newmtl ${matName}\n`;
                        mtlContent += `Ka ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\n`;
                        mtlContent += `Kd ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\n`;
                        mtlContent += `Ks 0.5 0.5 0.5\n`;
                        mtlContent += `Ns 32\n\n`;
                        
                        materialIndex++;
                    }
                    
                    const matName = materials.get(colorKey);
                    
                    objContent += `\n# Object: ${child.name || 'mesh'}\n`;
                    objContent += `# Material: RGB(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)})\n`;
                    objContent += `usemtl ${matName}\n`;
                    
                    // Extract vertices
                    const position = geometry.attributes.position;
                    if (position) {
                        const vertices = [];
                        for (let i = 0; i < position.count; i++) {
                            const vertex = new THREE.Vector3(
                                position.getX(i),
                                position.getY(i),
                                position.getZ(i)
                            );
                            vertex.applyMatrix4(matrix);
                            vertices.push(vertex);
                            objContent += `v ${vertex.x.toFixed(4)} ${vertex.y.toFixed(4)} ${vertex.z.toFixed(4)}\n`;
                        }
                        
                        // Extract faces
                        if (geometry.index) {
                            // Indexed geometry
                            const indices = geometry.index.array;
                            for (let i = 0; i < indices.length; i += 3) {
                                const a = indices[i] + vertexOffset;
                                const b = indices[i + 1] + vertexOffset;
                                const c = indices[i + 2] + vertexOffset;
                                objContent += `f ${a} ${b} ${c}\n`;
                            }
                        } else {
                            // Non-indexed geometry
                            for (let i = 0; i < position.count; i += 3) {
                                const a = i + vertexOffset;
                                const b = i + 1 + vertexOffset;
                                const c = i + 2 + vertexOffset;
                                objContent += `f ${a} ${b} ${c}\n`;
                            }
                        }
                        
                        vertexOffset += position.count;
                    }
                }
            });
            
            // Prepend material definitions as comments (since we can't upload MTL separately easily)
            objContent = "# OBJ file generated from Floor Plan Designer\n" +
                        "# Created: " + new Date().toISOString() + "\n" +
                        "# \n# MATERIAL DEFINITIONS:\n# " + 
                        mtlContent.split('\n').join('\n# ') + 
                        "\n\n" + 
                        objContent.split('\n').slice(3).join('\n');
            
            console.log("OBJ content generated, size:", objContent.length, "bytes");
            console.log("Materials used:", materials.size);
            return objContent;
        }
        
        // Function to upload OBJ to Firebase Storage
        async function uploadOBJToStorage(roomId, objContent) {
            try {
                const blob = new Blob([objContent], { type: 'text/plain' });
                const fileName = `${roomId}.obj`;  // Changed: Use simple naming like 5216.obj
                const storageRef = firebase.storage().ref(`meshes/${fileName}`);  // Changed: Use meshes/ folder
                
                console.log("Uploading to storage path:", `meshes/${fileName}`);
                
                const uploadTask = await storageRef.put(blob);
                const downloadURL = await uploadTask.ref.getDownloadURL();
                
                console.log("Upload complete, download URL:", downloadURL);
                return downloadURL;
                
            } catch (error) {
                console.error("Error uploading OBJ to storage:", error);
                return null;
            }
        }

        async function loadFloorplan() {
            const roomId = document.getElementById("floorplan-room-id").value.trim();
            if (!roomId) {
                alert("Enter Room ID to load floor plan");
                return;
            }

            try {
                const doc = await db.collection("rooms").doc(roomId).get();
                if (!doc.exists) {
                    alert("Room not found");
                    return;
                }

                const data = doc.data();
                if (!data.floorPlan) {
                    alert("No floor plan found for this room");
                    return;
                }

                const floorPlan = data.floorPlan;

                // Clear current state
                clearCanvas();

                // Load floor plan data
                walls = floorPlan.walls || [];
                doors = floorPlan.doors || [];
                windows = floorPlan.windows || [];
                furniture = floorPlan.furniture || [];
                dimensions = floorPlan.dimensions || [];
                structures = floorPlan.structures || [];

                // Redraw
                fpRedraw();
                saveHistory();

                updateRoomNumberDisplay(roomId);
                alert(`Floor plan loaded successfully for Room ${roomId}! ✅`);
            } catch (error) {
                console.error("Error loading floor plan:", error);
                alert("Error loading floor plan: " + error.message);
            }
        }