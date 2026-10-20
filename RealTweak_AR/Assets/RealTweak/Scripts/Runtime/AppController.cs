// RealTweak AR — app flow.
//   Home → Scan (floor → walls → review/adjust) → Save → Live room
//   Home → Enter code → Align (smart align / two corners / place manually) → Live room
// Live room: website edits arrive in real time; furniture added/moved/removed here is saved with a
// per-item merge, so the phone and the browser can edit together. The last room reopens on launch.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Firebase.Firestore;
using RealTweak.Core;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.XR.ARFoundation;

namespace RealTweak
{
    public class AppController : MonoBehaviour
    {
        [Header("AR")]
        public Camera arCamera;
        public ScanCapture scanner;
        public ARInteraction interaction;
        public ARAnchorManager anchorManager;
        public ARPlaneManager planeManager;

        RoomView roomView;
        Canvas canvas;
        RectTransform home, join, scanScreen, review, align, live, busy, catalogSheet, editSheet;
        TextMeshProUGUI homeContinueLabel, joinError, scanHint, scanTitle, busyText, liveTitle, liveStatus, alignHint, selectionName, toast, capability;
        Button saveScanButton, continueButton, startCaptureButton, finishButton, cornerButton, undoCornerButton, saveButton, smartAlignDoneButton, flipButton, alignTapButton;
        TMP_InputField codeInput, nameInput;
        RectTransform selectionBar, catalogGrid, categoryRow, scanCornerTools;
        PlanEditor reviewEditor, liveEditor;
        Image reticle, markerA, markerB;
        RectTransform alignMap;
        PlanGraphic alignGraphic;

        // `house` is the whole project (all floors, as stored in Firestore); `room` is the floor shown in AR.
        Room house, room, baseRoom;
        int level;
        bool addingFloor;
        RectTransform floorSheet, floorList, floorTools;
        // Floor lock: ARCore refines its floor height over time; the room follows the detected floor
        // plus a user offset (Floor up / down) so furniture sits on the real floor.
        bool autoFloor = true;
        float floorOffset, nextFloorCheck;
        TextMeshProUGUI floorLockLabel;
        bool dirty, saving, cornerMode;
        ListenerRegistration listener;
        ScanResult lastScan;
        string category = "Living";
        readonly Queue<Action> mainThread = new Queue<Action>();
        float nextPresence;
        enum AlignStep { None, Smart, TapA, TapB, Manual }
        AlignStep alignStep;
        Vector3 tapA;
        RegistrationResult registration;
        int alternativeIndex;
        ARAnchor anchor;

        const string LastRoomKey = "realtweak.lastRoom";

        // ------------------------------------------------------------------ lifecycle
        void Awake()
        {
            Application.targetFrameRate = 60;
            UnityEngine.Screen.sleepTimeout = SleepTimeout.NeverSleep;
            var rv = new GameObject("Room"); roomView = rv.AddComponent<RoomView>(); rv.SetActive(false);
            interaction.roomView = roomView; interaction.arCamera = arCamera;
            interaction.ItemChanged += OnItemMoved;
            interaction.SelectionChanged += _ => RefreshSelection();
            interaction.RoomMoved += () => { };
            BuildUI();
            Show(home);
            RefreshHome();
            _ = CloudService.Init().ContinueWith(t => { if (t.IsFaulted) Post(() => Toast(CloudService.Friendly(t.Exception))); });
        }

        void Update()
        {
            lock (mainThread) while (mainThread.Count > 0) mainThread.Dequeue()();
            if (scanScreen.gameObject.activeSelf) UpdateScanUI();
            if (align.gameObject.activeSelf) UpdateAlignUI();
            if (live.gameObject.activeSelf && room != null && Time.unscaledTime > nextPresence) { nextPresence = Time.unscaledTime + 60; _ = CloudService.ReportPresence(room.roomId, baseRoom?.revision ?? 0); }
            if (reticle != null) UpdateReticle();
            if (live.gameObject.activeSelf) FloorLock();
        }
        void Post(Action a) { lock (mainThread) mainThread.Enqueue(a); }

        void OnApplicationPause(bool paused) { if (paused) SaveDraft(); }
        void OnApplicationQuit() { SaveDraft(); if (room != null) _ = CloudService.LeavePresence(room.roomId); }

        // ------------------------------------------------------------------ UI construction
        void BuildUI()
        {
            canvas = UIKit.Root();
            var root = canvas.transform;
            reticle = UIKit.Panel(root, "Reticle", new Color(1, 1, 1, 0.9f), false); reticle.sprite = UIKit.Circle(); reticle.rectTransform.sizeDelta = new Vector2(36, 36); reticle.raycastTarget = false; reticle.gameObject.SetActive(false);

            // Home
            home = MakeScreen("Home", UIKit.Cream);
            var homeCol = UIKit.Rect(home, "Column").Stretch(70, 260, 70, 120); UIKit.Column(homeCol, 32);
            UIKit.Text(homeCol, "REALTWEAK AR", 30, UIKit.Muted, FontStyles.Bold).Size(50);
            UIKit.Text(homeCol, "Scan your room.\nRedesign it anywhere.", 78, UIKit.Ink, FontStyles.Bold).Size(220);
            UIKit.Text(homeCol, "Capture walls, doors, windows and furniture with any AR phone, then open the plan on realtweak.web.app to rearrange it - changes appear here instantly.", 36, UIKit.Muted).Size(200);
            UIKit.Rect(homeCol, "Spacer").Size(60);
            UIKit.Button(homeCol, "Scan a room", () => StartScan(false), UIKit.Green, UIKit.White, 46).Size(160);
            UIKit.Button(homeCol, "Enter a room code", () => { joinError.text = ""; Show(join); }, UIKit.White, UIKit.Green, 42).Size(150);
            continueButton = UIKit.Button(homeCol, "Continue", () => Join(PlayerPrefs.GetString(LastRoomKey)), UIKit.Mint, UIKit.Green, 38);
            continueButton.Size(140);
            homeContinueLabel = continueButton.GetComponentInChildren<TextMeshProUGUI>();
            capability = UIKit.Text(homeCol, "", 28, UIKit.Muted, FontStyles.Normal, TextAlignmentOptions.Center); capability.Size(90);

            // Join
            join = MakeScreen("Join", UIKit.Cream);
            var joinCol = UIKit.Rect(join, "Column").Stretch(70, 300, 70, 200); UIKit.Column(joinCol, 30);
            UIKit.Text(joinCol, "Enter your room code", 64, UIKit.Ink, FontStyles.Bold).Size(100);
            UIKit.Text(joinCol, "It's shown on the phone that scanned the room and on the website (for example ABCD-EFGH).", 34, UIKit.Muted).Size(110);
            codeInput = UIKit.Input(joinCol, "ABCD-EFGH");
            codeInput.characterValidation = TMP_InputField.CharacterValidation.None;
            codeInput.onValueChanged.AddListener(v => { var up = v.ToUpperInvariant(); if (up != v && v.Length <= 9) codeInput.SetTextWithoutNotify(up); });
            joinError = UIKit.Text(joinCol, "", 32, UIKit.Danger); joinError.Size(90);
            UIKit.Button(joinCol, "Open room", () => Join(codeInput.text), UIKit.Green, UIKit.White, 44).Size(150);
            UIKit.Button(joinCol, "Back", () => Show(home), UIKit.Cream, UIKit.Muted, 36).Size(120);

            // Scan
            scanScreen = MakeScreen("Scan", Color.clear);
            var scanCard = UIKit.Panel(scanScreen, "Card", UIKit.Glass); scanCard.rectTransform.Anchor(new Vector2(0, 1), new Vector2(1, 1), new Vector2(0.5f, 1), new Vector2(0, -90), new Vector2(-60, 260));
            scanTitle = UIKit.Text(scanCard.transform, "Find the floor", 48, UIKit.White, FontStyles.Bold); scanTitle.rectTransform.Stretch(40, 30, 40, 150);
            scanHint = UIKit.Text(scanCard.transform, "", 34, new Color(1, 1, 1, 0.85f)); scanHint.rectTransform.Stretch(40, 110, 40, 20);
            var scanBottom = UIKit.Rect(scanScreen, "Bottom").Anchor(new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 60), new Vector2(-60, 300));
            UIKit.Column(scanBottom, 20, 0, TextAnchor.LowerCenter);
            scanCornerTools = (RectTransform)UIKit.Row(scanBottom, 20, 130).transform;
            cornerButton = UIKit.Button(scanCornerTools, "Add corner", () => { if (scanner.FloorPoint(new Vector2(UnityEngine.Screen.width / 2f, UnityEngine.Screen.height / 2f), out var p)) scanner.AddCorner(p); }, UIKit.Amber, UIKit.Ink, 38);
            undoCornerButton = UIKit.Button(scanCornerTools, "Undo", () => scanner.UndoCorner(), UIKit.White, UIKit.Ink, 38);
            var scanRow = UIKit.Row(scanBottom, 20, 140);
            UIKit.Button(scanRow.transform, "Cancel", CancelScan, UIKit.White, UIKit.Ink, 38);
            UIKit.Button(scanRow.transform, "Corner mode", () => { cornerMode = !cornerMode; }, UIKit.White, UIKit.Ink, 34);
            startCaptureButton = UIKit.Button(scanRow.transform, "Start", () => scanner.BeginCapture(), UIKit.Green, UIKit.White, 40);
            finishButton = UIKit.Button(scanRow.transform, "Finish", FinishScan, UIKit.Green, UIKit.White, 40);

