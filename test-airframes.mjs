import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from './dist/vendor/three.module.min.js';
import {VEHICLES,createVehicle,disposeVehicle,getVehicle,bakeVehicle} from './dist/vehicle-catalog.mjs';

// Geometry, transforms and material values of the three original frames after the
// graphics upgrade: one lathe duct with rounded bead lips replaces each cylinder
// plus two torus rims, and materials gained clear coats. The exact bounding
// envelope of every frame is pinned below and is unchanged from before.
const originalSignatures={
 whoop75:'0bcae1aeba569ce770fae85dc686b4c73b16d02d7309677610b46b38e7f3a5c7',
 micro65:'d2b2b9407c00823b603b1327733fdc781fea7c70bd562a14529321676c9e70d5',
 scout85:'472515be66f236e5facd721b3f8c2bcf00c829c61f4ab159e3bd45f277b8dadb'
};
const envelopes={whoop75:[-.0508,-.0508,-.0115,.0508,.0508,.039],micro65:[-.0438,-.0438,-.0115,.0438,.0438,.029],scout85:[-.05384,-.05384,-.0115,.05384,.05384,.0415],racer90:[-.0337,-.06565,.002,.0337,.06565,.05],cine95:[-.0632,-.0632,-.0172,.0632,.0632,.0518]};
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
 assert.equal(group.children.filter(o=>o.geometry?.type==='TorusGeometry').length,0,'rims are part of the lathe ducts');
 assert.equal(group.children.filter(o=>o.name==='duct'&&o.geometry.type==='LatheGeometry').length,preset.guards?4:0);
 {const b=meshBounds(group);[...b.min.toArray(),...b.max.toArray()].forEach((v,i)=>close(v,envelopes[preset.id][i],`${preset.id} envelope ${i}`))}
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
  const ducts=group.children.filter(o=>o.name==='duct');assert.equal(ducts.length,4);for(const d of ducts){const b=meshBounds(d);close(b.max.z-b.min.z,.022+2*.0022,'deep cine duct with bead lips')}
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
// Flight copies merge static parts per material and each prop's blades, and add
// blur discs that replace blades while armed. Everything still disposes once.
const baked=[];
for(const preset of VEHICLES){
 const raw=createVehicle(preset.id);let rawMeshes=0;raw.group.traverse(o=>{if(o.isMesh)rawMeshes++});
 const model=bakeVehicle(createVehicle(preset.id));let meshes=0;model.group.traverse(o=>{if(o.isMesh)meshes++});
 assert.equal(model.propellers.length,4);// Static parts + separate FPV-visible ducts + 4 props (blades, blur) + underglow.
 assert(meshes<=15&&meshes<=rawMeshes/2,`${preset.id}: ${meshes} flight meshes vs ${rawMeshes}`);
 const led=model.group.getObjectByName('underglow');assert(led&&led.material.userData.glow===1&&!led.castShadow);
 model.group.userData.setView(true);assert(model.group.children.filter(c=>c.visible).every(c=>c.userData.batchTag==='fpv'||model.propellers.includes(c)),'FPV shows only ducts and props');model.group.userData.setView(false);assert(model.group.children.every(c=>c.visible))
 for(const prop of model.propellers){const blur=prop.children.find(c=>c.name==='prop-blur');assert(blur&&!blur.visible);assert.equal(prop.children.length,2,'merged blades plus blur disc');
  prop.userData.blur(1);assert(blur.visible&&prop.children.every(c=>c===blur||!c.visible));prop.userData.blur(0);assert(!blur.visible&&prop.children.every(c=>c===blur||c.visible))}
 const visible=new T.Box3();model.group.traverse(o=>{if(o.isMesh&&o.name!=='prop-blur')visible.expandByObject(o,true)});
 [...visible.min.toArray(),...visible.max.toArray()].forEach((v,i)=>close(v,envelopes[preset.id][i],`${preset.id} baked envelope ${i}`));
 const geometries=new Set(),materials=new Set();let gd=0,md=0;model.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});
 geometries.forEach(g=>g.addEventListener('dispose',()=>gd++));materials.forEach(m=>m.addEventListener('dispose',()=>md++));disposeVehicle(model.group);assert.equal(gd,geometries.size);assert.equal(md,materials.size);
 baked.push({id:preset.id,rawMeshes,meshes});
}
console.log('Baked flight airframes:',JSON.stringify(baked));
console.log('PASS: original geometry preserved, five distinct airframes, new structural components, static/swept dimensions, 17-slice rotor clearance, full GPU disposal');
console.log(JSON.stringify(stats,null,2));
