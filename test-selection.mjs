import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.min.js';
import {VEHICLES,createVehicle,disposeVehicle,getVehicle} from './dist/vehicle-catalog.mjs';
import {normalizeSelection,loadSelection,saveSelection,capturePreview} from './dist/flight-selector.mjs';
import {withStagePreview} from './dist/selection-integration.mjs';
import {REGIONS} from './dist/world.mjs';
assert.equal(getVehicle('not-an-aircraft').id,'whoop75');
const bounds=[],counts=[];
for(const v of VEHICLES){
 const {group,propellers,preset}=createVehicle(v.id);assert.equal(group.userData.vehicleId,v.id);assert.equal(preset.id,v.id);assert.equal(propellers.length,4);assert.ok(propellers.every(p=>p.children.length===v.blades));
 assert.equal(group.children.filter(o=>o.geometry?.type==='TorusGeometry').length,v.guards?8:0);
 bounds.push(new T.Box3().setFromObject(group).getSize(new T.Vector3()).x);counts.push(group.children.length);
 const geometry=group.children.find(o=>o.geometry).geometry;let disposed=false;geometry.addEventListener('dispose',()=>disposed=true);disposeVehicle(group);assert.equal(disposed,true);
}
assert.ok(bounds[1]<bounds[0]&&bounds[0]<bounds[2]);assert.notEqual(counts[0],counts[2]);
console.log('PASS: all five actual airframes, dimensions, guarded/open geometry, distinct propellers, GPU disposal');
assert.deepEqual(normalizeSelection({vehicle:'micro65',region:'harbor'}),{vehicle:'micro65',region:'harbor'});
for(const bad of [null,{},false,{vehicle:'other',region:'bad'}])assert.deepEqual(normalizeSelection(bad),{vehicle:'whoop75',region:'airfield'});
let saved=null;globalThis.localStorage={getItem:()=>saved,setItem:(k,v)=>saved=v};saveSelection({vehicle:'scout85',region:'offshore'});assert.deepEqual(loadSelection(),{vehicle:'scout85',region:'offshore'});saved='{invalid';assert.equal(loadSelection().region,'airfield');
globalThis.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}};assert.doesNotThrow(()=>saveSelection({}));assert.equal(loadSelection().vehicle,'whoop75');
console.log('PASS: selection persistence, invalid/old saved data and blocked/quota-limited storage');
const scene=new T.Scene(),skyDome=new T.Group(),sun=new T.DirectionalLight(),drone=new T.Group(),airfieldGroup=new T.Group(),regionGroups=REGIONS.map(()=>new T.Group()),terrainChunks=[{x:0,y:0,near:new T.Group(),far:new T.Group()}];
const all=[drone,airfieldGroup,...regionGroups,...terrainChunks.flatMap(c=>[c.near,c.far])];all.forEach((o,i)=>o.visible=i%2===0);skyDome.position.set(14,23,32);sun.position.set(42,54,31);sun.target.position.set(11,33,25);
const original=all.map(o=>o.visible),vectors=[skyDome.position.clone(),sun.position.clone(),sun.target.position.clone()];
const context={scene,skyDome,sun,drone,airfieldGroup,regionGroups,terrainChunks};
function unchanged(){assert.deepEqual(all.map(o=>o.visible),original);assert.ok(skyDome.position.equals(vectors[0]));assert.ok(sun.position.equals(vectors[1]));assert.ok(sun.target.position.equals(vectors[2]));}
for(let repeat=0;repeat<3;repeat++)for(let index=0;index<REGIONS.length;index++){assert.equal(withStagePreview(context,index,camera=>{assert.equal(drone.visible,false);assert.equal(airfieldGroup.visible,index===0);assert.equal(camera.aspect,1.8);assert.ok(camera.position.distanceTo(skyDome.position)<.001);return 'actual-scene'}),'actual-scene');unchanged()}
assert.throws(()=>withStagePreview(context,6,()=>{throw Error('capture failed')}),/capture failed/);unchanged();
console.log('PASS: all stage preview viewpoints and repeated/error cleanup restore live scene visibility, lighting and sky');
// Exercise renderer restoration and WebGL-target disposal independently of browser access.
const oldTarget={id:'flight-feed'},oldViewport=new T.Vector4(1,2,3,4),oldScissor=new T.Vector4(4,3,2,1);let disposed=false;
const renderer={target:oldTarget,viewport:oldViewport.clone(),scissor:oldScissor.clone(),test:true,getRenderTarget(){return this.target},getViewport(v){return v.copy(this.viewport)},getScissor(v){return v.copy(this.scissor)},getScissorTest(){return this.test},setRenderTarget(t){this.target=t;if(t!==oldTarget)t.addEventListener('dispose',()=>disposed=true)},setViewport(...v){this.viewport=v[0] instanceof T.Vector4?v[0].clone():new T.Vector4(...v)},setScissor(v){this.scissor=v.clone()},setScissorTest(v){this.test=v},render(){throw Error('WebGL failure')}};
assert.throws(()=>capturePreview(renderer,scene,new T.Camera(),360,200),/WebGL failure/);assert.equal(renderer.target,oldTarget);assert.ok(renderer.viewport.equals(oldViewport));assert.ok(renderer.scissor.equals(oldScissor));assert.equal(renderer.test,true);assert.equal(disposed,true);
console.log('PASS: failed preview restores renderer target, viewport, scissor and releases render target');
let lastPixels;
globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:data=>lastPixels=data.data})})};
renderer.render=()=>{};renderer.readRenderTargetPixels=(target,x,y,w,h,buffer)=>{for(let row=0;row<h;row++)buffer.fill(row, row*w*4,(row+1)*w*4)};
for(const [width,height] of [[3,2],[6,4],[3,2]]){disposed=false;const canvas=capturePreview(renderer,scene,new T.Camera(),width,height);assert.equal(canvas.width,width);assert.equal(canvas.height,height);assert.equal(lastPixels[0],height-1);assert.equal(lastPixels.at(-1),0);assert.equal(renderer.target,oldTarget);assert.ok(renderer.viewport.equals(oldViewport));assert.equal(disposed,true)}
console.log('PASS: repeated render/readback at changing dimensions, upright preview pixels, no renderer-state leaks');