            // Review (bottom sheet over AR so the user sees the outline on the real room)
            review = MakeScreen("Review", Color.clear);
            var sheet = UIKit.Panel(review, "Sheet", UIKit.Cream); sheet.rectTransform.Anchor(Vector2.zero, new Vector2(1, 0), new Vector2(0.5f, 0), Vector2.zero, new Vector2(0, 1250));
            var head = UIKit.Rect(sheet.transform, "Head").Anchor(new Vector2(0, 1), Vector2.one, new Vector2(0.5f, 1), new Vector2(0, -20), new Vector2(-60, 300));
            UIKit.Column(head, 14);
            UIKit.Text(head, "Check your room", 52, UIKit.Ink, FontStyles.Bold).Size(70);
            nameInput = UIKit.Input(head, "Room name", 40); nameInput.Size(110); nameInput.textComponent.characterSpacing = 0;
            var reviewRow = UIKit.Row(head, 16, 100);
            UIKit.Button(reviewRow.transform, "Rescan", () => StartScan(addingFloor), UIKit.White, UIKit.Ink, 36);
            saveScanButton = UIKit.Button(reviewRow.transform, "Save & get code", () => _ = SaveScan(), UIKit.Green, UIKit.White, 36);
            var editorHost = UIKit.Rect(sheet.transform, "Editor").Stretch(0, 320, 0, 0);
            reviewEditor = PlanEditor.Create(editorHost);
            reviewEditor.Changed += r => { roomView.Show(r); };

            // Align
            align = MakeScreen("Align", Color.clear);
            var alignCard = UIKit.Panel(align, "Card", UIKit.Glass); alignCard.rectTransform.Anchor(new Vector2(0, 1), new Vector2(1, 1), new Vector2(0.5f, 1), new Vector2(0, -90), new Vector2(-60, 240));
            alignHint = UIKit.Text(alignCard.transform, "", 36, UIKit.White); alignHint.rectTransform.Stretch(40, 30, 40, 30);
            var alignBottom = UIKit.Rect(align, "Bottom").Anchor(new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 60), new Vector2(-60, 440));
            UIKit.Column(alignBottom, 18, 0, TextAnchor.LowerCenter);
            alignTapButton = UIKit.Button(alignBottom, "Mark corner", MarkAlignCorner, UIKit.Amber, UIKit.Ink, 38);
            alignMap = UIKit.Panel(align, "Minimap", new Color(1, 1, 1, 0.92f)).rectTransform;
            alignMap.Anchor(new Vector2(1, 1), new Vector2(1, 1), new Vector2(1, 1), new Vector2(-30, -350), new Vector2(380, 380));
            var mapPlan = UIKit.Rect(alignMap, "Plan").Stretch(20, 20, 20, 20);
            alignGraphic = mapPlan.gameObject.AddComponent<PlanGraphic>(); alignGraphic.raycastTarget = false;
            markerA = UIKit.Panel(mapPlan, "A", UIKit.Amber, false); markerA.sprite = UIKit.Circle(); markerA.rectTransform.sizeDelta = new Vector2(40, 40);
            markerB = UIKit.Panel(mapPlan, "B", UIKit.Amber, false); markerB.sprite = UIKit.Circle(); markerB.rectTransform.sizeDelta = new Vector2(40, 40);
            alignMap.gameObject.SetActive(false);
            var alignRow1 = UIKit.Row(alignBottom, 16, 130);
            UIKit.Button(alignRow1.transform, "Smart align", BeginSmartAlign, UIKit.Green, UIKit.White, 34);
            UIKit.Button(alignRow1.transform, "Tap 2 corners", BeginTapAlign, UIKit.White, UIKit.Ink, 34);
            UIKit.Button(alignRow1.transform, "Place by hand", BeginManualAlign, UIKit.White, UIKit.Ink, 34);
            var alignRow2 = UIKit.Row(alignBottom, 16, 130);
            flipButton = UIKit.Button(alignRow2.transform, "Rotate 180", FlipAlignment, UIKit.White, UIKit.Ink, 34);
            smartAlignDoneButton = UIKit.Button(alignRow2.transform, "Done", FinishAlign, UIKit.Green, UIKit.White, 38);

