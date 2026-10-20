import {test,before,after,beforeEach} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs,serverTimestamp,onSnapshot} from 'firebase/firestore';
import {createRoom,savePatch,addItem,clone,newCode,addLevel} from '../src/model.js';
import {readRoom,writeRoom} from '../src/repository.js';
import assert from 'node:assert/strict';
let env;
const id='ABCD2345';
const payload=(extra={})=>{const r=createRoom();return {...savePatch(r,r),roomId:id,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),...extra};};
const roomWith=roomId=>({...createRoom(),roomId});
before(async()=>{const [host,port]=(process.env.FIRESTORE_EMULATOR_HOST??'127.0.0.1:18080').split(':');env=await initializeTestEnvironment({projectId:'demo-realtweak',firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8'),host,port:Number(port)}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{await env.clearFirestore();});
test('a phone can create a scanned room and another code holder can edit it',async()=>{
  const phone=env.authenticatedContext('phone').firestore();
  await assertSucceeds(setDoc(doc(phone,'rooms',id),payload({source:'scan',meshPath:`meshes/${id}.obj`,scan:{method:'depth',platform:'Android'}})));
  const web=env.authenticatedContext('web').firestore();await assertSucceeds(getDoc(doc(web,'rooms',id)));
  await assertSucceeds(updateDoc(doc(web,'rooms',id),{name:'Shared edit',revision:2,timestamp:Date.now()+10000,updatedAt:serverTimestamp()}));
});
test('create rejects foreign mesh paths, unknown sources and extra fields',async()=>{
  const db=env.authenticatedContext('phone').firestore();
  await assertFails(setDoc(doc(db,'rooms',id),payload({meshPath:'meshes/OTHER234.obj'})));
  await assertFails(setDoc(doc(db,'rooms',id),payload({source:'admin'})));
  await assertFails(setDoc(doc(db,'rooms',id),payload({owner:'me'})));
});
test('unauthenticated reads and writes denied',async()=>{
  const db=env.unauthenticatedContext().firestore();await assertFails(getDoc(doc(db,'rooms',id)));await assertFails(setDoc(doc(db,'rooms',id),payload()));
});
test('room enumeration is denied',async()=>await assertFails(getDocs(collection(env.authenticatedContext('web').firestore(),'rooms'))));
test('only new-format codes can be created; look-alike characters rejected',async()=>{
  const db=env.authenticatedContext('web').firestore();
  for(const bad of ['1234','a'.repeat(32),'ABCD0123','ABCDIJKL','abcd2345'])await assertFails(setDoc(doc(db,'rooms',bad),{...payload(),roomId:bad}));
});
test('legacy rooms remain readable and editable',async()=>{
  await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'rooms','1244'),{...savePatch(createRoom(),{revision:0}),roomId:'1244'});});
  const db=env.authenticatedContext('web').firestore();
  const loaded=await readRoom(db,'1244');loaded.furniture.push(addItem('chair'));
  const saved=await writeRoom(db,loaded,loaded);assert.equal(saved.room.revision,2);
});
test('stale revisions, deletion and metadata changes denied',async()=>{
  const db=env.authenticatedContext('web').firestore(),r=doc(db,'rooms',id);await setDoc(r,payload());
  await assertFails(updateDoc(r,{revision:1,name:'Stale',timestamp:Date.now()+10000,updatedAt:serverTimestamp()}));
  await assertFails(deleteDoc(r));
  await assertFails(updateDoc(r,{revision:2,meshPath:'meshes/attack.obj',timestamp:Date.now()+10000,updatedAt:serverTimestamp()}));
});
test('oversized lists and invalid dimensions denied',async()=>{
  const db=env.authenticatedContext('web').firestore(),p=payload();p.furniture=Array(301).fill({});await assertFails(setDoc(doc(db,'rooms',id),p));
  const q=payload();q.dimensions.x=-2;await assertFails(setDoc(doc(db,'rooms',id),q));
});
test('repository publishes, loads by code, and delivers furniture to another device listener',async()=>{
  const web=env.authenticatedContext('web').firestore(),phone=env.authenticatedContext('phone').firestore();
  const r=roomWith(newCode());const published=(await writeRoom(web,r,r,true)).room;
  const loaded=await readRoom(phone,r.roomId.toLowerCase());assert.equal(loaded.revision,1);
  const updated=clone(published);updated.furniture.push(addItem('chair',1,2));
  const received=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{stop();reject(new Error('Listener timed out'));},5000);
    const stop=onSnapshot(doc(phone,'rooms',r.roomId),s=>{if(s.data()?.revision===2){clearTimeout(timer);stop();resolve(s.data());}},reject);
  });
  await writeRoom(web,updated,published);const data=await received;
  assert.equal(data.furniture[0].type,'chair');assert.equal(data.furniture[0].position.z,2);assert.ok(data.timestamp>published.timestamp);
});
test('simultaneous phone and web saves are merged, not lost',async()=>{
  const web=env.authenticatedContext('web').firestore(),phone=env.authenticatedContext('phone').firestore();
  const r=roomWith(newCode());r.furniture=[addItem('sofa')];
  const base=(await writeRoom(web,r,r,true)).room,a=clone(base),b=clone(base);
  a.furniture.push(addItem('chair',1,1));            // browser adds a chair
  b.furniture[0].position.x=2;                       // phone moves the sofa
  await writeRoom(web,a,base);
  const second=await writeRoom(phone,b,base);
  assert.equal(second.merged,true);assert.equal(second.room.revision,3);
  const final=await readRoom(web,r.roomId);
  assert.equal(final.furniture.length,2);assert.equal(final.furniture.find(f=>f.type==='sofa').position.x,2);
});
test('scan metadata survives an editor save',async()=>{
  const db=env.authenticatedContext('web').firestore();const r=roomWith(newCode());
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'rooms',r.roomId),{...r,revision:1,timestamp:1,meshPath:`meshes/${r.roomId}.obj`,scan:{method:'depth'}});});
  const loaded=await readRoom(db,r.roomId);loaded.furniture.push(addItem('chair'));await writeRoom(db,loaded,loaded);
  const saved=(await getDoc(doc(db,'rooms',r.roomId))).data();assert.equal(saved.meshPath,`meshes/${r.roomId}.obj`);assert.equal(saved.scan.method,'depth');
});
test('missing rooms and duplicate create fail clearly',async()=>{
  const db=env.authenticatedContext('web').firestore(),r=roomWith(newCode());
  await assert.rejects(()=>readRoom(db,r.roomId),/not found/);
  await writeRoom(db,r,r,true);await assert.rejects(()=>writeRoom(db,r,r,true),e=>e.code==='code-taken');
});
test('devices report their applied revision; only their own entry',async()=>{
  const phone=env.authenticatedContext('phone-uid').firestore(),web=env.authenticatedContext('web').firestore();
  const presence={platform:'Android',model:'Pixel 8',appliedRevision:1,seenAt:Date.now()};
  await assertFails(setDoc(doc(phone,'rooms',id,'devices','phone-uid'),presence)); // room must exist
  await setDoc(doc(phone,'rooms',id),payload());
  await assertSucceeds(setDoc(doc(phone,'rooms',id,'devices','phone-uid'),presence));
  await assertFails(setDoc(doc(phone,'rooms',id,'devices','someone-else'),presence));
  await assertFails(setDoc(doc(phone,'rooms',id,'devices','phone-uid'),{...presence,extra:true}));
  const list=await assertSucceeds(getDocs(collection(web,'rooms',id,'devices')));assert.equal(list.size,1);
});
test('a project with several floors saves and merges floors from two devices',async()=>{
  const web=env.authenticatedContext('web').firestore(),phone=env.authenticatedContext('phone').firestore();
  const r=roomWith(newCode());addLevel(r,{name:'First floor'});
  const base=(await writeRoom(web,r,r,true)).room,a=clone(base),b=clone(base);
  addLevel(a,{name:'Garage',separate:true});b.levels[0].furniture.push(addItem('bed'));
  await writeRoom(web,a,base);const second=await writeRoom(phone,b,base);
  assert.equal(second.merged,true);
  const final=await readRoom(web,r.roomId);
  assert.equal(final.levels.length,2);assert.equal(final.levels[0].furniture.length,1);
});
