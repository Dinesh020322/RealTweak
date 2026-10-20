import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,demoRoom,validateRoom,code,newCode,formatCode,addItem,area,inside,footprint,warnings,History,savePatch,catalog,itemDef,
  moveCorner,insertCorner,removeCorner,setEdgeLength,setRoomHeight,perimeterEdge,wallLength,mergeRooms,hasChanges,clone,selfIntersects,roomFromPolygon} from '../src/model.js';
import {planSymbol,thumbnail} from '../src/symbols.js';

test('new short codes are 8 unambiguous characters and unique',()=>{
  const codes=Array.from({length:500},newCode);
  assert.equal(new Set(codes).size,500);
  assert.ok(codes.every(c=>/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(c)));
});
test('short codes are case-insensitive and accept separators; legacy codes keep case',()=>{
  assert.equal(code(' abcd-efgh '),'ABCDEFGH');
  assert.equal(code('ABCD EFGH'),'ABCDEFGH');
  assert.equal(formatCode('ABCDEFGH'),'ABCD-EFGH');
  assert.equal(code('Ab_cd-1234'),'Ab_cd-1234');
  assert.equal(code('1244'),'1244');
  for(const s of ['../rooms','a/b','abc','<script>','a'.repeat(65),'💥1234',''])assert.throws(()=>code(s));
});
test('catalog has unique types, valid parts and every category used',()=>{
  assert.ok(catalog.length>=70);
  assert.equal(new Set(catalog.map(c=>c.type)).size,catalog.length);
  for(const item of catalog){
    assert.ok(item.parts.length>0,item.type);
    for(const p of item.parts){
      assert.ok(['box','cyl','sph'].includes(p.s));
      for(const k of ['x','y','z','w','h','d'])assert.ok(Number.isFinite(p[k]),`${item.type}.${k}`);
      assert.ok(p.c==='main'||/^#[0-9a-f]{6}$/i.test(p.c));
    }
  }
  for(const t of ['stairs','stairs-l','stairs-spiral','sofa','bed','toilet','fridge'])assert.equal(itemDef(t).type,t);
});
test('plan symbols and thumbnails are generated for every model',()=>{
  for(const item of catalog){assert.ok(planSymbol(item.type).length>0);assert.match(thumbnail(item.type),/^<svg viewBox="[-\d. ]+"/);}
});
test('room templates produce valid rooms with matching walls',()=>{
  for(const [shape,corners] of [['rectangle',4],['lshape',6],['ushape',8],['tshape',8]]){
    const r=createRoom('R',6,5,shape);assert.equal(r.floor.vertices.length,corners);assert.equal(r.walls.length,corners);
    assert.ok(r.walls.every(w=>perimeterEdge(r,w)>=0));
  }
  const r=createRoom('Room',6,5);assert.equal(area(r.floor.vertices),30);assert.equal(r.dimensions.y,2.7);
  const l=createRoom('L',6,6,'lshape');assert.ok(!inside({x:2,z:2},l.floor.vertices));assert.ok(inside({x:-2,z:2},l.floor.vertices));
});
test('dragging a corner moves both attached walls and keeps the door on its wall',()=>{
  const r=createRoom('R',6,5);r.openings=[{type:'door',wall:1,offset:.5,width:.9}];
  moveCorner(r,1,4,-2.5);
  assert.deepEqual([r.walls[0].endPoint.x,r.walls[1].startPoint.x],[4,4]);
  assert.equal(r.dimensions.x,7);assert.equal(r.openings[0].wall,1);assert.equal(r.openings[0].offset,.5);
  validateRoom(r);
});
test('inserting a corner splits the wall and remaps openings by position',()=>{
  const r=createRoom('R',6,5);r.openings=[{type:'window',wall:0,offset:.8,width:1}];
  insertCorner(r,0,.5);
  assert.equal(r.floor.vertices.length,5);assert.equal(r.walls.length,5);
  assert.equal(r.openings[0].wall,1);assert.ok(Math.abs(r.openings[0].offset-.6)<1e-9);
  moveCorner(r,1,0,-3.5);assert.equal(r.floor.vertices[1].z,-3.5);
  removeCorner(r,1);assert.equal(r.floor.vertices.length,4);assert.equal(area(r.floor.vertices),30);
  validateRoom(r);
});
test('wall length edit keeps a rectangle rectangular',()=>{
  const r=createRoom('R',6,5);setEdgeLength(r,0,7.5);
  assert.equal(wallLength(r.walls[0]),7.5);assert.equal(wallLength(r.walls[2]),7.5);assert.equal(wallLength(r.walls[1]),5);
  assert.ok(Math.abs(area(r.floor.vertices)-37.5)<1e-9);
});
test('invalid reshapes are rejected: crossing walls, tiny rooms, too few corners',()=>{
  const r=createRoom('R',6,5);
  assert.throws(()=>moveCorner(clone(r),1,-4,0),/cross/);
  const tri=roomFromPolygon('T',[{x:0,z:0},{x:3,z:0},{x:0,z:3}]);assert.throws(()=>removeCorner(tri,0),/three/);
  assert.ok(selfIntersects([{x:0,z:0},{x:2,z:2},{x:2,z:0},{x:0,z:2}]));
});
test('interior walls survive reshaping and openings stay attached to them',()=>{
  const r=createRoom('R',6,5);r.walls.push({startPoint:{x:0,y:0,z:-2.5},endPoint:{x:0,y:0,z:0},height:2.7,thickness:.1});
  r.openings=[{type:'door',wall:4,offset:.5,width:.8}];
  insertCorner(r,2,.3);
  assert.equal(r.walls.length,6);assert.equal(perimeterEdge(r,r.walls[5]),-1);assert.equal(r.openings[0].wall,5);validateRoom(r);
});
test('ceiling height updates outline walls and ceiling-mounted items',()=>{
  const r=createRoom();const lamp=addItem('pendant-light',0,0,r);r.furniture.push(lamp);
  assert.ok(Math.abs(lamp.position.y-(2.7-itemDef('pendant-light').h))<1e-9);
  setRoomHeight(r,3.2);assert.ok(r.walls.every(w=>w.height===3.2));assert.ok(Math.abs(lamp.position.y-(3.2-itemDef('pendant-light').h))<1e-9);
});
test('legacy scans normalize missing metadata without losing scan fields',()=>{
  const r=createRoom();delete r.schemaVersion;delete r.revision;delete r.name;r.meshUrl='https://example.invalid/file';r.scan={method:'depth'};
  const parsed=validateRoom(r);assert.equal(parsed.revision,0);assert.equal(parsed.meshUrl,r.meshUrl);assert.equal(parsed.scan.method,'depth');
});
test('legacy Unity quaternion yaw becomes opposite web yaw',()=>{
  const r=createRoom(),f=addItem('chair');f.rotation={x:0,y:Math.sin(Math.PI/8),z:0,w:Math.cos(Math.PI/8)};r.furniture=[f];
  assert.ok(Math.abs(validateRoom(r).furniture[0].rotation.y+Math.PI/4)<1e-8);
});
test('openings cannot overhang the wall and need valid walls',()=>{
  const r=createRoom();r.openings=[{type:'door',wall:0,width:1,offset:0}];assert.throws(()=>validateRoom(r),/fit within/);
  r.openings=[{type:'door',wall:99,width:1,offset:.5}];assert.throws(()=>validateRoom(r));
});
test('nonfinite geometry, degenerate floors, duplicate IDs and bad values are rejected',()=>{
  for(const value of [NaN,Infinity,-1,101]){const r=createRoom();r.dimensions.x=value;assert.throws(()=>validateRoom(r));}
  const d=createRoom();d.floor.vertices=[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0}];assert.throws(()=>validateRoom(d));
  const u=createRoom(),f=addItem('chair');u.furniture=[f,f];assert.throws(()=>validateRoom(u));
  u.furniture=Array.from({length:301},()=>addItem('chair'));assert.throws(()=>validateRoom(u));
  for(const key of ['position','rotation','scale']){const r=createRoom(),g=addItem('chair');g[key].x=Infinity;r.furniture=[g];assert.throws(()=>validateRoom(r));}
});
test('unknown future types are kept; colors sanitized; future schema refused',()=>{
  const r=createRoom(),f=addItem('chair');f.type='future_item';r.furniture=[f];assert.equal(validateRoom(r).furniture[0].type,'future_item');
  const c=createRoom(),g=addItem('chair');g.color='red;position:absolute';c.furniture=[g];assert.match(validateRoom(c).furniture[0].color,/^#[a-f0-9]{6}$/i);
  const s=createRoom();s.schemaVersion=999;assert.throws(()=>validateRoom(s));
});
test('rotated footprint and out-of-room warning; ceiling items ignored',()=>{
  const r=createRoom(),f=addItem('table',2.8,0);f.rotation.y=Math.PI/2;r.furniture=[f];assert.equal(footprint(f).length,4);assert.equal(warnings(r).length,1);
  f.position.x=0;assert.equal(warnings(r).length,0);
});
test('history isolates state, truncates branches and is bounded',()=>{
  const r=createRoom(),h=new History(r);r.furniture.push(addItem('chair'));h.push(r);assert.equal(h.undo().furniture.length,0);assert.equal(h.redo().furniture.length,1);
  const undone=h.undo();undone.name='Branch';h.push(undone);assert.equal(h.redo().name,'Branch');assert.equal(h.items.length,2);
  for(let i=0;i<100;i++){r.name=String(i);h.push(r);}assert.equal(h.items.length,80);
});
test('save payload is monotonic and excludes metadata',()=>{
  const r=demoRoom(),p=savePatch(r,{revision:7,timestamp:5000},4000);assert.equal(p.revision,8);assert.equal(p.timestamp,5001);
  assert.ok(!('meshUrl' in p));assert.ok(!('createdAt' in p));assert.ok(!('roomId' in p));
});
test('three-way merge keeps phone and browser edits to different items',()=>{
  const base=createRoom();const chair=addItem('chair',1,1),sofa=addItem('sofa',-1,-1),lamp=addItem('floor-lamp',2,2);base.furniture=[chair,sofa,lamp];
  const local=clone(base),remote=clone(base);
  local.furniture[0].position.x=1.5;                       // browser moves chair
  local.furniture.push(addItem('plant',0,0));              // browser adds plant
  remote.furniture=remote.furniture.filter(f=>f.id!==sofa.id); // phone deletes sofa
  remote.furniture.find(f=>f.id===lamp.id).color='#000000';   // phone recolours lamp
  remote.revision=5;
  const merged=mergeRooms(base,local,remote);
  assert.equal(merged.furniture.find(f=>f.id===chair.id).position.x,1.5);
  assert.ok(!merged.furniture.some(f=>f.id===sofa.id));
  assert.equal(merged.furniture.find(f=>f.id===lamp.id).color,'#000000');
  assert.ok(merged.furniture.some(f=>f.type==='plant'));
  assert.equal(merged.revision,5);
});
test('merge: local deletion wins over unchanged remote; structure edits carried as a unit',()=>{
  const base=createRoom();const chair=addItem('chair');base.furniture=[chair];
  const local=clone(base),remote=clone(base);local.furniture=[];moveCorner(local,1,4,-2.5);remote.name='Renamed on phone';
  const merged=mergeRooms(base,local,remote);
  assert.equal(merged.furniture.length,0);assert.equal(merged.floor.vertices[1].x,4);assert.equal(merged.name,'Renamed on phone');
  assert.ok(hasChanges(merged,base));assert.ok(!hasChanges(clone(base),base));
});
test('demo is a valid coherent room',()=>{const d=demoRoom();assert.equal(validateRoom(d).furniture.length,13);assert.equal(warnings(d).length,0);});

import {addLevel,removeLevel,levelView,withLevel,levelCount,levelInfo,levelAbove,levelBelow,fitStairs,stackedLevels,stairPath} from '../src/model.js';
test('floors: stacked floors get elevations, separate plans stay at ground level',()=>{
  const h=createRoom('House',8,6);
  const first=addLevel(h,{name:'First floor'}),garage=addLevel(h,{name:'Garage',separate:true,copyFrom:null}),second=addLevel(h,{name:'Second floor',copyFrom:first});
  assert.equal(levelCount(h),4);
  assert.equal(levelInfo(h,first).elevation,2.95);assert.equal(levelInfo(h,second).elevation,5.9);assert.equal(levelInfo(h,garage).elevation,0);
  assert.deepEqual(stackedLevels(h),[0,first,second]);
  assert.equal(levelAbove(h,0),first);assert.equal(levelBelow(h,second),first);assert.equal(levelAbove(h,garage),-1);
  assert.equal(validateRoom(h).levels.length,3);
});
test('floors: editing a floor view writes back only that floor',()=>{
  const h=createRoom('House',8,6);const i=addLevel(h,{name:'First'});
  const view=levelView(h,i);view.furniture.push(addItem('bed',0,0));moveCorner(view,1,5,-3);
  const next=validateRoom(withLevel(h,i,view));
  assert.equal(next.levels[0].furniture.length,1);assert.equal(next.furniture.length,0);
  assert.equal(next.levels[0].floor.vertices[1].x,5);assert.equal(next.floor.vertices[1].x,4);
});
test('floors: stairs stretch to reach the floor above',()=>{
  const h=createRoom('House',8,6);addLevel(h,{name:'First'});
  const s=addItem('stairs',0,0);assert.ok(fitStairs(h,0,s));assert.ok(Math.abs(s.scale.y*2.7-2.95)<.01);
  assert.ok(stairPath('stairs').length>=3);assert.equal(stairPath('sofa').length,0);
  assert.equal(fitStairs(h,1,addItem('stairs',0,0)),false);
});
test('floors: furniture ids are unique across the whole project; limits enforced',()=>{
  const h=createRoom('House',8,6);addLevel(h,{name:'First'});const f=addItem('chair');h.furniture.push(f);h.levels[0].furniture.push(clone(f));
  assert.throws(()=>validateRoom(h),/unique/);
  const big=createRoom();for(let i=0;i<11;i++)addLevel(big,{name:'F'+i});assert.throws(()=>addLevel(big,{name:'Too many'}),/12/);
  assert.throws(()=>removeLevel(big,0),/ground/);removeLevel(big,1);assert.equal(levelCount(big),11);
});
test('floors: merge keeps a floor added on one device and furniture edits on another',()=>{
  const base=createRoom('House',8,6);addLevel(base,{name:'First'});
  const local=clone(base),remote=clone(base);
  addLevel(local,{name:'Garage',separate:true});                 // browser adds a plan
  remote.levels[0].furniture.push(addItem('bed',0,0));           // phone furnishes first floor
  local.levels[0].name='Upstairs';                               // browser renames the floor
  const merged=mergeRooms(base,local,remote);
  assert.equal(merged.levels.length,2);assert.equal(merged.levels[0].furniture.length,1);assert.equal(merged.levels[0].name,'Upstairs');
  const removed=clone(base);removed.levels=[];assert.equal(mergeRooms(base,removed,clone(base)).levels.length,0);
  assert.deepEqual(savePatch(createRoom(),{revision:0}).levels,[]);
});
