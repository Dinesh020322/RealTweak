// Firebase access for the AR app: anonymous sign-in, room creation with collision-safe short codes,
// merge-on-save transactions (same semantics as the website), live listening and device presence.
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Firebase;
using Firebase.Auth;
using Firebase.Firestore;
using Firebase.Storage;
using RealTweak.Core;
using UnityEngine;

namespace RealTweak
{
    public static class CloudService
    {
        static FirebaseFirestore db;
        static FirebaseStorage storage;
        static FirebaseAuth auth;
        static Task initialization;
        public static string LastError;

        public static bool Ready => db != null && auth?.CurrentUser != null;

        public static Task Init() => initialization ??= InitCore();
        static async Task InitCore()
        {
            try
            {
                var status = await FirebaseApp.CheckAndFixDependenciesAsync();
                if (status != DependencyStatus.Available) throw new Exception($"Firebase is unavailable on this device ({status}).");
                auth = FirebaseAuth.DefaultInstance;
                db = FirebaseFirestore.DefaultInstance;
                storage = FirebaseStorage.DefaultInstance;
                if (auth.CurrentUser == null) await auth.SignInAnonymouslyAsync();
            }
            catch
            {
                initialization = null; // allow a retry (e.g. after reconnecting)
                throw;
            }
        }

        public static string Friendly(Exception e)
        {
            var inner = e is AggregateException ae && ae.InnerException != null ? ae.InnerException : e;
            if (inner is FirestoreException fe)
            {
                switch (fe.ErrorCode)
                {
                    case FirestoreError.PermissionDenied: return "Access denied. Check the room code (and that the latest Firebase rules are deployed).";
                    case FirestoreError.Unavailable: return "You're offline. Your changes are kept on the phone; save again when connected.";
                    case FirestoreError.NotFound: return "That room doesn't exist. Check the code.";
                }
            }
            if (inner is FirebaseException fb && fb.Message.Contains("operation-not-allowed")) return "Anonymous sign-in is disabled in Firebase. Enable it in the console.";
            return inner.Message;
        }

        static DocumentReference Doc(string code) => db.Collection("rooms").Document(code);

        public static async Task<Room> Load(string code)
        {
            await Init();
            var snap = await Doc(code).GetSnapshotAsync();
            if (!snap.Exists) throw new Exception("Room not found. Check the code - and make sure the scan finished uploading.");
            return RoomCodec.FromDocument(snap.ToDictionary(), code);
        }

        public static ListenerRegistration Listen(string code, Action<Room> onRoom, Action<string> onError)
        {
            return Doc(code).Listen(MetadataChanges.Exclude, snap =>
            {
                try
                {
                    if (snap.Metadata.HasPendingWrites) return;
                    if (!snap.Exists) { onError?.Invoke("This room was removed."); return; }
                    onRoom(RoomCodec.FromDocument(snap.ToDictionary(), code));
                }
                catch (Exception e) { onError?.Invoke(e.Message); }
            });
        }

        /// <summary>Creates a new room document with a fresh code (retrying collisions), then uploads the scan cloud.</summary>
        public static async Task<Room> Create(Room room, Dictionary<string, object> scanMeta, byte[] obj)
        {
            await Init();
            for (int attempt = 0; ; attempt++)
            {
                var code = RoomCode.New();
                room.roomId = code;
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var data = RoomCodec.Patch(room, 1, now);
                data["roomId"] = code;
                data["source"] = "scan";
                data["createdAt"] = FieldValue.ServerTimestamp;
                data["updatedAt"] = FieldValue.ServerTimestamp;
                if (scanMeta != null) data["scan"] = scanMeta;
                if (obj != null && obj.Length > 0) data["meshPath"] = $"meshes/{code}.obj";
                bool created = await db.RunTransactionAsync(async tx =>
                {
                    var snap = await tx.GetSnapshotAsync(Doc(code));
                    if (snap.Exists) return false;
                    tx.Set(Doc(code), data);
                    return true;
                });
                if (created)
                {
                    room.revision = 1; room.timestamp = now; room.source = "scan";
                    if (obj != null && obj.Length > 0)
                    {
                        try { await storage.GetReference($"meshes/{code}.obj").PutBytesAsync(obj, new MetadataChange { ContentType = "model/obj" }); room.meshPath = $"meshes/{code}.obj"; }
                        catch (Exception e) { Debug.LogWarning($"RealTweak: scan cloud upload failed (room is saved): {e.Message}"); }
                    }
                    return room;
                }
                if (attempt >= 4) throw new Exception("Couldn't reserve a room code. Please try again.");
            }
        }

        /// <summary>Saves local edits. If another device saved in between, the edits are merged per item.</summary>
        public static async Task<(Room room, bool merged)> Save(Room local, Room baseRoom)
        {
            await Init();
            Room saved = null; bool merged = false;
            await db.RunTransactionAsync(async tx =>
            {
                var snap = await tx.GetSnapshotAsync(Doc(local.roomId));
                if (!snap.Exists) throw new Exception("This room no longer exists in the cloud.");
                var remote = RoomCodec.FromDocument(snap.ToDictionary(), local.roomId);
                var next = local;
                merged = remote.revision != baseRoom.revision || remote.timestamp != baseRoom.timestamp;
                if (merged) next = RoomMerge.Merge(baseRoom, local, remote);
                long revision = remote.revision + 1, timestamp = Math.Max(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), remote.timestamp + 1);
                var patch = RoomCodec.Patch(next, revision, timestamp);
                patch["updatedAt"] = FieldValue.ServerTimestamp;
                tx.Update(Doc(local.roomId), patch);
                saved = next.Clone(); saved.revision = revision; saved.timestamp = timestamp;
                return true;
            });
            return (saved, merged);
        }

        /// <summary>Tells the website which revision this phone is showing ("showing your latest save").</summary>
        public static async Task ReportPresence(string code, long revision)
        {
            try
            {
                await Init();
                await Doc(code).Collection("devices").Document(auth.CurrentUser.UserId).SetAsync(new Dictionary<string, object>
                {
                    ["platform"] = Application.platform == RuntimePlatform.IPhonePlayer ? "iOS" : Application.platform == RuntimePlatform.Android ? "Android" : "Editor",
                    ["model"] = Truncate(SystemInfo.deviceModel, 60),
                    ["appliedRevision"] = revision,
                    ["seenAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                });
            }
            catch (Exception e) { Debug.Log($"RealTweak: presence not reported ({e.Message})"); }
        }
        public static async Task LeavePresence(string code)
        {
            try { if (Ready) await Doc(code).Collection("devices").Document(auth.CurrentUser.UserId).DeleteAsync(); } catch { /* best effort */ }
        }
        static string Truncate(string s, int n) => string.IsNullOrEmpty(s) ? "Phone" : s.Length <= n ? s : s.Substring(0, n);
    }
}
