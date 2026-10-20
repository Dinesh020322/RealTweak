// Touch gestures in AR: tap to select furniture, drag to slide it along the floor, twist two fingers
// to rotate. In placement mode the same gestures move/rotate the whole room overlay.
using System;
using RealTweak.Core;
using UnityEngine;
using UnityEngine.InputSystem.EnhancedTouch;
using ETouch = UnityEngine.InputSystem.EnhancedTouch.Touch;

namespace RealTweak
{
    public class ARInteraction : MonoBehaviour
    {
        public Camera arCamera;
        public RoomView roomView;
        public enum Mode { Off, Furniture, MoveRoom }
        public Mode mode = Mode.Off;
        /// <summary>Raised when an item was moved/rotated (id) — the app writes it into the room model.</summary>
        public event Action<string> ItemChanged;
        public event Action<string> SelectionChanged;
        public event Action RoomMoved;

        FurnitureView dragging; Vector3 dragOffset; bool moved; float startAngle, startYaw; bool twisting;
        Vector2 downPos; float downTime;

        void OnEnable() { EnhancedTouchSupport.Enable(); }

        Plane FloorPlane => new Plane(Vector3.up, roomView.transform.position);

        bool FloorHit(Vector2 screen, out Vector3 point)
        {
            point = default;
            var ray = arCamera.ScreenPointToRay(screen);
            if (!FloorPlane.Raycast(ray, out float d) || d > 20) return false;
            point = ray.GetPoint(d); return true;
        }

        void Update()
        {
            if (mode == Mode.Off || arCamera == null || roomView == null) return;
            var touches = ETouch.activeTouches;
            if (touches.Count == 0) { if (dragging != null || twisting) Finish(); return; }
            var t0 = touches[0];
            if (t0.phase == UnityEngine.InputSystem.TouchPhase.Began)
            {
                if (UIKit.OverUI(t0.screenPosition)) { dragging = null; twisting = false; downTime = -1; return; }
                downPos = t0.screenPosition; downTime = Time.unscaledTime; moved = false;
                if (mode == Mode.Furniture)
                {
                    dragging = Pick(t0.screenPosition);
                    if (dragging != null && dragging.id != roomView.SelectedId) { roomView.Select(dragging.id); SelectionChanged?.Invoke(dragging.id); }
                    if (dragging != null && FloorHit(t0.screenPosition, out var p)) dragOffset = dragging.transform.position - p;
                }
                else if (FloorHit(t0.screenPosition, out var p2)) dragOffset = roomView.transform.position - p2;
            }
            if (downTime < 0) return;
            if (touches.Count >= 2)
            {
                var t1 = touches[1];
                float angle = Mathf.Atan2(t1.screenPosition.y - t0.screenPosition.y, t1.screenPosition.x - t0.screenPosition.x) * Mathf.Rad2Deg;
                var target = mode == Mode.MoveRoom ? roomView.transform : roomView.ViewOf(roomView.SelectedId)?.transform;
                if (target == null) return;
                if (!twisting) { twisting = true; startAngle = angle; startYaw = target.eulerAngles.y; }
                target.rotation = Quaternion.Euler(0, startYaw - Mathf.DeltaAngle(startAngle, angle), 0);
                moved = true; roomView.UpdateSelection();
                return;
            }
            if (t0.phase == UnityEngine.InputSystem.TouchPhase.Moved && Vector2.Distance(t0.screenPosition, downPos) > 12 && !twisting)
            {
                if (!FloorHit(t0.screenPosition, out var p)) return;
                if (mode == Mode.Furniture && dragging != null) { var pos = p + dragOffset; dragging.transform.position = new Vector3(pos.x, dragging.transform.position.y, pos.z); moved = true; roomView.UpdateSelection(); }
                else if (mode == Mode.MoveRoom) { var pos = p + dragOffset; roomView.transform.position = new Vector3(pos.x, roomView.transform.position.y, pos.z); moved = true; }
            }
            if (t0.phase == UnityEngine.InputSystem.TouchPhase.Ended || t0.phase == UnityEngine.InputSystem.TouchPhase.Canceled)
            {
                if (!moved && mode == Mode.Furniture && Time.unscaledTime - downTime < 0.5f)
                {
                    var hit = Pick(t0.screenPosition);
                    roomView.Select(hit?.id); SelectionChanged?.Invoke(hit?.id);
                }
                Finish();
            }
        }

        void Finish()
        {
            if (moved)
            {
                if (mode == Mode.MoveRoom) RoomMoved?.Invoke();
                else if (roomView.SelectedId != null) ItemChanged?.Invoke(roomView.SelectedId);
            }
            dragging = null; twisting = false; moved = false; downTime = -1;
        }

        FurnitureView Pick(Vector2 screen)
        {
            var ray = arCamera.ScreenPointToRay(screen);
            FurnitureView best = null; float bestDist = float.MaxValue;
            foreach (var view in roomView.furnitureRoot.GetComponentsInChildren<FurnitureView>())
            {
                if (view.hitBox != null && view.hitBox.Raycast(ray, out var hit, 30) && hit.distance < bestDist) { bestDist = hit.distance; best = view; }
            }
            return best;
        }

        /// <summary>Writes a view's transform back into the item (web coordinates).</summary>
        public static void ApplyToItem(RoomView view, FurnitureView fv, Item item)
        {
            var local = fv.transform.localPosition;
            var web = Coords.ToWeb(local, view.FloorY);
            item.position = new V3(Math.Round(web.x, 3), Math.Round(item.position.y, 3), Math.Round(web.z, 3));
            item.Yaw = Coords.YawToWeb(fv.transform.localEulerAngles.y);
            item.timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
    }
}