            // Live room
            live = MakeScreen("Live", Color.clear);
            var top = UIKit.Panel(live, "Top", UIKit.Glass); top.rectTransform.Anchor(new Vector2(0, 1), Vector2.one, new Vector2(0.5f, 1), new Vector2(0, -70), new Vector2(-40, 190));
            liveTitle = UIKit.Text(top.transform, "", 42, UIKit.White, FontStyles.Bold); liveTitle.rectTransform.Stretch(36, 24, 300, 90);
            liveStatus = UIKit.Text(top.transform, "", 30, new Color(1, 1, 1, 0.8f)); liveStatus.rectTransform.Stretch(36, 100, 300, 20);
            var shareBtn = UIKit.Button(top.transform, "Share code", ShareCode, UIKit.Mint, UIKit.Green, 30);
            ((RectTransform)shareBtn.transform).Anchor(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-24, 0), new Vector2(250, 110));
            selectionBar = (RectTransform)UIKit.Panel(live, "Selection", UIKit.Glass).transform;
            selectionBar.Anchor(new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 250), new Vector2(-40, 150));
            var selRow = selectionBar.gameObject.AddComponent<HorizontalLayoutGroup>(); selRow.padding = new RectOffset(24, 24, 18, 18); selRow.spacing = 14; selRow.childControlWidth = true; selRow.childControlHeight = true; selRow.childForceExpandHeight = true;
            selectionName = UIKit.Text(selectionBar, "", 32, UIKit.White, FontStyles.Bold, TextAlignmentOptions.MidlineLeft); selectionName.Size(width: 280);
            UIKit.Button(selectionBar, "Turn L", () => RotateSelected(15), UIKit.Mint, UIKit.Ink, 44);
            UIKit.Button(selectionBar, "Turn R", () => RotateSelected(-15), UIKit.Mint, UIKit.Ink, 44);
            UIKit.Button(selectionBar, "Up", () => RaiseSelected(0.02f), UIKit.Mint, UIKit.Ink, 32);
            UIKit.Button(selectionBar, "Down", () => RaiseSelected(-0.02f), UIKit.Mint, UIKit.Ink, 32);
            UIKit.Button(selectionBar, "Copy", DuplicateSelected, UIKit.Mint, UIKit.Ink, 32);
            UIKit.Button(selectionBar, "Delete", DeleteSelected, UIKit.Mint, UIKit.Danger, 32);
            var bar = UIKit.Panel(live, "Bar", UIKit.Glass); bar.rectTransform.Anchor(Vector2.zero, new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 50), new Vector2(-40, 180));
            var barRow = bar.gameObject.AddComponent<HorizontalLayoutGroup>(); barRow.padding = new RectOffset(20, 20, 20, 20); barRow.spacing = 14; barRow.childControlWidth = true; barRow.childControlHeight = true; barRow.childForceExpandWidth = true; barRow.childForceExpandHeight = true;
            UIKit.Button(bar.transform, "+ Add", () => { BuildCatalog(); Show(catalogSheet, overlay: true); }, UIKit.Mint, UIKit.Green, 34);
            UIKit.Button(bar.transform, "Walls", CycleWalls, UIKit.Mint, UIKit.Ink, 34);
            UIKit.Button(bar.transform, "Floor", OpenFloors, UIKit.Mint, UIKit.Ink, 34);
            UIKit.Button(bar.transform, "Align", () => StartAlign(false), UIKit.Mint, UIKit.Ink, 34);
            UIKit.Button(bar.transform, "Room", () => { liveEditor.Edit(room); Show(editSheet, overlay: true); }, UIKit.Mint, UIKit.Ink, 34);
            saveButton = UIKit.Button(bar.transform, "Save", () => _ = Save(), UIKit.Green, UIKit.White, 34);
            floorTools = (RectTransform)UIKit.Panel(live, "Floor tools", UIKit.Glass).transform;
            floorTools.Anchor(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-24, 120), new Vector2(230, 560));
            UIKit.Column(floorTools, 12, 16);
            floorLockLabel = UIKit.Text(floorTools, "FLOOR\nauto", 26, UIKit.White, FontStyles.Bold, TextAlignmentOptions.Center); floorLockLabel.Size(80);
            UIKit.Button(floorTools, "Up 1cm", () => NudgeFloor(0.01f), UIKit.Mint, UIKit.Ink, 28).Size(95);
            UIKit.Button(floorTools, "Down 1cm", () => NudgeFloor(-0.01f), UIKit.Mint, UIKit.Ink, 28).Size(95);
            UIKit.Button(floorTools, "Snap floor", SnapFloor, UIKit.Mint, UIKit.Green, 28).Size(95);
            UIKit.Button(floorTools, "Auto on/off", () => { autoFloor = !autoFloor; Toast(autoFloor ? "Floor lock on: the room follows the detected floor." : "Floor lock off: the room stays where it is."); }, UIKit.Mint, UIKit.Ink, 26).Size(95);
            var leave = UIKit.Button(live, "Exit", LeaveRoom, UIKit.Glass, UIKit.White, 40);
            ((RectTransform)leave.transform).Anchor(new Vector2(1, 1), new Vector2(1, 1), new Vector2(1, 1), new Vector2(-30, -280), new Vector2(110, 110));

            // Catalog sheet
            floorSheet = MakeScreen("Floors", new Color(0, 0, 0, 0.35f));
            var fs = UIKit.Panel(floorSheet, "Sheet", UIKit.Cream); fs.rectTransform.Anchor(Vector2.zero, new Vector2(1, 0), new Vector2(0.5f, 0), Vector2.zero, new Vector2(0, 1150));
            floorList = UIKit.Rect(fs.transform, "List").Stretch(50, 40, 50, 40);
            UIKit.Column(floorList, 18);

            catalogSheet = MakeScreen("Catalog", new Color(0, 0, 0, 0.35f));
            var cat = UIKit.Panel(catalogSheet, "Sheet", UIKit.Cream); cat.rectTransform.Anchor(Vector2.zero, new Vector2(1, 0), new Vector2(0.5f, 0), Vector2.zero, new Vector2(0, 1300));
            var catHead = UIKit.Rect(cat.transform, "Head").Anchor(new Vector2(0, 1), Vector2.one, new Vector2(0.5f, 1), new Vector2(0, -24), new Vector2(-60, 90));
            var headText = UIKit.Text(catHead, "Add furniture", 48, UIKit.Ink, FontStyles.Bold); headText.rectTransform.Stretch(0, 0, 200, 0);
            var close = UIKit.Button(catHead, "Close", () => Show(live), UIKit.Mint, UIKit.Ink, 32); ((RectTransform)close.transform).Anchor(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(1, 0.5f), Vector2.zero, new Vector2(180, 90));
            var chipsView = UIKit.Rect(cat.transform, "Categories").Anchor(new Vector2(0, 1), Vector2.one, new Vector2(0.5f, 1), new Vector2(0, -130), new Vector2(-60, 100));
            chipsView.gameObject.AddComponent<RectMask2D>();
            var chipScroll = chipsView.gameObject.AddComponent<ScrollRect>(); chipScroll.vertical = false;
            categoryRow = UIKit.Rect(chipsView, "Row"); categoryRow.anchorMin = new Vector2(0, 0); categoryRow.anchorMax = new Vector2(0, 1); categoryRow.pivot = new Vector2(0, 0.5f);
            var chipLayout = categoryRow.gameObject.AddComponent<HorizontalLayoutGroup>(); chipLayout.spacing = 12; chipLayout.childControlWidth = true; chipLayout.childControlHeight = true; chipLayout.childForceExpandHeight = true;
            var chipFit = categoryRow.gameObject.AddComponent<ContentSizeFitter>(); chipFit.horizontalFit = ContentSizeFitter.FitMode.PreferredSize;
            chipScroll.content = categoryRow; chipScroll.viewport = chipsView;
            var gridHost = UIKit.Rect(cat.transform, "Grid").Stretch(30, 250, 30, 30);
            catalogGrid = UIKit.Scroll(gridHost, out _);
            var grid = catalogGrid.gameObject.AddComponent<GridLayoutGroup>(); grid.cellSize = new Vector2(320, 360); grid.spacing = new Vector2(20, 20); grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount; grid.constraintCount = 3;
            catalogGrid.Fit();
            ((RectTransform)gridHost.GetChild(0)).Stretch();

            // Room edit sheet (live)
            editSheet = MakeScreen("Edit room", Color.clear);
            var es = UIKit.Panel(editSheet, "Sheet", UIKit.Cream); es.rectTransform.Anchor(Vector2.zero, new Vector2(1, 0), new Vector2(0.5f, 0), Vector2.zero, new Vector2(0, 1150));
            var esHead = UIKit.Rect(es.transform, "Head").Anchor(new Vector2(0, 1), Vector2.one, new Vector2(0.5f, 1), new Vector2(0, -20), new Vector2(-60, 110));
            var esRow = esHead.gameObject.AddComponent<HorizontalLayoutGroup>(); esRow.spacing = 16; esRow.childControlWidth = true; esRow.childControlHeight = true; esRow.childForceExpandWidth = true; esRow.childForceExpandHeight = true;
            UIKit.Text(esHead, "Adjust room", 46, UIKit.Ink, FontStyles.Bold, TextAlignmentOptions.MidlineLeft);
            UIKit.Button(esHead, "Done", () => { ApplyRoomEdit(liveEditor.Room); Show(live); }, UIKit.Green, UIKit.White, 34);
            var esHost = UIKit.Rect(es.transform, "Editor").Stretch(0, 140, 0, 0);
            liveEditor = PlanEditor.Create(esHost);
            liveEditor.Changed += r => roomView.Show(r);

            // Busy overlay & toast
            busy = MakeScreen("Busy", new Color(0.05f, 0.1f, 0.09f, 0.7f));
            busyText = UIKit.Text(busy, "", 44, UIKit.White, FontStyles.Bold, TextAlignmentOptions.Center); busyText.rectTransform.Stretch(80, 0, 80, 0);
            var toastBg = UIKit.Panel(root, "Toast", new Color(0.1f, 0.15f, 0.14f, 0.92f)); toastBg.rectTransform.Anchor(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -380), new Vector2(940, 170));
            toastBg.raycastTarget = false;
            toast = UIKit.Text(toastBg.transform, "", 32, UIKit.White, FontStyles.Normal, TextAlignmentOptions.Center); toast.rectTransform.Stretch(30, 10, 30, 10);
            toastBg.gameObject.SetActive(false);
        }

        RectTransform MakeScreen(string name, Color bg)
        {
            var rt = UIKit.Rect(canvas.transform, name).Stretch();
            if (bg.a > 0) { var img = rt.gameObject.AddComponent<Image>(); img.color = bg; }
            rt.gameObject.SetActive(false);
            return rt;
        }

        void Show(RectTransform screen, bool overlay = false)
        {
            foreach (var s in new[] { home, join, scanScreen, review, align, live, busy, catalogSheet, editSheet, floorSheet })
                if (s != null && !(overlay && s == live)) s.gameObject.SetActive(s == screen);
            if (overlay) live.gameObject.SetActive(true);
            // Opaque screens hide the AR view; everything else shows the camera.
            bool arVisible = screen != home && screen != join;
            arCamera.enabled = true;
            interaction.mode = screen == live ? ARInteraction.Mode.Furniture : alignStep == AlignStep.Manual && screen == align ? ARInteraction.Mode.MoveRoom : ARInteraction.Mode.Off;
            reticle.gameObject.SetActive(arVisible && (screen == scanScreen || screen == align));
            if (screen == live) RefreshLive();
        }

        void Toast(string text, float seconds = 3.5f)
        {
            toast.text = text; toast.transform.parent.gameObject.SetActive(true);
            CancelInvoke(nameof(HideToast)); Invoke(nameof(HideToast), seconds);
        }
        void HideToast() => toast.transform.parent.gameObject.SetActive(false);
        void Busy(string text) { busyText.text = text; busy.gameObject.SetActive(true); }
        void Unbusy() => busy.gameObject.SetActive(false);

        void RefreshHome()
        {
            var last = PlayerPrefs.GetString(LastRoomKey, "");
            continueButton.gameObject.SetActive(!string.IsNullOrEmpty(last));
            homeContinueLabel.text = $"Continue room {RoomCode.Format(last)}";
            capability.text = Application.isEditor ? "Editor preview - run on a phone for AR." : "Works on every ARCore / ARKit phone. Depth sensing and LiDAR are used automatically when available.";
        }

        // ------------------------------------------------------------------ scanning
        void StartScan(bool newFloor)
        {
            addingFloor = newFloor && house != null;
            if (!addingFloor) { Disconnect(); house = null; baseRoom = null; }
            roomView.gameObject.SetActive(false);
            cornerMode = false; lastScan = null;
            scanner.BeginFloor();
            Show(scanScreen);
        }

        void CancelScan()
        {
            scanner.Stop();
            if (addingFloor && house != null) { addingFloor = false; EnterLevel(level); roomView.gameObject.SetActive(true); roomView.Show(room); Show(live); }
            else { RefreshHome(); Show(home); }
        }

        void UpdateScanUI()
        {
            bool floor = scanner.phase == ScanCapture.Phase.FindFloor, capture = scanner.phase == ScanCapture.Phase.Capture;
            scanTitle.text = floor ? (scanner.FloorReady ? "Floor found" : "Find the floor") : cornerMode ? "Tap each corner" : $"Scanning | {scanner.Method switch { "lidar-mesh" => "LiDAR", "depth" => "Depth", _ => "Standard" }}";
            scanHint.text = floor ? (scanner.FloorReady ? "Tap Start, then walk slowly around the room sweeping every wall from floor to ceiling." : scanner.Hint)
                : cornerMode ? $"Aim the dot at a floor corner and tap Add corner ({scanner.manualCorners.Count} added). Go around the room in order." : scanner.Hint;
            startCaptureButton.gameObject.SetActive(floor);
            startCaptureButton.interactable = scanner.FloorReady;
            finishButton.gameObject.SetActive(capture);
            finishButton.interactable = cornerMode ? scanner.manualCorners.Count >= 3 : scanner.WallLineCount >= 3;
            scanCornerTools.gameObject.SetActive(capture && cornerMode);
        }

        void UpdateReticle()
        {
            bool show = (scanScreen.gameObject.activeSelf && (cornerMode || scanner.phase == ScanCapture.Phase.FindFloor)) || (align.gameObject.activeSelf && (alignStep == AlignStep.TapA || alignStep == AlignStep.TapB));
            reticle.gameObject.SetActive(show);
            if (!show) return;
            bool hit = scanner.FloorPoint(new Vector2(UnityEngine.Screen.width / 2f, UnityEngine.Screen.height / 2f), out _);
            reticle.color = hit ? UIKit.Amber : new Color(1, 1, 1, 0.6f);
            reticle.rectTransform.anchorMin = reticle.rectTransform.anchorMax = new Vector2(0.5f, 0.5f); reticle.rectTransform.anchoredPosition = Vector2.zero;
        }

        async void FinishScan()
        {
            Busy("Building your floor plan...");
            try
            {
                var result = await scanner.FinishAsync(cornerMode);
                if (!result.ok) { Unbusy(); Toast(result.message, 5); scanner.Resume(); return; }
                lastScan = result;
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var scanned = ScanToRoom.Build(result, "LOCAL000", "Scanned room", t => { var d = Catalog.Get(t); return (d.w, d.h, d.d, d.color); }, () => Guid.NewGuid().ToString(), now);
                scanned.scan = new Dictionary<string, object> { ["method"] = cornerMode ? "corners" : scanner.Method, ["platform"] = Application.platform.ToString(), ["confidence"] = Math.Round(result.confidence, 2), ["app"] = Application.version };
                room = scanned;
                PlaceRoomAt(new Pose2(result.originX, result.originZ, result.yaw), (float)result.floorY);
                roomView.Show(room);
                scanner.Stop();
                Unbusy();
                nameInput.text = addingFloor ? $"Floor {Floors.Count(house)}" : "";
                saveScanButton.SetLabel(addingFloor ? $"Add to {RoomCode.Format(house.roomId)}" : "Save & get code");
                reviewEditor.Edit(room);
                Show(review);
                Toast(result.ceilingEstimated ? $"{result.message} Ceiling height estimated - adjust it below." : result.message, 5);
            }
            catch (Exception e) { Unbusy(); Toast("Scan failed: " + e.Message, 5); Debug.LogException(e); }
        }

        async Task SaveScan()
        {
            var edited = reviewEditor.Room;
            if (addingFloor)
            {
                // A new floor of the same project: append it and save with the usual merge.
                try
                {
                    var next = house.Clone();
                    int index = Floors.Add(next, edited, nameInput.text.Trim(), false, Guid.NewGuid().ToString("N").Substring(0, 12));
                    house = next; EnterLevel(index); addingFloor = false;
                    Show(live);
                    MarkDirty();
                    await Save();
                    Toast($"{Floors.Name(house, level)} added to {RoomCode.Format(house.roomId)}. Check its height above the floor below on the website.", 7);
                }
                catch (Exception e) { Toast(e.Message, 6); }
                return;
            }
            edited.name = string.IsNullOrWhiteSpace(nameInput.text) ? $"Room {DateTime.Now:MMM d}" : nameInput.text.Trim();
            Busy("Saving your room...");
            try
            {
                var obj = lastScan != null ? ScanCapture.ExportCloudObj(scanner.grid, lastScan) : null;
                var created = await CloudService.Create(edited, edited.scan, obj);
                house = created.Clone(); baseRoom = created.Clone(); dirty = false; EnterLevel(0);
                PlayerPrefs.SetString(LastRoomKey, room.roomId); PlayerPrefs.Save();
                Connect();
                Unbusy();
                Show(live);
                Toast($"Saved! Room code {RoomCode.Format(room.roomId)}. Open it on the website to redesign - tap Share code to send it.", 7);
            }
            catch (Exception e) { Unbusy(); Toast(CloudService.Friendly(e), 6); }
        }

        // ------------------------------------------------------------------ joining & alignment
        async void Join(string input)
        {
            var code = RoomCode.Normalize(input);
            if (code == null) { joinError.text = "Enter the 8-character code, for example ABCD-EFGH."; return; }
            Busy("Opening room...");
            try
            {
                Disconnect();
                var loaded = await CloudService.Load(code);
                house = loaded.Clone(); baseRoom = loaded.Clone(); dirty = false;
                var draft = LoadDraft(code);
                if (draft != null && draft.revision == loaded.revision && RoomMerge.HasChanges(draft, loaded)) { house = draft; dirty = true; Toast("Restored changes you hadn't saved yet."); }
                else if (draft != null && RoomMerge.HasChanges(draft, loaded)) { house = RoomMerge.Merge(DraftBase(code) ?? loaded, draft, loaded); dirty = true; Toast("Merged your unsaved changes with the latest version."); }
                EnterLevel(0);
                PlayerPrefs.SetString(LastRoomKey, code); PlayerPrefs.Save();
                Connect();
                Unbusy();
                StartAlign(true);
            }
            catch (Exception e) { Unbusy(); joinError.text = CloudService.Friendly(e); if (!join.gameObject.activeSelf) Toast(CloudService.Friendly(e), 6); }
        }

        void StartAlign(bool fresh)
        {
            alignStep = AlignStep.None; registration = null;
            roomView.Show(room);
            if (fresh) roomView.gameObject.SetActive(false);
            scanner.BeginFloor();
            Show(align);
        }

        void UpdateAlignUI()
        {
            flipButton.gameObject.SetActive(alignStep == AlignStep.Smart && registration != null && registration.ok);
            smartAlignDoneButton.gameObject.SetActive(roomView.gameObject.activeSelf && alignStep != AlignStep.TapA && alignStep != AlignStep.TapB);
            alignTapButton.gameObject.SetActive(alignStep == AlignStep.TapA || alignStep == AlignStep.TapB);
            alignMap.gameObject.SetActive(alignStep == AlignStep.TapA || alignStep == AlignStep.TapB);
            if (alignMap.gameObject.activeSelf) { markerA.color = alignStep == AlignStep.TapA ? UIKit.Amber : UIKit.Green; markerB.color = UIKit.Amber; }
            if (!scanner.FloorReady && alignStep != AlignStep.Manual) { alignHint.text = $"{room.name}\nPoint at the floor to begin..."; return; }
            switch (alignStep)
            {
                case AlignStep.None: alignHint.text = $"{room.name} | {RoomCode.Format(room.roomId)}\nPlace the plan in your space: Smart align (walk along 2-3 walls), tap two corners, or place it by hand."; break;
                case AlignStep.Smart:
                    if (registration == null) alignHint.text = $"Smart align: walk along two or three walls... ({scanner.WallLineCount} found)";
                    else alignHint.text = registration.ok ? "Matched! Check the outline lines up with your walls." : "Couldn't match yet - keep scanning or use Tap 2 corners.";
                    if (registration == null && scanner.WallLineCount >= 3 && Time.unscaledTime > nextRegistration) _ = TryRegister();
                    break;
                case AlignStep.TapA: alignHint.text = "Aim the dot at the corner shown in gold and tap Mark corner."; break;
                case AlignStep.TapB: alignHint.text = "Now aim at the second gold corner and tap Mark corner."; break;
                case AlignStep.Manual: alignHint.text = "Drag to move the room, twist with two fingers to rotate. Tap Done when it fits."; break;
            }
        }
        float nextRegistration;

        void BeginSmartAlign()
        {
            if (!scanner.FloorReady) { Toast("Point at the floor first."); return; }
            alignStep = AlignStep.Smart; registration = null; nextRegistration = Time.unscaledTime + 4;
            scanner.BeginCapture();
            Show(align);
        }

        async Task TryRegister()
        {
            nextRegistration = Time.unscaledTime + 4;
            var snapshot = scanner.grid.Snapshot();
            var scan = await Task.Run(() => RoomReconstructor.Reconstruct(snapshot));
            if (alignStep != AlignStep.Smart || !scan.ok) return;
            var saved = room.floor.Select(Alignment.LocalOf).ToList();
            var world = scan.polygon.Select(scan.ToWorld).ToList();
            var reg = await Task.Run(() => Alignment.Register(saved, world));
            if (alignStep != AlignStep.Smart) return;
            if (!reg.ok) return;
            registration = reg; alternativeIndex = 0;
            PlaceRoomAt(reg.pose, scanner.FloorY ?? 0);
            roomView.Show(room);
        }

        void FlipAlignment()
        {
            if (registration == null) return;
            var options = new List<Pose2> { registration.pose };
            options.AddRange(registration.alternatives);
            if (options.Count == 1)
            {
                // Symmetric rooms: also offer the outline rotated 180° about its centre.
                var p = registration.pose;
                double cx = (room.floor.Min(v => v.x) + room.floor.Max(v => v.x)) / 2, cz = (room.floor.Min(v => v.z) + room.floor.Max(v => v.z)) / 2;
                var c = Alignment.LocalOf(new V3(cx, 0, cz));
                var world = Geo.Rot(c, p.yaw).Add(p.x, p.z);
                double yaw = Alignment.Normalize(p.yaw + Math.PI); var rc = Geo.Rot(c, yaw);
                options.Add(new Pose2(world.x - rc.x, world.z - rc.z, yaw));
            }
            alternativeIndex = (alternativeIndex + 1) % options.Count;
            PlaceRoomAt(options[alternativeIndex], scanner.FloorY ?? 0);
        }

        int alignCornerA, alignCornerB;
        void BeginTapAlign()
        {
            if (!scanner.FloorReady) { Toast("Point at the floor first."); return; }
            // The longest wall's corners are the easiest to find.
            int best = 0; double len = 0;
            for (int i = 0; i < room.floor.Count; i++) { var a = room.floor[i]; var b = room.floor[(i + 1) % room.floor.Count]; double l = Math.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)); if (l > len) { len = l; best = i; } }
            alignCornerA = best; alignCornerB = (best + 1) % room.floor.Count;
            alignStep = AlignStep.TapA;
            Toast($"Find the two ends of the longest wall ({len:0.0} m). The minimap shows them in gold.", 5);
            ShowAlignMinimap();
            Show(align);
        }
        void ShowAlignMinimap()
        {
            const float size = 340;
            double minX = room.floor.Min(v => v.x), maxX = room.floor.Max(v => v.x), minZ = room.floor.Min(v => v.z), maxZ = room.floor.Max(v => v.z);
            float s = (float)(size * 0.85 / Math.Max(1, Math.Max(maxX - minX, maxZ - minZ)));
            double cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
            Vector2 Project(V3 v) => new Vector2((float)(v.x - cx) * s, (float)(-(v.z - cz)) * s);
            alignGraphic.room = room; alignGraphic.project = Project; alignGraphic.Scale = s; alignGraphic.SetVerticesDirty();
            markerA.rectTransform.anchoredPosition = Project(room.floor[alignCornerA]);
            markerB.rectTransform.anchoredPosition = Project(room.floor[alignCornerB]);
        }

        void MarkAlignCorner()
        {
            if (!scanner.FloorPoint(new Vector2(UnityEngine.Screen.width / 2f, UnityEngine.Screen.height / 2f), out var p)) { Toast("Aim the dot at the floor."); return; }
            if (alignStep == AlignStep.TapA) { tapA = p; alignStep = AlignStep.TapB; return; }
            var pose = Alignment.TwoPoint(Alignment.LocalOf(room.floor[alignCornerA]), Alignment.LocalOf(room.floor[alignCornerB]), new P2(tapA.x, tapA.z), new P2(p.x, p.z));
            alignStep = AlignStep.None;
            PlaceRoomAt(pose, scanner.FloorY ?? p.y);
            roomView.Show(room);
            Toast("Aligned. Fine-tune with Place by hand if needed.");
        }

        void BeginManualAlign()
        {
            alignStep = AlignStep.Manual;
            if (!roomView.gameObject.activeSelf)
            {
                var cam = arCamera.transform; var fwd = Vector3.ProjectOnPlane(cam.forward, Vector3.up).normalized; if (fwd.sqrMagnitude < 0.01f) fwd = Vector3.forward;
                var c = cam.position + fwd * 2.5f; double cx = (room.floor.Min(v => v.x) + room.floor.Max(v => v.x)) / 2, cz = (room.floor.Min(v => v.z) + room.floor.Max(v => v.z)) / 2;
                var center = Alignment.LocalOf(new V3(cx, 0, cz));
                double yaw = Math.Atan2(fwd.x, fwd.z);
                var rc = Geo.Rot(center, yaw);
                PlaceRoomAt(new Pose2(c.x - rc.x, c.z - rc.z, yaw), scanner.FloorY ?? cam.position.y - 1.4f);
                roomView.Show(room);
            }
            Show(align);
        }

        void FinishAlign()
        {
            scanner.Stop();
            alignStep = AlignStep.None;
            _ = AnchorRoom();
            Show(live);
        }

        void PlaceRoomAt(Pose2 pose, float floorY)
        {
            if (anchor != null) { roomView.transform.SetParent(null, true); Destroy(anchor.gameObject); anchor = null; }
            roomView.transform.SetPositionAndRotation(new Vector3((float)pose.x, floorY, (float)pose.z), Quaternion.Euler(0, (float)(pose.yaw * Mathf.Rad2Deg), 0));
            roomView.gameObject.SetActive(true);
        }

        /// <summary>Locks the room to an AR anchor so it stays put as tracking improves.</summary>
        async Task AnchorRoom()
        {
            if (anchorManager == null || !anchorManager.enabled) return;
            try
            {
                var result = await anchorManager.TryAddAnchorAsync(new Pose(roomView.transform.position, roomView.transform.rotation));
                if (!result.status.IsSuccess() || result.value == null) return;
                if (anchor != null) Destroy(anchor.gameObject);
                anchor = result.value;
                roomView.transform.SetParent(anchor.transform, true);
            }
            catch (Exception e) { Debug.Log($"RealTweak: anchor not created ({e.Message})"); }
        }

        // ------------------------------------------------------------------ live room
        void Connect()
        {
            listener?.Stop();
            var code = room.roomId;
            listener = CloudService.Listen(code, remote => Post(() => OnRemote(remote)), error => Post(() => Toast(error)));
            nextPresence = 0;
        }
        void Disconnect() { listener?.Stop(); listener = null; }

        void OnRemote(Room remote)
        {
            if (room == null || remote.roomId != room.roomId || saving) return;
            if (baseRoom != null && remote.revision == baseRoom.revision && remote.timestamp == baseRoom.timestamp) return;
            if (house == null) return;
            if (dirty && baseRoom != null) { house = RoomMerge.Merge(baseRoom, house, remote); dirty = RoomMerge.HasChanges(house, remote); Toast("Changes from the website were merged."); }
            else { house = remote.Clone(); Toast("Updated from the website."); }
            baseRoom = remote.Clone();
            EnterLevel(level);
            roomView.Show(room);
            RefreshLive();
            _ = CloudService.ReportPresence(room.roomId, remote.revision);
        }

        void RefreshLive()
        {
            if (room == null) return;
            liveTitle.text = Floors.Count(house) > 1 ? $"{room.name} | {Floors.Name(house, level)} | {RoomCode.Format(room.roomId)}" : $"{room.name}  |  {RoomCode.Format(room.roomId)}";
            liveStatus.text = saving ? "Saving..." : dirty ? "Unsaved changes" : $"Synced | revision {baseRoom?.revision ?? 0} | {room.furniture.Count} objects";
            saveButton.interactable = dirty && !saving;
            saveButton.SetLabel(saving ? "Saving" : dirty ? "Save" : "Saved");
            RefreshSelection();
        }

        void RefreshSelection()
        {
            var item = room?.furniture.FirstOrDefault(f => f.id == roomView.SelectedId);
            selectionBar.gameObject.SetActive(item != null && live.gameObject.activeSelf && !catalogSheet.gameObject.activeSelf);
            if (item != null) selectionName.text = item.label ?? Catalog.Get(item.type).name;
        }

        void MarkDirty() { house = Floors.With(house, level, room); dirty = true; SaveDraft(); roomView.Show(room); RefreshLive(); }

        void EnterLevel(int i)
        {
            level = Mathf.Clamp(i, 0, Floors.Count(house) - 1);
            room = Floors.View(house, level);
            roomView.floorAbove = Floors.Above(house, level) >= 0;
            if (roomView.gameObject.activeSelf) roomView.Show(room);
        }

        /// <summary>The largest horizontal plane well below the camera: the floor the user stands on.</summary>
        bool DetectedFloor(out float y)
        {
            y = 0; ARPlane best = null;
            if (planeManager == null) return false;
            float camY = arCamera.transform.position.y;
            foreach (var p in planeManager.trackables)
            {
                if (p.alignment != UnityEngine.XR.ARSubsystems.PlaneAlignment.HorizontalUp || p.size.x * p.size.y < 0.5f || p.center.y > camY - 0.6f) continue;
                if (best == null || p.size.x * p.size.y > best.size.x * best.size.y) best = p;
            }
            if (best == null) return false;
            y = best.center.y; return true;
        }

        void FloorLock()
        {
            if (floorLockLabel != null) floorLockLabel.text = $"FLOOR\n{(autoFloor ? "auto" : "manual")} {(floorOffset >= 0 ? "+" : "")}{floorOffset * 100:0} cm";
            if (!autoFloor || !roomView.gameObject.activeSelf || Time.unscaledTime < nextFloorCheck) return;
            nextFloorCheck = Time.unscaledTime + 1f;
            if (!DetectedFloor(out float y)) return;
            var pos = roomView.transform.position;
            float diff = y + floorOffset - pos.y;
            // Follow small refinements smoothly; ignore big jumps (another floor level or a bad plane).
            if (Mathf.Abs(diff) < 0.008f || Mathf.Abs(diff) > 0.35f) return;
            roomView.transform.position = new Vector3(pos.x, pos.y + diff * 0.6f, pos.z);
        }

        void NudgeFloor(float delta)
        {
            floorOffset += delta;
            var pos = roomView.transform.position;
            roomView.transform.position = new Vector3(pos.x, pos.y + delta, pos.z);
        }

        void SnapFloor()
        {
            if (!DetectedFloor(out float y)) { Toast("Point the phone at the floor for a moment, then try again."); return; }
            floorOffset = 0;
            var pos = roomView.transform.position;
            roomView.transform.position = new Vector3(pos.x, y, pos.z);
            Toast("Room snapped to the detected floor.");
        }

        void RaiseSelected(float delta)
        {
            var item = room.furniture.FirstOrDefault(f => f.id == roomView.SelectedId); if (item == null) return;
            double y = Math.Max(room.floorCenter.y - 0.5, item.position.y + delta);
            item.position = new V3(item.position.x, Math.Round(y, 3), item.position.z);
            item.timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            MarkDirty();
            Toast($"Height above floor: {(item.position.y - room.floorCenter.y) * 100:0} cm", 1.5f);
        }

        void OpenFloors()
        {
            foreach (Transform c in floorList) Destroy(c.gameObject);
            UIKit.Text(floorList, "Floors and plans", 48, UIKit.Ink, FontStyles.Bold).Size(80);
            UIKit.Text(floorList, "Pick the floor you are standing on. You'll place it in your space again.", 30, UIKit.Muted).Size(80);
            for (int i = 0; i < Floors.Count(house); i++)
            {
                int index = i;
                string label = Floors.Separate(house, i) ? $"{Floors.Name(house, i)}  (separate plan)" : $"{Floors.Name(house, i)}  (+{Floors.Elevation(house, i):0.00} m)";
                UIKit.Button(floorList, label, () => SwitchFloor(index), i == level ? UIKit.Green : UIKit.White, i == level ? UIKit.White : UIKit.Ink, 36).Size(130);
            }
            if (Floors.Count(house) < Floors.Max)
                UIKit.Button(floorList, "+ Scan a new floor", () => StartScan(true), UIKit.Mint, UIKit.Green, 36).Size(130);
            UIKit.Button(floorList, "Close", () => Show(live), UIKit.Cream, UIKit.Muted, 34).Size(110);
            Show(floorSheet, overlay: true);
        }

        void SwitchFloor(int index)
        {
            if (index == level) { Show(live); return; }
            roomView.Select(null);
            EnterLevel(index);
            Toast($"{Floors.Name(house, level)}: place it in your space.");
            StartAlign(false);
        }

        void OnItemMoved(string id)
        {
            var item = room.furniture.FirstOrDefault(f => f.id == id); var view = roomView.ViewOf(id);
            if (item == null || view == null) return;
            ARInteraction.ApplyToItem(roomView, view, item);
            MarkDirty();
        }
        void RotateSelected(float degrees)
        {
            var item = room.furniture.FirstOrDefault(f => f.id == roomView.SelectedId); if (item == null) return;
            item.Yaw = Alignment.Normalize(item.Yaw + degrees * Mathf.Deg2Rad);
            item.timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            MarkDirty();
        }
        void DuplicateSelected()
        {
            var item = room.furniture.FirstOrDefault(f => f.id == roomView.SelectedId); if (item == null) return;
            if (room.furniture.Count >= 300) { Toast("Room limit: 300 objects."); return; }
            var copy = item.Clone(); copy.id = Guid.NewGuid().ToString(); copy.source = null;
            copy.position = new V3(item.position.x + 0.3, item.position.y, item.position.z + 0.3); copy.timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            room.furniture.Add(copy); MarkDirty(); roomView.Select(copy.id); RefreshSelection();
        }
        void DeleteSelected()
        {
            room.furniture.RemoveAll(f => f.id == roomView.SelectedId);
            roomView.Select(null); MarkDirty();
        }
        void CycleWalls()
        {
            var next = roomView.wallMode == WallMode.Ghost ? WallMode.Outline : roomView.wallMode == WallMode.Outline ? WallMode.Hidden : WallMode.Ghost;
            roomView.SetWallMode(next);
            Toast(next == WallMode.Ghost ? "Walls: see-through" : next == WallMode.Outline ? "Walls: outline only" : "Walls hidden");
        }
        void ApplyRoomEdit(Room edited)
        {
            if (!RoomMerge.HasChanges(edited, room)) return;
            room.floor = edited.floor; room.walls = edited.walls; room.openings = edited.openings; room.dimensions = edited.dimensions; room.floorCenter = edited.floorCenter; room.furniture = edited.furniture;
            MarkDirty();
        }

        void BuildCatalog()
        {
            foreach (Transform c in categoryRow) Destroy(c.gameObject);
            foreach (var cat in Catalog.Categories.Where(c => Catalog.Items.Any(i => i.category == c)))
            {
                var chip = UIKit.Button(categoryRow, cat, () => { category = cat; BuildCatalog(); }, cat == category ? UIKit.Green : UIKit.White, cat == category ? UIKit.White : UIKit.Ink, 30);
                chip.Size(width: 60 + cat.Length * 20);
            }
            foreach (Transform c in catalogGrid) Destroy(c.gameObject);
            foreach (var item in Catalog.Items.Where(i => i.category == category))
            {
                var card = UIKit.Panel(catalogGrid, item.type, Color.white);
                var btn = card.gameObject.AddComponent<Button>(); var type = item.type;
                btn.onClick.AddListener(() => AddItem(type));
                var icon = UIKit.Rect(card.transform, "Icon").Anchor(new Vector2(0, 1), Vector2.one, new Vector2(0.5f, 1), new Vector2(0, -12), new Vector2(-24, 240));
                var raw = icon.gameObject.AddComponent<RawImage>(); raw.raycastTarget = false;
                raw.texture = IconRenderer.Instance?.Get(type);
                if (raw.texture == null && IconRenderer.Instance != null) IconRenderer.Instance.IconReady += t => { if (t == type && raw) raw.texture = IconRenderer.Instance.Get(type); };
                var label = UIKit.Text(card.transform, item.name, 28, UIKit.Ink, FontStyles.Bold, TextAlignmentOptions.Center);
                label.rectTransform.Anchor(Vector2.zero, new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 50), new Vector2(-20, 60));
                var size = UIKit.Text(card.transform, $"{item.w:0.00} x {item.d:0.00} m", 22, UIKit.Muted, FontStyles.Normal, TextAlignmentOptions.Center);
                size.rectTransform.Anchor(Vector2.zero, new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 14), new Vector2(-20, 36));
            }
        }

        void AddItem(string type)
        {
            if (room.furniture.Count >= 300) { Toast("Room limit: 300 objects."); return; }
            var def = Catalog.Get(type);
            // Drop it on the floor 1.5 m in front of the camera, facing the camera.
            var cam = arCamera.transform; var fwd = Vector3.ProjectOnPlane(cam.forward, Vector3.up).normalized; if (fwd.sqrMagnitude < 0.01f) fwd = Vector3.forward;
            var worldPos = cam.position + fwd * 1.5f;
            var local = roomView.transform.InverseTransformPoint(new Vector3(worldPos.x, roomView.transform.position.y, worldPos.z));
            var faceLocal = roomView.transform.InverseTransformDirection(-fwd);
            double elev = def.mount == "ceiling" ? Math.Max(0, room.dimensions.y - def.h) : def.elev;
            var web = Coords.ToWeb(local, roomView.FloorY);
            var item = new Item
            {
                id = Guid.NewGuid().ToString(), type = type, color = def.color, timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                position = new V3(Math.Round(web.x, 3), roomView.FloorY + elev, Math.Round(web.z, 3)), scale = V3.One,
                rotation = new V3(0, Coords.YawToWeb(Mathf.Atan2(-faceLocal.x, -faceLocal.z) * Mathf.Rad2Deg), 0), // model front (local -Z) faces the camera
            };
            Floors.FitStairs(house, level, item, def.h, def.path != null && def.path.Length >= 6);
            room.furniture.Add(item);
            MarkDirty();
            roomView.Select(item.id);
            Show(live);
            Toast($"{def.name} added. Drag to move, twist to rotate.");
        }

        async Task Save()
        {
            if (saving || room == null || baseRoom == null) return;
            saving = true; RefreshLive();
            var submitted = house.Clone();
            try
            {
                var (saved, merged) = await CloudService.Save(submitted, baseRoom);
                bool editedMeanwhile = RoomMerge.HasChanges(house, submitted);
                house = editedMeanwhile ? RoomMerge.Merge(submitted, house, saved) : saved.Clone();
                baseRoom = saved.Clone(); dirty = editedMeanwhile;
                EnterLevel(level);
                ClearDraft(saved.roomId);
                roomView.Show(room);
                Toast(merged ? "Saved - website changes were merged in." : "Saved. The website shows your changes now.");
                _ = CloudService.ReportPresence(room.roomId, saved.revision);
            }
            catch (Exception e) { Toast(CloudService.Friendly(e), 6); }
            finally { saving = false; RefreshLive(); }
        }

        void LeaveRoom()
        {
            SaveDraft();
            if (room != null) _ = CloudService.LeavePresence(room.roomId);
            Disconnect();
            roomView.gameObject.SetActive(false); roomView.Select(null);
            room = null; house = null; baseRoom = null; dirty = false; level = 0;
            RefreshHome();
            Show(home);
        }

        void ShareCode()
        {
            if (room == null) return;
            string text = $"Open my room in RealTweak: code {RoomCode.Format(room.roomId)} (app or website).";
            GUIUtility.systemCopyBuffer = RoomCode.Format(room.roomId);
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using var intentClass = new AndroidJavaClass("android.content.Intent");
                using var intent = new AndroidJavaObject("android.content.Intent");
                intent.Call<AndroidJavaObject>("setAction", intentClass.GetStatic<string>("ACTION_SEND"));
                intent.Call<AndroidJavaObject>("setType", "text/plain");
                intent.Call<AndroidJavaObject>("putExtra", intentClass.GetStatic<string>("EXTRA_TEXT"), text);
                using var unity = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
                using var activity = unity.GetStatic<AndroidJavaObject>("currentActivity");
                using var chooser = intentClass.CallStatic<AndroidJavaObject>("createChooser", intent, "Share room code");
                activity.Call("startActivity", chooser);
                return;
            }
            catch (Exception e) { Debug.LogWarning(e.Message); }
