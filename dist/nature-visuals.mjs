import * as T from './vendor/three.module.min.js';
// Decorative rocks and wind for grass/tree crowns. Placement keeps the scene's
// seeded random stream; shape variety and tint use a separate integer hash.
export const NATURE=Object.freeze({rockVariants:4,grassFade:[45,70],windStrength:1});
const hash=n=>{n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296};

// Faceted boulder: an icosphere with per-position displacement (shared by all
// faces meeting at a vertex, so no cracks), a flattened bed and a cut top.
// Vertex colour darkens the buried base and adds lichen on upward faces.
export function rockGeometry(variant){
 const geometry=new T.IcosahedronGeometry(1,1),p=geometry.attributes.position,offsets=new Map(),colors=new Float32Array(p.count*3);
 const v=new T.Vector3(),base=new T.Color('#8d897b'),lichen=new T.Color('#79855a'),shade=new T.Color();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);const key=[v.x,v.y,v.z].map(n=>Math.round(n*1e4)).join(',');
  if(!offsets.has(key))offsets.set(key,.78+.4*hash(offsets.size*7+variant*1013+11));
  const top=.62+.1*(variant%3);v.multiplyScalar(offsets.get(key));v.z=Math.max(v.z,-.55);if(v.z>top)v.z=top+(v.z-top)*.5;
  p.setXYZ(i,v.x,v.y,v.z);
 }
 geometry.computeVertexNormals();
 const n=geometry.attributes.normal;
 for(let i=0;i<p.count;i+=3){
  // One colour per face keeps the faceted read under flat shading.
  const z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,up=(n.getZ(i)+n.getZ(i+1)+n.getZ(i+2))/3;
  shade.copy(base).multiplyScalar(.62+.38*Math.min(1,Math.max(0,(z+.55)/.9))*(.92+.16*hash(i+variant*977)));
  shade.lerp(lichen,Math.max(0,Math.min(1,(up-.45)/.4))*(.2+.25*hash(i*13+variant)));
  for(let k=0;k<3;k++)shade.toArray(colors,(i+k)*3);
 }
 geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.computeBoundingSphere();
 return geometry;
}
export function createRockField(records,{material=new T.MeshLambertMaterial({vertexColors:true,flatShading:true})}={}){
 const group=new T.Group();group.name='rock-field';
 const byVariant=Array.from({length:NATURE.rockVariants},()=>[]);
 records.forEach((r,i)=>byVariant[Math.floor(hash(i+4211)*NATURE.rockVariants)].push(r));
 const dummy=new T.Object3D(),tint=new T.Color();
 byVariant.forEach((list,variant)=>{
  if(!list.length)return;
  const mesh=new T.InstancedMesh(rockGeometry(variant),material,list.length);mesh.name=`rocks-${variant}`;mesh.castShadow=true;mesh.receiveShadow=true;
  list.forEach((r,i)=>{dummy.position.set(...r.position);dummy.scale.set(...r.scale);dummy.rotation.set(0,0,r.rotation[2]*Math.PI*2);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);const g=.9+.2*hash(i*31+variant);tint.setRGB(g,g,g*.98);mesh.setColorAt(i,tint)});
  mesh.computeBoundingSphere();group.add(mesh);
 });
 return group;
}

// Wind: bend proportional to height squared, phase travelling across the
// world. Grass blades beyond ~60 m collapse to nothing (no fragments drawn).
export function applyWind(material,{clock,kind,reducedMotion=false,height=1}){
 const strength={value:reducedMotion?0:NATURE.windStrength};
 material.onBeforeCompile=shader=>{
  shader.uniforms.windClock=clock;shader.uniforms.windStrength=strength;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float windClock;\nuniform float windStrength;').replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
{
 vec3 root=instanceMatrix[3].xyz;mat3 basis=mat3(instanceMatrix);float scale2=max(dot(basis[0],basis[0]),1e-6);
 float bend=clamp(${kind==='grass'?'position.z/0.42':`(position.z+8.5)/${(17).toFixed(1)}`},0.,1.);bend*=bend;
 float gust=sin(windClock*${kind==='grass'?'1.9':'.75'}+dot(root.xy,vec2(.11,.07)))+.35*sin(windClock*${kind==='grass'?'3.7':'1.6'}+dot(root.xy,vec2(-.05,.13)));
 vec3 wind=vec3(.8,.6,0.)*gust*bend*windStrength*${kind==='grass'?'.07':'.22'};
 transformed+=transpose(basis)*wind/scale2;
 ${kind==='grass'?`transformed*=1.-smoothstep(${NATURE.grassFade[0].toFixed(1)},${NATURE.grassFade[1].toFixed(1)},distance(root,cameraPosition));`:''}
}
#endif`);
 };
 material.customProgramCacheKey=()=>`wind-${kind}-v1`;
 return {strength,setReducedMotion(reduced){strength.value=reduced?0:NATURE.windStrength}};
}
