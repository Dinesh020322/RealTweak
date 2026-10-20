import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

// DOM unit tests execute the real application handlers, not a second implementation.
// Cloud transport is isolated here; repository transport is tested against Firestore separately.
let script,html;
const windows=[];
const DEMO_ITEMS=13;
before(async()=>{
  html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const result=await build({
    entryPoints:[new URL('../src/app.js',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],
    bundle:true,write:false,format:'iife',loader:{'.css':'empty'},
    plugins:[{name:'isolated-cloud',setup(builder){
      builder.onResolve({filter:/\/cloud\.js$/},()=>({path:'cloud',namespace:'test'}));
      builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const configured=false; export const friendly=e=>e.message; export async function loadRoom(){throw new Error('Cloud not configured');} export async function saveRoom(){throw new Error('Cloud not configured');} export function watchRoom(){return ()=>{};} export function watchDevices(){return ()=>{};} export async function scanBlob(){throw new Error('No scan');}`}));
    }}],
  });
  script=result.outputFiles[0].text;
});
after(()=>windows.forEach(w=>w.close()));
function setup(saved){
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});
  const w=dom.window;windows.push(w);w.structuredClone=structuredClone;
  Object.defineProperty(w,'crypto',{value:webcrypto});
  w.ResizeObserver=class{observe(){} disconnect(){}};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  if(saved)w.localStorage.setItem('realtweak:active:v2',saved);
  Object.defineProperty(w.SVGElement.prototype,'clientWidth',{get(){return 800;}});
  w.eval(script);
  const $=id=>w.document.getElementById(id);
  const click=id=>$(id).click();
  const change=(selector,value)=>{const element=w.document.querySelector(selector);element.value=value;element.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const state=()=>JSON.parse(w.localStorage.getItem('realtweak:active:v2'));
  // jsdom has no SVG geometry: map client coordinates 1:1 to plan meters.
  const plan=$('plan');
  plan.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}});
  plan.getScreenCTM=()=>({inverse:()=>({})});
  const pointer=(target,type,x=0,y=0)=>target.dispatchEvent(new w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));
  return {w,$,click,change,state,pointer};
}
test('editor boots into the demo with a searchable 80+ model catalog',()=>{
  const {w,$}=setup();assert.equal($('item-count').textContent,`${DEMO_ITEMS} objects`);
  assert.ok($('catalog').querySelectorAll('button').length>=70);
  $('search').value='no such furniture';$('search').dispatchEvent(new w.Event('input'));
  assert.match($('catalog').textContent,/No furniture matches/);
  $('search').value='staircase';$('search').dispatchEvent(new w.Event('input'));
  assert.equal($('catalog').querySelectorAll('button').length,3);
  $('search').value='';$('search').dispatchEvent(new w.Event('input'));
  w.document.querySelector('[data-category=Bathroom]').click();
  assert.ok([...$('catalog').querySelectorAll('strong')].some(s=>s.textContent==='Toilet'));
});
test('duplicate, remove, undo and redo modify the same room model',()=>{
  const {w,click,state}=setup();w.document.querySelector('#objects [data-id]').click();click('duplicate');
  assert.equal(state().room.furniture.length,DEMO_ITEMS+1);click('delete');assert.equal(state().room.furniture.length,DEMO_ITEMS);
  click('undo');assert.equal(state().room.furniture.length,DEMO_ITEMS+1);click('redo');assert.equal(state().room.furniture.length,DEMO_ITEMS);
});
test('precise rotation and size survive reload',()=>{
  const {w,change,state}=setup();w.document.querySelectorAll('#objects [data-id]')[1].click();
  change('[data-property=rotation]','90');change('[data-property=width]','4.2');
  const data=state();assert.equal(data.room.furniture[1].rotation.y,Math.PI/2);assert.equal(data.room.furniture[1].scale.x,2);
  const restored=setup(JSON.stringify(data));restored.w.document.querySelectorAll('#objects [data-id]')[1].click();
  assert.equal(restored.w.document.querySelector('[data-property=rotation]').value,'90');
});
test('invalid inspector value is rejected without damaging the draft',()=>{
  const {w,$,change}=setup();w.document.querySelectorAll('#objects [data-id]')[1].click();
  change('[data-property=width]','-3');assert.match($('notice-text').textContent,/limits/);
  assert.equal(w.document.querySelector('[data-property=width]').value,'2.10');
});
test('placing a catalog item adds it at the clicked point',()=>{
  const {w,$,state,pointer}=setup();
  w.document.querySelector('[data-type=stairs-spiral]').click();
  pointer($('plan'),'pointerdown',1.5,-1);
  const f=state().room.furniture.at(-1);assert.equal(f.type,'stairs-spiral');assert.deepEqual([f.position.x,f.position.z],[1.5,-1]);
});
test('wall-mounted items snap to the nearest wall and face the room',()=>{
  const {w,$,state,pointer}=setup();
  w.document.querySelector('[data-type=tv-wall]').click();
  pointer($('plan'),'pointerdown',0,-2.5);
  const f=state().room.furniture.at(-1);
  assert.ok(f.position.z>-2.75&&f.position.z<-2.55);assert.ok(Math.abs(f.rotation.y)<1e-9);assert.equal(f.position.y,1);
});
test('dragging a room corner reshapes floor and walls, and can be undone',()=>{
  const {w,$,state,pointer,click}=setup();
  const corner=$('plan').querySelector('[data-corner="1"]');
  pointer(corner,'pointerdown',3.5,-2.75);pointer($('plan'),'pointermove',4.5,-2.75);pointer($('plan'),'pointerup',4.5,-2.75);
  const r=state().room;assert.equal(r.floor.vertices[1].x,4.5);assert.equal(r.walls[0].endPoint.x,4.5);assert.equal(r.walls[1].startPoint.x,4.5);
  assert.equal($('inspector-title').textContent,'Corner 2');
  click('undo');assert.equal(state().room.floor.vertices[1].x,3.5);
});
test('wall length and ceiling height are editable in the inspector',()=>{
  const {w,$,change,state,pointer}=setup();
  pointer($('plan').querySelector('[data-wall="0"]'),'pointerdown',0,-2.75);
  assert.equal($('inspector-title').textContent,'Wall 1');
  change('[data-property=wallLength]','8');
  assert.equal(state().room.dimensions.x,8);
  w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  change('[data-property=roomHeight]','3.1');
  assert.ok(state().room.walls.every(x=>x.height===3.1));
});
test('double-clicking a wall adds a corner',()=>{
  const {w,$,state}=setup();
  $('plan').querySelector('[data-wall="0"]').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true,clientX:0,clientY:-2.75}));
  assert.equal(state().room.floor.vertices.length,5);assert.equal($('inspector-title').textContent,'Corner 2');
});
test('drawing a room outline replaces the floor polygon',()=>{
  const {w,$,state,pointer}=setup();click(w,'draw-room-tool');
  for(const [x,z] of [[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]])pointer($('plan'),'pointerdown',x,z);
  const r=state().room;assert.equal(r.floor.vertices.length,4);assert.equal(r.floor.area,16);assert.equal(r.openings.length,0);
});
function click(w,id){w.document.getElementById(id).click();}
test('new room from an L-shape template keeps the previous draft available',()=>{
  const {w,$,click:press,state}=setup();press('new-room');$('new-name').value='Test room';
  w.document.querySelector('[data-shape=lshape]').click();
  $('new-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(state().room.name,'Test room');assert.equal(state().room.floor.vertices.length,6);
  press('drafts');const demo=w.document.querySelector('[data-draft=DEMO]');assert.ok(demo);demo.click();
  assert.equal(state().room.name,'The quiet corner');assert.equal(state().room.furniture.length,DEMO_ITEMS);
});
test('missing cloud configuration gives a recoverable message',async()=>{
  const {click:press,$}=setup();press('save');await Promise.resolve();assert.match($('notice-text').textContent,/Firebase is not configured/);
});
test('Delete while editing a field does not delete furniture',()=>{
  const {w,$}=setup();w.document.querySelector('#objects [data-id]').click();
  w.document.querySelector('[data-property=x]').focus();
  w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));
  assert.equal($('item-count').textContent,`${DEMO_ITEMS} objects`);
});
test('keyboard rotation, duplicate and deletion work outside fields',()=>{
  const {w,state}=setup();w.document.querySelector('#objects [data-id]').click();
  w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'r',bubbles:true}));
  assert.ok(state().room.furniture[0].rotation.y>0);
  w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'d',ctrlKey:true,bubbles:true}));
  assert.equal(state().room.furniture.length,DEMO_ITEMS+1);
  w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));
  assert.equal(state().room.furniture.length,DEMO_ITEMS);
});
test('corrupt saved draft falls back without crashing',()=>{
  const {$}=setup('{broken json');assert.match($('notice-text').textContent,/could not be read/);assert.equal($('item-count').textContent,`${DEMO_ITEMS} objects`);
});
test('door inspector edits size and supports undo and reload',()=>{
  const {w,$,change,click:press,state,pointer}=setup();
  pointer($('plan').querySelector('[data-opening="0"] rect'),'pointerdown');
  assert.equal($('inspector-title').textContent,'Door');
  change('[data-property=openingHeight]','2.3');
  assert.equal(state().room.openings[0].height,2.3);
  press('undo');assert.equal(state().room.openings[0].height,undefined);
  press('redo');assert.equal(state().room.openings[0].height,2.3);
  const restored=setup(JSON.stringify(state()));
  assert.equal(JSON.parse(restored.w.localStorage.getItem('realtweak:active:v2')).room.openings[0].height,2.3);
});
test('adding a floor, placing stairs below and switching floors keeps one project',()=>{
  const {w,$,state,pointer}=setup();
  $('add-level').click();$('level-name').value='First floor';
  $('level-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(state().room.levels.length,1);assert.match($('canvas-title').textContent,/First floor/);
  w.document.querySelector('#levels [data-level="0"]').click();
  w.document.querySelector('[data-type=stairs]').click();pointer($('plan'),'pointerdown',2.8,.5);
  const stairs=state().room.furniture.at(-1);assert.equal(stairs.type,'stairs');assert.ok(stairs.scale.y>1);
  assert.match($('properties').textContent,/Ground floor → First floor/);
  w.document.querySelector('#levels [data-level="1"]').click();
  assert.match($('plan').innerHTML,/stairs from below/);
  w.document.querySelector('[data-type=bed]').click();pointer($('plan'),'pointerdown',-1,-1);
  assert.equal(state().room.levels[0].furniture.length,1);assert.equal(state().room.furniture.length,DEMO_ITEMS+1);
  w.document.getElementById('undo').click();assert.equal(state().room.levels[0].furniture.length,0);
});
