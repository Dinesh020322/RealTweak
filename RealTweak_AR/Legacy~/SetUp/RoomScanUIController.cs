using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections;
 
public class RoomScanUIController : MonoBehaviour
{
    [Header("UI References")]
    public Button startScanButton;
    public Button stopScanButton;
    public Button uploadButton;
    public Button ReceiveButton;
    public TextMeshProUGUI statusText;
    public TextMeshProUGUI timerText;
    public TextMeshProUGUI roomIdText;
    public string CurrentRoomID = "";
    public Slider progressSlider;
    public GameObject scanningPanel;
    public GameObject resultsPanel;
    public TextMeshProUGUI wallCountText;
    public TextMeshProUGUI floorAreaText;
    public TextMeshProUGUI dimensionsText;
    
    [Header("Scanner References")]
    public RoomScanner roomScanner;
    public FirebaseManager firebaseManager;
    
    private bool isScanning = false;
    private float scanStartTime;
    
    void Start()
    {
        SetupUI();
        ShowScanningPanel(true);
        ShowResultsPanel(false);
    }
    
    void SetupUI()
    {
        if (startScanButton != null)
        {
            startScanButton.onClick.AddListener(OnStartScanClicked);
        }
        
        if (stopScanButton != null)
        {
            stopScanButton.onClick.AddListener(OnStopScanClicked);
            stopScanButton.interactable = false;
        }
        
        if (uploadButton != null)
        {
            uploadButton.onClick.AddListener(OnUploadClicked);
            uploadButton.interactable = false;
        }
        
        if (ReceiveButton != null)
        {
            ReceiveButton.onClick.AddListener(ReceiveData);
        }
        
        UpdateStatus("Ready to scan. Tap Start Scan to begin.");
    }
    
    void Update()
    {
        if (isScanning)
        {
            UpdateScanTimer();
            UpdateProgress();
        }
    }
    
    void OnStartScanClicked()
    {
        if (roomScanner != null)
        {
            roomScanner.StartScanning();
            isScanning = true;
            scanStartTime = Time.time;
            
            startScanButton.interactable = false;
            stopScanButton.interactable = true;
            
            UpdateStatus("Scanning... Move your device around the room");
            ShowScanningPanel(true);
            ShowResultsPanel(false);
        }
    }

    async void ReceiveData()
    {
        if (firebaseManager != null)
        {
            await firebaseManager.LoadRoomData(CurrentRoomID);
            UpdateStatus("Receiving data for Room ID: " + CurrentRoomID);
        }
    }
    
    void OnStopScanClicked()
    {
        if (roomScanner != null)
        {
            roomScanner.StopScanning();
            isScanning = false;
            
            startScanButton.interactable = true;
            stopScanButton.interactable = false;
            uploadButton.interactable = true;
            
            UpdateStatus("Scan complete! Review the results below.");
            DisplayScanResults();
        }
    }
    
    void OnUploadClicked()
    {
        if (firebaseManager != null && roomScanner != null)
        {
            RoomScanner.RoomData roomData = roomScanner.GetCurrentRoomData();
            firebaseManager.UploadRoomData(roomData);
            
            UpdateStatus("Uploading to Firebase...");
            uploadButton.interactable = false;
            
            StartCoroutine(UploadComplete());
        }
    }
    
    IEnumerator UploadComplete()
    {
        yield return new WaitForSeconds(2f);
        UpdateStatus("Upload complete! Room ID: " + roomScanner.GetCurrentRoomData().roomId);
        uploadButton.interactable = true;
    }
    
    void UpdateScanTimer()
    {
        float elapsed = Time.time - scanStartTime;
        int minutes = Mathf.FloorToInt(elapsed / 60f);
        int seconds = Mathf.FloorToInt(elapsed % 60f);
        
        if (timerText != null)
        {
            timerText.text = string.Format("Time: {0:00}:{1:00}", minutes, seconds);
        }
    }
    
    void UpdateProgress()
    {
        if (progressSlider != null && roomScanner != null)
        {
            float progress = Mathf.Clamp01(
                (Time.time - scanStartTime) / roomScanner.scanDuration
            );
            progressSlider.value = progress;
        }
    }
    
    void DisplayScanResults()
    {
        ShowResultsPanel(true);
        
        RoomScanner.RoomData roomData = roomScanner.GetCurrentRoomData();
        
        if (roomData != null)
        {
            if (wallCountText != null)
            {
                wallCountText.text = $"Walls: {roomData.walls.Count}";
            }
            
            if (floorAreaText != null)
            {
                floorAreaText.text = $"Area: {roomData.floor.area:F2} m²";
            }
            
            if (dimensionsText != null)
            {
                dimensionsText.text = $"Dimensions: {roomData.roomDimensions.x:F2}m × " +
                                     $"{roomData.roomDimensions.y:F2}m × " +
                                     $"{roomData.roomDimensions.z:F2}m";
            }
            
            if (roomIdText != null)
            {
                roomIdText.text = $"Room ID: {roomData.roomId}";
                CurrentRoomID  = roomData.roomId;
            }
        }
    }
    
    void UpdateStatus(string message)
    {
        if (statusText != null)
        {
            statusText.text = message;
        }
        Debug.Log($"[RoomScan] {message}");
    }
    
    void ShowScanningPanel(bool show)
    {
        if (scanningPanel != null)
        {
            scanningPanel.SetActive(show);
        }
    }
    
    void ShowResultsPanel(bool show)
    {
        if (resultsPanel != null)
        {
            resultsPanel.SetActive(show);
        }
    }
    
    public void OnFurnitureUpdated(string furnitureType, Vector3 position)
    {
        UpdateStatus($"Furniture updated: {furnitureType} at {position}");
    }
}
