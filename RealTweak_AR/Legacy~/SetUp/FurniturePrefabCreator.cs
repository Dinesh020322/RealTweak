using UnityEngine;
using UnityEditor;
 
#if UNITY_EDITOR
public class FurniturePrefabCreator : EditorWindow
{
    private string prefabPath = "Assets/Prefabs/Furniture/";
    
    [MenuItem("Tools/RoomPlan/Create Furniture Prefabs")]
    public static void Init()
    {
        FurniturePrefabCreator window = (FurniturePrefabCreator)EditorWindow.GetWindow(typeof(FurniturePrefabCreator));
        window.titleContent = new GUIContent("Furniture Creator");
        window.Show();
    }
    
    void OnGUI()
    {
        GUILayout.Label("Furniture Prefab Creator", EditorStyles.boldLabel);
        GUILayout.Space(10);
        
        prefabPath = EditorGUILayout.TextField("Prefab Path:", prefabPath);
        GUILayout.Space(10);
        
        if (GUILayout.Button("Create All Furniture Prefabs", GUILayout.Height(30)))
        {
            CreateAllPrefabs();
        }
        
        GUILayout.Space(10);
        GUILayout.Label("Individual Prefabs:", EditorStyles.boldLabel);
        
        if (GUILayout.Button("Create Chair Prefab"))
        {
            CreateChairPrefab();
        }
        
        if (GUILayout.Button("Create Table Prefab"))
        {
            CreateTablePrefab();
        }
        
        if (GUILayout.Button("Create Sofa Prefab"))
        {
            CreateSofaPrefab();
        }
        
        if (GUILayout.Button("Create Bed Prefab"))
        {
            CreateBedPrefab();
        }
    }
    
    void CreateAllPrefabs()
    {
        EnsureDirectoryExists();
        CreateChairPrefab();
        CreateTablePrefab();
        CreateSofaPrefab();
        CreateBedPrefab();
        Debug.Log("All furniture prefabs created!");
    }
    
    void EnsureDirectoryExists()
    {
        if (!AssetDatabase.IsValidFolder(prefabPath))
        {
            string[] folders = prefabPath.Split('/');
            string currentPath = folders[0];
            
            for (int i = 1; i < folders.Length; i++)
            {
                string newPath = currentPath + "/" + folders[i];
                if (!AssetDatabase.IsValidFolder(newPath))
                {
                    AssetDatabase.CreateFolder(currentPath, folders[i]);
                }
                currentPath = newPath;
            }
        }
    }
    
    void CreateChairPrefab()
    {
        GameObject chair = new GameObject("Chair");
        
        // Seat
        GameObject seat = GameObject.CreatePrimitive(PrimitiveType.Cube);
        seat.name = "Seat";
        seat.transform.SetParent(chair.transform);
        seat.transform.localPosition = new Vector3(0, 0.5f, 0);
        seat.transform.localScale = new Vector3(0.5f, 0.1f, 0.5f);
        SetMaterial(seat, new Color(0.55f, 0.27f, 0.07f)); // Brown
        
        // Backrest
        GameObject backrest = GameObject.CreatePrimitive(PrimitiveType.Cube);
        backrest.name = "Backrest";
        backrest.transform.SetParent(chair.transform);
        backrest.transform.localPosition = new Vector3(0, 0.75f, -0.2f);
        backrest.transform.localScale = new Vector3(0.5f, 0.5f, 0.1f);
        SetMaterial(backrest, new Color(0.55f, 0.27f, 0.07f));
        
        // Legs
        for (int i = 0; i < 4; i++)
        {
            GameObject leg = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            leg.name = $"Leg{i + 1}";
            leg.transform.SetParent(chair.transform);
            
            float x = (i % 2 == 0) ? -0.2f : 0.2f;
            float z = (i < 2) ? -0.2f : 0.2f;
            leg.transform.localPosition = new Vector3(x, 0.25f, z);
            leg.transform.localScale = new Vector3(0.06f, 0.25f, 0.06f);
            SetMaterial(leg, new Color(0.4f, 0.2f, 0.05f)); // Dark brown
        }
        
        SavePrefab(chair, "Chair");
    }
    
    void CreateTablePrefab()
    {
        GameObject table = new GameObject("Table");
        
        // Tabletop
        GameObject top = GameObject.CreatePrimitive(PrimitiveType.Cube);
        top.name = "Tabletop";
        top.transform.SetParent(table.transform);
        top.transform.localPosition = new Vector3(0, 0.75f, 0);
        top.transform.localScale = new Vector3(2f, 0.1f, 1f);
        SetMaterial(top, new Color(0.4f, 0.26f, 0.13f)); // Wood brown
        
        // Legs
        for (int i = 0; i < 4; i++)
        {
            GameObject leg = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            leg.name = $"Leg{i + 1}";
            leg.transform.SetParent(table.transform);
            
            float x = (i % 2 == 0) ? -0.9f : 0.9f;
            float z = (i < 2) ? -0.4f : 0.4f;
            leg.transform.localPosition = new Vector3(x, 0.375f, z);
            leg.transform.localScale = new Vector3(0.1f, 0.375f, 0.1f);
            SetMaterial(leg, new Color(0.29f, 0.15f, 0.07f)); // Dark wood
        }
        
        SavePrefab(table, "Table");
    }
    
