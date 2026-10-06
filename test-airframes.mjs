import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from './dist/vendor/three.module.min.js';
import {VEHICLES,createVehicle,disposeVehicle,getVehicle} from './dist/vehicle-catalog.mjs';

// Geometry, transforms and material values captured before adding the two new frames.
// Keep the original airframes intact while adding new silhouettes to the catalog.
const originalSignatures={
 whoop75:'ed320221e081680e9df140829ff1dd085fb42c6a1998dff5a0068364c404c6dd',
 micro65:'2ab12546b4212f698fc41d65b95daea01a4f2a3ae029604ea00cfbdfb3e8a277',
 scout85:'add8f8e3521eb8e81ed1e9018189c7a4105ec650b6bc633fa21d5671cf3bf16c'
};
function geometrySignature(group){
 const parts=[];
 group.traverse(o=>parts.push({
  type:o.type,position:o.position.toArray(),rotation:o.rotation.toArray(),scale:o.scale.toArray(),
  geometry:o.geometry&&{
   type:o.geometry.type,parameters:o.geometry.parameters,
   attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,a])=>[k,Array.from(a.array)]))
  },
  material:o.material&&{color:o.material.color.getHex(),metalness:o.material.metalness,roughness:o.material.roughness}
 }));
 return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-6,`${label}: ${actual} != ${expected}`);
const meshBounds=mesh=>new T.Box3().setFromObject(mesh,true);
const namedCount=(group,name)=>group.children.filter(o=>o.name===name).length;

// Intersect every stationary mesh triangle with horizontal blade-height slices.
// A slice segment inside any swept rotor disk means the frame can hit a spinning blade.
function assertRotorClearance({group,propellers,preset}){
 group.updateMatrixWorld(true);
 const propMeshes=new Set(propellers.flatMap(p=>p.children)),rotorRadius=preset.radius*.91;
 for(let layer=0;layer<=16;layer++){
  const z=.0192+layer*.0001;
  group.traverse(mesh=>{
   if(!mesh.isMesh||propMeshes.has(mesh))return;
   const position=mesh.geometry.attributes.position,index=mesh.geometry.index?.array;
   for(let i=0;i<(index?.length||position.count);i+=3){
    const vertices=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(position,index?index[i+j]:i+j).applyMatrix4(mesh.matrixWorld));
    const crossings=[];
    for(let k=0;k<3;k++){
     const a=vertices[k],b=vertices[(k+1)%3];
     if((a.z<=z&&b.z>=z)||(a.z>=z&&b.z<=z)){
      if(Math.abs(b.z-a.z)<1e-10)crossings.push(a,b);
      else crossings.push(a.clone().lerp(b,(z-a.z)/(b.z-a.z)));
     }
    }
    if(crossings.length<2)continue;
    for(let edge=1;edge<crossings.length;edge++)for(const prop of propellers){
     const a=crossings[0],b=crossings[edge],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
     const fraction=length?Math.max(0,Math.min(1,((prop.position.x-a.x)*dx+(prop.position.y-a.y)*dy)/length)):0;
     const clearance=Math.hypot(a.x+fraction*dx-prop.position.x,a.y+fraction*dy-prop.position.y);
     assert.ok(clearance>=rotorRadius,`${preset.id}: ${mesh.name||mesh.geometry.type} intersects a prop at z=${z}`);
    }
   }
  });
 }
}

assert.deepEqual(VEHICLES.map(v=>v.id),['whoop75','micro65','scout85','racer90','cine95']);
assert.equal(getVehicle('unknown').id,'whoop75');
const stats=[];
for(const preset of VEHICLES){
 const model=createVehicle(preset.id),{group,propellers}=model;
 assert.equal(model.preset,preset);
 assert.equal(group.userData.vehicleId,preset.id);
 assert.equal(propellers.length,4);
 assert.equal(new Set(propellers.map(p=>p.position.toArray().join(','))).size,4);
 assert.ok(propellers.every(p=>p.children.length===preset.blades));
 assert.ok(preset.camera.length===3&&preset.camera.every(Number.isFinite));
 assert.equal(group.children.filter(o=>o.geometry?.type==='TorusGeometry').length,preset.guards?8:0);
 const size=meshBounds(group).getSize(new T.Vector3());
 assert.ok(size.toArray().every(n=>Number.isFinite(n)&&n>0));
 if(originalSignatures[preset.id])assert.equal(geometrySignature(group),originalSignatures[preset.id],`${preset.id} original geometry/materials changed`);
 if(preset.id==='racer90'){
  for(const name of ['race-bottom-deck','race-top-deck','race-pointed-canopy','race-tail-fin'])assert.ok(group.getObjectByName(name),name);
  close(group.getObjectByName('race-bottom-deck').geometry.parameters.width,.019,'racer deck width');
  close(group.getObjectByName('race-bottom-deck').geometry.parameters.height,.077,'racer deck length');
  assert.equal(group.getObjectByName('race-tail-fin').geometry.type,'ExtrudeGeometry');
  close(meshBounds(group.getObjectByName('race-tail-fin')).max.z,.050,'upright tail fin height');
  for(const p of propellers){close(Math.abs(p.position.x),.0297,'racer motor x');close(Math.abs(p.position.y),.0429,'racer motor y');}
  close(size.x,.0674,'racer static width');close(size.y,.1313,'racer length');close(size.z,.048,'racer height');
  const swept=new T.Box3();
  for(let step=0;step<32;step++){propellers.forEach(p=>p.rotation.z=step*Math.PI/16);swept.union(meshBounds(group));}
  close(swept.getSize(new T.Vector3()).x,.1049,'racer swept width');
  propellers.forEach(p=>p.rotation.z=0);
  assertRotorClearance(model);
 }
 if(preset.id==='cine95'){
  assert.ok(group.getObjectByName('cine-canopy'));
  assert.ok(group.getObjectByName('cine-camera-mount'));
  assert.equal(namedCount(group,'cine-camera-cage'),5);
  assert.equal(namedCount(group,'cine-landing-skid'),4);
  assert.equal(namedCount(group,'cine-skid-support'),4);
  assert.ok(group.children.filter(o=>o.name==='cine-landing-skid').every(o=>meshBounds(o).max.z<0));
  assert.equal(group.children.filter(o=>o.geometry?.type==='CylinderGeometry'&&o.geometry.parameters.openEnded&&o.geometry.parameters.height===.022).length,4);
  close(size.x,.1264,'cine width');close(size.y,.1264,'cine length');close(size.z,.069,'cine height');
  assertRotorClearance(model);
 }
 const geometries=new Set(),materials=new Set();let meshes=0,geometryDisposals=0,materialDisposals=0;
 group.traverse(o=>{if(o.isMesh)meshes++;if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});
 geometries.forEach(g=>g.addEventListener('dispose',()=>geometryDisposals++));
 materials.forEach(m=>m.addEventListener('dispose',()=>materialDisposals++));
 disposeVehicle(group);
 assert.equal(geometryDisposals,geometries.size,`${preset.id} must dispose every geometry exactly once`);
 assert.equal(materialDisposals,materials.size,`${preset.id} must dispose every shared material exactly once`);
 stats.push({id:preset.id,boundsMm:size.toArray().map(n=>+(n*1000).toFixed(2)),meshes});
}
console.log('PASS: original geometry preserved, five distinct airframes, new structural components, static/swept dimensions, 17-slice rotor clearance, full GPU disposal');
console.log(JSON.stringify(stats,null,2));
