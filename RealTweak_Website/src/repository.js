import {doc,getDoc,runTransaction,serverTimestamp} from 'firebase/firestore';
import {code,validateRoom,savePatch,mergeRooms} from './model.js';

export async function readRoom(db,id){
  const roomId=code(id);
  const snapshot=await getDoc(doc(db,'rooms',roomId));
  if(!snapshot.exists())throw new Error('Room not found. Check the code and make sure the phone finished uploading the scan.');
  return validateRoom(snapshot.data(),roomId);
}

/**
 * Saves `room` in a transaction. If another device saved since `base`, the edits are merged
 * (per furniture item) instead of failing, so phone and browser can edit at the same time.
 * Returns {room, merged}.
 */
export async function writeRoom(db,room,base,create=false){
  return runTransaction(db,async transaction=>{
    const reference=doc(db,'rooms',code(room.roomId));
    const snapshot=await transaction.get(reference);
    if(create&&snapshot.exists()){const error=new Error('This room code is already taken.');error.code='code-taken';throw error;}
    if(!create&&!snapshot.exists())throw new Error('This room no longer exists in the cloud. Export your draft to keep it.');
    let next=room,merged=false;
    if(snapshot.exists()){
      const remote=validateRoom(snapshot.data(),room.roomId);
      if(remote.revision!==(base.revision??0)||remote.timestamp!==(base.timestamp??0)){next=validateRoom(mergeRooms(base,room,remote),room.roomId);merged=true;}
    }
    const patch=savePatch(next,snapshot.exists()?snapshot.data():base);
    if(create)transaction.set(reference,{...patch,roomId:room.roomId,source:room.source==='scan'?'scan':'web',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    else transaction.update(reference,{...patch,updatedAt:serverTimestamp()});
    return {room:validateRoom({...next,...patch},room.roomId),merged};
  });
}