    void CreateSofaPrefab()
    {
        GameObject sofa = new GameObject("Sofa");
        
        // Base
        GameObject base_obj = GameObject.CreatePrimitive(PrimitiveType.Cube);
        base_obj.name = "Base";
        base_obj.transform.SetParent(sofa.transform);
        base_obj.transform.localPosition = new Vector3(0, 0.25f, 0);
        base_obj.transform.localScale = new Vector3(2f, 0.5f, 0.8f);
        SetMaterial(base_obj, new Color(0.26f, 0.41f, 0.88f)); // Blue
        
        // Backrest
        GameObject backrest = GameObject.CreatePrimitive(PrimitiveType.Cube);
        backrest.name = "Backrest";
        backrest.transform.SetParent(sofa.transform);
        backrest.transform.localPosition = new Vector3(0, 0.6f, -0.3f);
        backrest.transform.localScale = new Vector3(2f, 0.7f, 0.2f);
        SetMaterial(backrest, new Color(0.26f, 0.41f, 0.88f));
        
        // Arms
        for (int i = 0; i < 2; i++)
        {
            GameObject arm = GameObject.CreatePrimitive(PrimitiveType.Cube);
            arm.name = $"Arm{i + 1}";
            arm.transform.SetParent(sofa.transform);
            
            float x = (i == 0) ? -1f : 1f;
            arm.transform.localPosition = new Vector3(x, 0.5f, 0);
            arm.transform.localScale = new Vector3(0.2f, 0.5f, 0.8f);
            SetMaterial(arm, new Color(0.26f, 0.41f, 0.88f));
        }
        
        SavePrefab(sofa, "Sofa");
    }
    
    void CreateBedPrefab()
    {
        GameObject bed = new GameObject("Bed");
        
        // Mattress
        GameObject mattress = GameObject.CreatePrimitive(PrimitiveType.Cube);
        mattress.name = "Mattress";
        mattress.transform.SetParent(bed.transform);
        mattress.transform.localPosition = new Vector3(0, 0.4f, 0);
        mattress.transform.localScale = new Vector3(2f, 0.3f, 1.5f);
        SetMaterial(mattress, new Color(0.86f, 0.08f, 0.24f)); // Red
        
        // Frame
        GameObject frame = GameObject.CreatePrimitive(PrimitiveType.Cube);
        frame.name = "Frame";
        frame.transform.SetParent(bed.transform);
        frame.transform.localPosition = new Vector3(0, 0.25f, 0);
        frame.transform.localScale = new Vector3(2.1f, 0.2f, 1.6f);
        SetMaterial(frame, new Color(0.55f, 0.27f, 0.07f)); // Brown
        
        // Headboard
        GameObject headboard = GameObject.CreatePrimitive(PrimitiveType.Cube);
        headboard.name = "Headboard";
        headboard.transform.SetParent(bed.transform);
        headboard.transform.localPosition = new Vector3(0, 0.8f, -0.75f);
        headboard.transform.localScale = new Vector3(2.2f, 1f, 0.1f);
        SetMaterial(headboard, new Color(0.55f, 0.27f, 0.07f));
        
        SavePrefab(bed, "Bed");
    }
    
    void SetMaterial(GameObject obj, Color color)
    {
        Renderer renderer = obj.GetComponent<Renderer>();
        if (renderer != null)
        {
            Material mat = new Material(Shader.Find("Standard"));
            mat.color = color;
            renderer.material = mat;
        }
    }
    
    void SavePrefab(GameObject obj, string name)
    {
        EnsureDirectoryExists();
        
        string localPath = prefabPath + name + ".prefab";
        
        // Save the GameObject as a prefab
        GameObject prefab = PrefabUtility.SaveAsPrefabAsset(obj, localPath);
        
        // Clean up the scene
        DestroyImmediate(obj);
        
        Debug.Log($"{name} prefab created at: {localPath}");
    }
}

[InitializeOnLoad]
public class RoomPlanSetupHelper
{
    static RoomPlanSetupHelper()
    {
        EditorApplication.update += CheckFirstTimeSetup;
    }
    
    static void CheckFirstTimeSetup()
    {
        EditorApplication.update -= CheckFirstTimeSetup;
        
        string setupKey = "RoomPlan_FirstTimeSetup";
        if (!EditorPrefs.GetBool(setupKey, false))
        {
            bool setup = EditorUtility.DisplayDialog(
                "RoomPlan Setup",
                "Would you like to create the default furniture prefabs now?",
                "Yes", "No"
            );
            
            if (setup)
            {
                FurniturePrefabCreator.Init();
            }
            
            EditorPrefs.SetBool(setupKey, true);
        }
    }
}
#endif
