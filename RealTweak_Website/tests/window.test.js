import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Group,DirectionalLight,Mesh,Scene} from 'three';
import {createWindowModel} from '../src/windowModel.js';
import {View3D} from '../src/view3d.js';
import {buildModel} from '../src/models3d.js';
import {createRoom,openingSize,catalog,itemDef} from '../src/model.js';

// Exercise the real scene builder without needing a GPU or browser.
function headlessView(){
  const view=Object.create(View3D.prototype);
  Object.assign(view,{group:new Group(),scene:new Scene(),sun:new DirectionalLight(),ground:new Mesh(),floorTexture:null,requestRender(){},walls:[]});
  view.scene.add(view.sun.target);
  return view;
}
test('window includes a frame, two transparent panes and a sill',()=>{
  const window=createWindowModel({width:1.2,height:1.3,depth:.15,id:'opening:2'});
  assert.equal(window.children.length,8);
  assert.equal(window.getObjectByName('Left glass').material.transparent,true);
  assert.ok(window.getObjectByName('Window sill'));
  assert.ok(window.children.every(mesh=>mesh.userData.itemId==='opening:2'));
});
test('window host wall reaches full height with sill wall below and header above',()=>{
  const room=createRoom();
  room.openings=[{type:'window',wall:0,offset:.5,width:1.2}];
  const view=headlessView();view.update(room,null);
  const host=view.group.children[1],size=openingSize(room.openings[0],room.walls[0]);
  const top=size.sill+size.height;
  const header=host.children.find(mesh=>mesh.isMesh&&Math.abs(mesh.position.y-mesh.geometry.parameters.height/2-top)<1e-6);
  assert.ok(header,'a wall header must sit directly above the window');
  assert.ok(Math.abs(header.position.y+header.geometry.parameters.height/2-2.7)<1e-6);
  assert.ok(host.children.some(mesh=>mesh.isMesh&&Math.abs(mesh.geometry.parameters.height-size.sill)<1e-6),'sill wall below window');
  view.clear(view.group);
});
test('walls render their own customized heights',()=>{
  const room=createRoom();
  room.openings=[{type:'door',wall:0,offset:.5,width:.9},{type:'window',wall:1,offset:.5,width:1.2}];
  const view=headlessView();
  for(const heights of [[3.4,4.2,2.5,1.8],[2.5,2.2,5,3]]){
    room.walls.forEach((wall,i)=>{wall.height=heights[i];});
    view.update(room,null);
    room.walls.forEach((wall,i)=>{
      const bounds=new Box3().setFromObject(view.group.children[i+1]);
      assert.ok(Math.abs(bounds.max.y-wall.height)<1e-5,`wall ${i} must render its configured height`);
    });
  }
  view.clear(view.group);
});
test('every catalog model builds with its declared footprint',()=>{
  for(const item of catalog){
    const model=buildModel(item.type,item.color,'x');
    const size=new Box3().setFromObject(model).getSize(new Vector3());
    // Parts may overhang slightly (handles, taps, stair handrails) but stay close to the nominal size.
    assert.ok(size.x<=item.w*1.25+.05&&size.z<=item.d*1.3+.05&&size.y<=item.h+(item.type.startsWith('stairs')?1:item.h*.3)+.05,`${item.type} ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} vs ${item.w}×${item.h}×${item.d}`);
    assert.ok(size.x>=item.w*.6&&size.z>=item.d*.4&&size.y>=item.h*.6,`${item.type} too small: ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`);
  }
  assert.equal(itemDef('stairs').parts.filter(p=>p.s==='box').length>15,true);
});
test('furniture is placed with position, rotation and scale',()=>{
  const room=createRoom();room.furniture=[{id:'a',type:'sofa',position:{x:1,y:0,z:-1},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:2,y:1,z:1},color:'#123456'}];
  const view=headlessView();view.update(room,'a');
  const model=view.items.get('a');assert.equal(model.position.x,1);assert.equal(model.rotation.y,Math.PI/2);assert.equal(model.scale.x,2);
  view.clear(view.group);
});