let seenTarget;
renderer.setViewport=()=>{throw Error('DPR-scaled viewport must not be changed')};renderer.setScissor=()=>{throw Error('global scissor must not be changed')};renderer.setScissorTest=()=>{throw Error('global scissor test must not be changed')};renderer.getPixelRatio=()=>2;
renderer.render=()=>{seenTarget=renderer.target;assert.deepEqual(seenTarget.viewport.toArray(),[0,0,360,200]);assert.equal(seenTarget.scissorTest,false)};
capturePreview(renderer,scene,new T.Camera(),360,200);assert.equal(renderer.target,oldTarget);
console.log('PASS: high-DPR previews use target physical-pixel viewport without changing global viewport/scissor');

// Run real integration initialization/apply/reset with only DOM/viewer construction stubbed.
const {setupFlightSelection}=await import('./dist/selection-integration.mjs');
const {FlightState}=await import('./dist/flight.mjs');
const {groundHeight}=await import('./dist/world.mjs');
function integrationFor(selection){
 globalThis.localStorage={getItem:()=>JSON.stringify(selection)};
 const oldSelect={before(){},value:''},oldButton={},brand={firstChild:{nodeType:3,textContent:''}};
 globalThis.document={createElement:()=>({setAttribute(){}}),getElementById:id=>id==='areaSelect'?oldSelect:oldButton,querySelector:selector=>selector==='.brand'?brand:{}};
 const state=new FlightState();let callbacks,vehicle,clears=0;
 const api=setupFlightSelection({state,setVehicle:id=>vehicle=id,clearInputs:()=>clears++,updateHUD(){},closeHelp(){},selectorFactory:options=>{callbacks=options;return {open(){}}}});
 return {state,api,get callbacks(){return callbacks},get vehicle(){return vehicle},get clears(){return clears}};
}
for(const {id:vehicle} of VEHICLES){
 const session=integrationFor({region:'airfield',vehicle});assert.equal(session.state.z,1.2,'initial airfield pad');assert.equal(session.vehicle,vehicle);assert.equal(session.state.aircraft,vehicle);
 Object.assign(session.state,{x:90,y:100,z:34,crashed:true,paused:false,elapsed:12,gate:3});session.api.reset();assert.equal(session.state.z,1.2,'reset/crash restart returns to pad');assert.equal(session.state.crashed,false);assert.equal(session.state.paused,true);assert.equal(session.state.gate,0);assert.equal(session.vehicle,vehicle);assert.equal(session.state.aircraft,vehicle);assert.equal(session.clears,1);
}
for(const region of REGIONS.slice(1)){
 const session=integrationFor({region:region.id,vehicle:'micro65'});assert.equal(session.state.region,REGIONS.indexOf(region));assert.equal(session.state.z,groundHeight(session.state.x,session.state.y)+7);
 session.state.z+=100;session.state.crashed=true;session.api.reset();assert.equal(session.state.z,groundHeight(session.state.x,session.state.y)+7);assert.equal(session.state.crashed,false);
}
const session=integrationFor({region:'airfield',vehicle:'whoop75'});Object.assign(session.state,{x:8,y:12,z:23,elapsed:17,gate:2});
session.callbacks.onApply({region:'airfield',vehicle:'scout85'},{areaChanged:false,vehicleChanged:true});assert.deepEqual([session.state.x,session.state.y,session.state.z,session.state.elapsed,session.state.gate],[8,12,23,17,2],'aircraft-only selection preserves flight');
session.callbacks.onApply({region:'harbor',vehicle:'scout85'},{areaChanged:true,vehicleChanged:false});
session.callbacks.onApply({region:'airfield',vehicle:'scout85'},{areaChanged:true,vehicleChanged:false});assert.equal(session.state.z,7,'explicit relocation retains historical airborne spawn');session.api.reset();assert.equal(session.state.z,1.2,'subsequent race reset uses pad');
console.log('PASS: real selection initialization/reset at 1.2m race pad, crash recovery, other-region spawns, explicit 7m relocation and aircraft-only position preservation');

for(const {id:vehicle} of VEHICLES){
 const active=integrationFor({region:'airfield',vehicle:'whoop75'});
 active.callbacks.onOpen();active.callbacks.onApply({region:'airfield',vehicle},{areaChanged:false,vehicleChanged:true});
 assert.equal(active.state.aircraft,vehicle);assert.equal(active.vehicle,vehicle);assert.equal(active.api.selected.vehicle,vehicle);active.callbacks.onClose();active.api.reset();assert.equal(active.state.aircraft,vehicle);
 globalThis.localStorage={getItem:()=>saved,setItem:(k,v)=>saved=v};saveSelection({vehicle,region:'airfield'});assert.equal(loadSelection().vehicle,vehicle);
}
console.log('PASS: all five selected profiles initialize/apply/reset/persist with their actual geometry IDs');

