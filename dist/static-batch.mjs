import * as T from './vendor/three.module.min.js';
// Static scenery repeats a few materials across hundreds of boxes. Baking each
// spatial cell's meshes per material into one geometry turns those into tens of
// draw calls without changing what is drawn; collision never reads meshes.
// Cells keep frustum culling meaningful, as quadtree leaves would.
export const STATIC_BATCH=Object.freeze({cell:120,contactHeight:1,contactTolerance:.35,contactShade:.5,noContact:99});

// Contact shading darkens albedo within a short height of a solid's grounded
// base, from a baked per-vertex height that interpolates exactly (it is linear).
const contactVertex=shader=>shader.vertexShader.replace('#include <common>','#include <common>\nattribute float baseHeight;\nvarying float vBaseHeight;').replace('#include <begin_vertex>','#include <begin_vertex>\nvBaseHeight=baseHeight;');
const contactFragment=shader=>shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vBaseHeight;').replace('#include <color_fragment>',`#include <color_fragment>\ndiffuseColor.rgb*=mix(${STATIC_BATCH.contactShade.toFixed(2)},1.,smoothstep(0.,${STATIC_BATCH.contactHeight.toFixed(2)},vBaseHeight));`);
export function contactShade(shader){shader.vertexShader=contactVertex(shader);shader.fragmentShader=contactFragment(shader)}

export function createStaticBatcher({groundHeight=()=>0,cell=STATIC_BATCH.cell,contact=true}={}){
 const clones=new Map();
 // Batched meshes get their own material copy carrying the contact attribute;
 // non-batched users of the same source material keep the original.
 function materialFor(source){
  if(!contact)return source;
  if(!clones.has(source)){const clone=source.clone();clone.onBeforeCompile=contactShade;clone.userData={...source.userData,batchSource:source};clones.set(source,clone)}
  return clones.get(source);
 }
 const signature=geometry=>Object.keys(geometry.attributes).sort().join(',')+(geometry.index?':i':':n');
 function bake(entries){
  const attributes=Object.keys(entries[0].mesh.geometry.attributes).filter(name=>['position','normal','uv'].includes(name));
  let vertices=0,indices=0;
  for(const {mesh} of entries){const g=mesh.geometry;vertices+=g.attributes.position.count;indices+=g.index?g.index.count:g.attributes.position.count}
  const out={position:new Float32Array(vertices*3),normal:new Float32Array(vertices*3),uv:attributes.includes('uv')?new Float32Array(vertices*2):null,baseHeight:new Float32Array(vertices)};
  const index=new (vertices>65535?Uint32Array:Uint16Array)(indices);
  const p=new T.Vector3(),n=new T.Vector3(),normalMatrix=new T.Matrix3();
  let v=0,i=0;
  for(const {mesh,matrix} of entries){
   const g=mesh.geometry,pos=g.attributes.position,nor=g.attributes.normal,uv=g.attributes.uv;normalMatrix.getNormalMatrix(matrix);
   let low=Infinity,high=-Infinity;const start=v;
   for(let k=0;k<pos.count;k++){p.fromBufferAttribute(pos,k).applyMatrix4(matrix);out.position.set([p.x,p.y,p.z],(v+k)*3);low=Math.min(low,p.z);high=Math.max(high,p.z);n.fromBufferAttribute(nor,k).applyMatrix3(normalMatrix).normalize();out.normal.set([n.x,n.y,n.z],(v+k)*3);if(out.uv)out.uv.set([uv.getX(k),uv.getY(k)],(v+k)*2)}
   // Only solids that stand on the ground get contact shading; slabs, beams,
   // decks and lamps keep their authored albedo everywhere.
   const centre=new T.Vector3().setFromMatrixPosition(matrix),grounded=high-low>.3&&Math.abs(low-groundHeight(centre.x,centre.y))<STATIC_BATCH.contactTolerance;
   for(let k=0;k<pos.count;k++)out.baseHeight[v+k]=grounded?out.position[(v+k)*3+2]-low:STATIC_BATCH.noContact;
   if(g.index)for(let k=0;k<g.index.count;k++)index[i+k]=g.index.getX(k)+start;else for(let k=0;k<pos.count;k++)index[i+k]=start+k;
   v+=pos.count;i+=g.index?g.index.count:pos.count;
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(out.position,3));geometry.setAttribute('normal',new T.BufferAttribute(out.normal,3));
  if(out.uv)geometry.setAttribute('uv',new T.BufferAttribute(out.uv,2));
  if(contact)geometry.setAttribute('baseHeight',new T.BufferAttribute(out.baseHeight,1));geometry.setIndex(new T.BufferAttribute(index,1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
 }
 // Merge direct static Mesh children of a container. Groups (gates, rotors),
 // instanced meshes and anything marked userData.dynamic are left as they are.
 function batch(container){
  container.updateMatrixWorld(true);
  const inverse=new T.Matrix4().copy(container.matrixWorld).invert(),groups=new Map();
  for(const mesh of container.children){
   if(!mesh.isMesh||mesh.isInstancedMesh||mesh.children.length||mesh.userData.dynamic||Array.isArray(mesh.material)||!mesh.geometry.attributes.normal)continue;
   const matrix=new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),centre=new T.Vector3().setFromMatrixPosition(mesh.matrixWorld);
   const key=[mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,Math.floor(centre.x/cell),Math.floor(centre.y/cell),signature(mesh.geometry)].join('|');
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push({mesh,matrix});
  }
  const created=[];
  for(const entries of groups.values()){
   const first=entries[0].mesh,merged=new T.Mesh(bake(entries),materialFor(first.material));
   merged.castShadow=first.castShadow;merged.receiveShadow=first.receiveShadow;merged.name=`static-batch-${first.material.type}-${entries.length}`;merged.userData.batchedCount=entries.length;
   for(const {mesh} of entries)container.remove(mesh);
   container.add(merged);created.push(merged);
  }
  return created;
 }
 // Painted textures arrive after batching; copy them onto the batch clones.
 function syncMaterials(){for(const [source,clone] of clones){const onBeforeCompile=clone.onBeforeCompile,userData=clone.userData;clone.copy(source);clone.onBeforeCompile=onBeforeCompile;clone.userData=userData;clone.needsUpdate=true}}
 return {batch,syncMaterials,materialFor,get materials(){return [...clones.values()]}};
}

// Repeated meshes that share geometry and material become one InstancedMesh
// per kind, parented to `parent` (whose visibility then hides them all).
export function instanceMeshes(meshes,parent){
 parent.updateMatrixWorld(true);
 const inverse=new T.Matrix4().copy(parent.matrixWorld).invert(),kinds=new Map();
 for(const mesh of meshes){mesh.updateWorldMatrix(true,false);const key=`${mesh.geometry.uuid}|${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;if(!kinds.has(key))kinds.set(key,[]);kinds.get(key).push(mesh)}
 const created=[];
 for(const list of kinds.values()){
  const first=list[0],instanced=new T.InstancedMesh(first.geometry,first.material,list.length);
  list.forEach((mesh,i)=>instanced.setMatrixAt(i,new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)));
  instanced.castShadow=first.castShadow;instanced.receiveShadow=first.receiveShadow;instanced.computeBoundingSphere();
  for(const mesh of list)mesh.removeFromParent();
  parent.add(instanced);created.push(instanced);
 }
 return created;
}