#endif
            Toast($"Code {RoomCode.Format(room.roomId)} copied to the clipboard.");
        }

        // ------------------------------------------------------------------ unsaved drafts (survive app restarts)
        string DraftPath(string code, string kind) => System.IO.Path.Combine(Application.persistentDataPath, $"draft-{code}-{kind}.json");
        void SaveDraft()
        {
            if (house == null || baseRoom == null || !dirty) return;
            try
            {
                System.IO.File.WriteAllText(DraftPath(room.roomId, "local"), Google.MiniJSON.Json.Serialize(RoomCodec.Patch(house, house.revision, house.timestamp)));
                System.IO.File.WriteAllText(DraftPath(room.roomId, "base"), Google.MiniJSON.Json.Serialize(RoomCodec.Patch(baseRoom, baseRoom.revision, baseRoom.timestamp)));
            }
            catch (Exception e) { Debug.LogWarning($"RealTweak: draft not saved ({e.Message})"); }
        }
        Room ReadDraft(string code, string kind)
        {
            try
            {
                var path = DraftPath(code, kind);
                if (!System.IO.File.Exists(path)) return null;
                return RoomCodec.FromDocument(Google.MiniJSON.Json.Deserialize(System.IO.File.ReadAllText(path)) as Dictionary<string, object>, code);
            }
            catch { return null; }
        }
        Room LoadDraft(string code) => ReadDraft(code, "local");
        Room DraftBase(string code) => ReadDraft(code, "base");
        void ClearDraft(string code)
        {
            foreach (var k in new[] { "local", "base" }) { try { System.IO.File.Delete(DraftPath(code, k)); } catch { } }
        }
    }
}
