import {code,validateRoom,newCode} from './model.js';
const env=import.meta.env;
export const configured=Boolean(env.VITE_FIREBASE_API_KEY&&env.VITE_FIREBASE_PROJECT_ID&&env.VITE_FIREBASE_APP_ID);
let db,auth,storage,signing,initialization,authAPI,firestoreAPI,storageAPI,repository;
async function initialize(){
  const [appAPI,a,f,s,r]=await Promise.all([import('firebase/app'),import('firebase/auth'),import('firebase/firestore'),import('firebase/storage'),import('./repository.js')]);
  authAPI=a;firestoreAPI=f;storageAPI=s;repository=r;
  const app=appAPI.initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,appId:env.VITE_FIREBASE_APP_ID});
  if(env.VITE_APPCHECK_SITE_KEY){const {initializeAppCheck,ReCaptchaEnterpriseProvider}=await import('firebase/app-check');initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY),isTokenAutoRefreshEnabled:true});}
  db=f.getFirestore(app);auth=a.getAuth(app);storage=s.getStorage(app);
  if(env.DEV&&env.VITE_USE_EMULATORS==='true'){
    f.connectFirestoreEmulator(db,'127.0.0.1',8080);a.connectAuthEmulator(auth,'http://127.0.0.1:9099');s.connectStorageEmulator(storage,'127.0.0.1',9199);
  }
}
async function ready(){
  if(!configured)throw new Error('Cloud connection is not configured. You can design locally and export your room. See README for Firebase setup.');
  if(!navigator.onLine)throw new Error('You are offline. Your draft is safe on this device; reconnect to sync.');
  initialization??=initialize().catch(error=>{initialization=null;throw error;});
  await initialization;
  if(!auth.currentUser){signing??=authAPI.signInAnonymously(auth).finally(()=>{signing=null;});await signing;}
}
export async function loadRoom(id){
  await ready();return repository.readRoom(db,id);
}
export function watchRoom(id,onChange,onError){
  let stopped=false,unsubscribe;
  ready().then(()=>{
    if(stopped)return;
    unsubscribe=firestoreAPI.onSnapshot(firestoreAPI.doc(db,'rooms',code(id)),s=>{
      if(s.metadata.hasPendingWrites)return;
      if(s.exists()){try{onChange(validateRoom(s.data(),id));}catch(e){onError(e);}}
      else onError(new Error('This room was removed. Export your local copy.'));
    },onError);
  }).catch(error=>{if(!stopped)onError(error);});
  return ()=>{stopped=true;unsubscribe?.();};
}
/** Live list of AR devices that opened this room and the last revision each one applied. */
export function watchDevices(id,onChange){
  let stopped=false,unsubscribe;
  ready().then(()=>{
    if(stopped)return;
    unsubscribe=firestoreAPI.onSnapshot(firestoreAPI.collection(db,'rooms',code(id),'devices'),s=>{
      const now=Date.now();
      onChange(s.docs.map(d=>d.data()).filter(d=>typeof d.seenAt==='number'&&now-d.seenAt<3*60*1000));
    },()=>onChange([]));
  }).catch(()=>{});
  return ()=>{stopped=true;unsubscribe?.();};
}
export async function saveRoom(room,base,create=false){
  await ready();
  if(!create)return repository.writeRoom(db,room,base,false);
  // New rooms get a fresh short code; retry the rare collision with another code.
  for(let attempt=0;;attempt++){
    try{return await repository.writeRoom(db,room,base,true);}
    catch(error){if(error.code!=='code-taken'||attempt>=4)throw error;room={...room,roomId:newCode()};}
  }
}
export async function scanBlob(room){
  await ready();
  // Fixed Storage path prevents untrusted room metadata from fetching arbitrary URLs.
  return storageAPI.getBlob(storageAPI.ref(storage,`meshes/${code(room.roomId)}.obj`),25*1024*1024);
}
export function friendly(error){
  const messages={'permission-denied':'Access was denied by Firebase rules. Check the room code and that the latest rules are deployed.','auth/operation-not-allowed':'Enable anonymous authentication in Firebase to use room codes.','unavailable':'Firebase is unavailable. Your local draft is safe; retry when connected.','storage/object-not-found':'This room has no uploaded scan mesh. The measured floor plan is still available.','storage/unauthorized':'Scan access was denied. Check Storage rules.','auth/network-request-failed':'Could not connect to Firebase. Check your connection.'};
  return messages[error.code]??error.message??'Something went wrong. Please retry.';
}
