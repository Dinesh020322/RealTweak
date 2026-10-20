// Small runtime UI toolkit: builds uGUI + TextMeshPro screens from code so the whole app UI lives
// in version-controlled C# (no hand-wired scene objects). Styling matches the RealTweak website.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace RealTweak
{
    public static class UIKit
    {
        public static readonly Color Green = Hex("#285c4e"), GreenDark = Hex("#184938"), Mint = Hex("#e4efe9"), Cream = Hex("#f5f5ef"),
            Ink = Hex("#273a34"), Muted = Hex("#7b847e"), White = Color.white, Danger = Hex("#a34f43"), Glass = new Color(0.08f, 0.13f, 0.12f, 0.72f),
            Amber = Hex("#d9a441");
        static Sprite rounded, circle;

        public static Color Hex(string h) { ColorUtility.TryParseHtmlString(h, out var c); return c; }

        public static Sprite Rounded()
        {
            if (rounded != null) return rounded;
            const int size = 64, r = 24;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = Mathf.Max(0, Mathf.Max(r - x - 0.5f, x + 0.5f - (size - r))), dy = Mathf.Max(0, Mathf.Max(r - y - 0.5f, y + 0.5f - (size - r)));
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    tex.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(r - d + 0.5f)));
                }
            tex.Apply();
            rounded = Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(r, r, r, r));
            return rounded;
        }
        public static Sprite Circle()
        {
            if (circle != null) return circle;
            const int size = 64;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) { float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(size / 2f, size / 2f)); tex.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(size / 2f - d))); }
            tex.Apply();
            circle = Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f));
            return circle;
        }

        public static Canvas Root(string name = "RealTweak UI")
        {
            if (EventSystem.current == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                UnityEngine.Object.DontDestroyOnLoad(es);
            }
            var go = new GameObject(name, typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = go.GetComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay; canvas.sortingOrder = 10;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; scaler.referenceResolution = new Vector2(1080, 1920); scaler.matchWidthOrHeight = 0.5f;
            return canvas;
        }

        public static RectTransform Rect(Transform parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }
        public static RectTransform Stretch(this RectTransform rt, float left = 0, float top = 0, float right = 0, float bottom = 0)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = new Vector2(left, bottom); rt.offsetMax = new Vector2(-right, -top); return rt;
        }
        public static RectTransform Anchor(this RectTransform rt, Vector2 min, Vector2 max, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            rt.anchorMin = min; rt.anchorMax = max; rt.pivot = pivot; rt.anchoredPosition = pos; rt.sizeDelta = size; return rt;
        }

        public static Image Panel(Transform parent, string name, Color color, bool roundedCorners = true)
        {
            var rt = Rect(parent, name);
            var img = rt.gameObject.AddComponent<Image>(); img.color = color;
            if (roundedCorners) { img.sprite = Rounded(); img.type = Image.Type.Sliced; img.pixelsPerUnitMultiplier = 1.4f; }
            return img;
        }

        public static TextMeshProUGUI Text(Transform parent, string text, float size, Color color, FontStyles style = FontStyles.Normal, TextAlignmentOptions align = TextAlignmentOptions.Left)
        {
            var rt = Rect(parent, "Text");
            var t = rt.gameObject.AddComponent<TextMeshProUGUI>();
            t.text = text; t.fontSize = size; t.color = color; t.fontStyle = style; t.alignment = align; t.textWrappingMode = TextWrappingModes.Normal; t.raycastTarget = false;
            return t;
        }

        public static Button Button(Transform parent, string label, Action onClick, Color? bg = null, Color? fg = null, float fontSize = 40)
        {
            var img = Panel(parent, $"Button {label}", bg ?? Green);
            var b = img.gameObject.AddComponent<Button>();
            var colors = b.colors; colors.highlightedColor = new Color(0.92f, 0.92f, 0.92f); colors.pressedColor = new Color(0.8f, 0.8f, 0.8f); colors.disabledColor = new Color(1, 1, 1, 0.4f); b.colors = colors;
            var t = Text(img.transform, label, fontSize, fg ?? White, FontStyles.Bold, TextAlignmentOptions.Center);
            t.rectTransform.Stretch(16, 0, 16, 0);
            if (onClick != null) b.onClick.AddListener(() => onClick());
            var le = img.gameObject.AddComponent<LayoutElement>(); le.minHeight = 120; le.preferredHeight = 120;
            return b;
        }
        public static void SetLabel(this Button b, string label) { var t = b.GetComponentInChildren<TextMeshProUGUI>(); if (t) t.text = label; }

        public static TMP_InputField Input(Transform parent, string placeholder, float fontSize = 56)
        {
            var bg = Panel(parent, "Input", White);
            var le = bg.gameObject.AddComponent<LayoutElement>(); le.minHeight = 150; le.preferredHeight = 150;
            var area = Rect(bg.transform, "Text Area").Stretch(30, 10, 30, 10);
            area.gameObject.AddComponent<RectMask2D>();
            var ph = Text(area, placeholder, fontSize, new Color(0.6f, 0.65f, 0.62f), FontStyles.Bold, TextAlignmentOptions.Center); ph.rectTransform.Stretch();
            var txt = Text(area, "", fontSize, Ink, FontStyles.Bold, TextAlignmentOptions.Center); txt.rectTransform.Stretch(); txt.characterSpacing = 12;
            var input = bg.gameObject.AddComponent<TMP_InputField>();
            input.textViewport = area; input.textComponent = txt; input.placeholder = ph; input.targetGraphic = bg;
            input.characterLimit = 64; input.lineType = TMP_InputField.LineType.SingleLine;
            input.keyboardType = TouchScreenKeyboardType.ASCIICapable;
            input.fontAsset = txt.font; input.pointSize = fontSize;
            return input;
        }

        public static VerticalLayoutGroup Column(RectTransform rt, float spacing = 24, int padding = 0, TextAnchor align = TextAnchor.UpperCenter)
        {
            var v = rt.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = spacing; v.padding = new RectOffset(padding, padding, padding, padding); v.childAlignment = align;
            v.childControlWidth = true; v.childControlHeight = true; v.childForceExpandWidth = true; v.childForceExpandHeight = false;
            return v;
        }
        public static HorizontalLayoutGroup Row(Transform parent, float spacing = 20, float height = 120)
        {
            var rt = Rect(parent, "Row");
            var h = rt.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = spacing; h.childControlWidth = true; h.childControlHeight = true; h.childForceExpandWidth = true; h.childForceExpandHeight = true;
            var le = rt.gameObject.AddComponent<LayoutElement>(); le.minHeight = height; le.preferredHeight = height;
            return h;
        }
        public static LayoutElement Size(this Component c, float height = -1, float width = -1, float flexW = -1)
        {
            var le = c.GetComponent<LayoutElement>() ?? c.gameObject.AddComponent<LayoutElement>();
            if (height >= 0) { le.minHeight = height; le.preferredHeight = height; }
            if (width >= 0) { le.minWidth = width; le.preferredWidth = width; }
            if (flexW >= 0) le.flexibleWidth = flexW;
            return le;
        }
        public static ContentSizeFitter Fit(this Component c)
        {
            var f = c.gameObject.AddComponent<ContentSizeFitter>(); f.verticalFit = ContentSizeFitter.FitMode.PreferredSize; return f;
        }

        /// <summary>A vertical scroll view; returns the content transform (with a column layout).</summary>
        public static RectTransform Scroll(Transform parent, out ScrollRect scroll)
        {
            var view = Rect(parent, "Scroll");
            view.gameObject.AddComponent<RectMask2D>();
            var img = view.gameObject.AddComponent<Image>(); img.color = new Color(0, 0, 0, 0);
            scroll = view.gameObject.AddComponent<ScrollRect>();
            var content = Rect(view, "Content");
            content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1); content.sizeDelta = Vector2.zero;
            scroll.content = content; scroll.horizontal = false; scroll.viewport = view; scroll.movementType = ScrollRect.MovementType.Clamped; scroll.scrollSensitivity = 30;
            return content;
        }

        /// <summary>True if a screen position is over any UI element (so AR gestures should ignore it).</summary>
        public static bool OverUI(Vector2 screen)
        {
            if (EventSystem.current == null) return false;
            var data = new PointerEventData(EventSystem.current) { position = screen };
            var results = new System.Collections.Generic.List<RaycastResult>();
            EventSystem.current.RaycastAll(data, results);
            return results.Count > 0;
        }
    }
}
