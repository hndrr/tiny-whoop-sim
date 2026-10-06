import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {WORLD_HALF,terrainHeight} from './dist/world.mjs';
import {createTerrainGeometry,terrainColor} from './dist/terrain-visuals.mjs';

// Independent copy of the pre-facet position/UV contract, including stitched edges.
function baseline(cx,cy,segments){
 const geo=new T.PlaneGeometry(500,500,segments,segments),p=geo.attributes.position;
 for(let i=0;i<p.count;i++){
  const lx=p.getX(i),ly=p.getY(i),x=lx+cx,y=ly+cy;let z=terrainHeight(x,y);
  if(segments>6&&(Math.abs(lx)>249.99||Math.abs(ly)>249.99)){
   const vertical=Math.abs(lx)>249.99,t=vertical?y:x,base=Math.floor((t+WORLD_HALF)/(500/6))*(500/6)-WORLD_HALF,u=(t-base)/(500/6);
   z=vertical?terrainHeight(x,base)*(1-u)+terrainHeight(x,base+500/6)*u:terrainHeight(base,y)*(1-u)+terrainHeight(base+500/6,y)*u;
  }
  p.setZ(i,z);
 }
 return geo;
}
const bytes=geo=>Object.values(geo.attributes).reduce((sum,a)=>sum+a.array.byteLength,geo.index?.array.byteLength??0);
const map=new T.Color().setRGB(210/255,210/255,210/255,T.SRGBColorSpace);
let triangles=0,extraBytes=0,patches=0,minDisplay=255,maxDisplay=0;
const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3();
for(let cx=-WORLD_HALF+250;cx<WORLD_HALF;cx+=500)for(let cy=-WORLD_HALF+250;cy<WORLD_HALF;cy+=500)for(const segments of [24,6]){
 const actual=createTerrainGeometry(cx,cy,segments),original=baseline(cx,cy,segments);
 const reference=segments===6?original.toNonIndexed():original;
 assert.deepEqual(actual.attributes.position.array,reference.attributes.position.array,'every rendered position stays exactly unchanged, including stitched edges');
 assert.deepEqual(actual.attributes.uv.array,reference.attributes.uv.array,'UVs stay exactly unchanged');
 assert.equal((actual.index?.count??actual.attributes.position.count)/3,segments*segments*2);
 assert.equal(actual.groups.length,0,'no added material groups/draw calls');
 if(segments===24)assert.deepEqual(actual.index.array,original.index.array,'near topology remains indexed');
 for(const attr of Object.values(actual.attributes))for(const value of attr.array)assert(Number.isFinite(value));
 const colors=actual.attributes.color;
 for(let i=0;i<colors.count;i++){
  const display=new T.Color().fromBufferAttribute(colors,i).multiply(map).multiplyScalar(.45).convertLinearToSRGB();
  minDisplay=Math.min(minDisplay,display.r*255,display.g*255,display.b*255);
  maxDisplay=Math.max(maxDisplay,display.r*255,display.g*255,display.b*255);
 }
 if(segments===6){
  const p=actual.attributes.position,n=actual.attributes.normal;
  for(let i=0;i<p.count;i+=3){
   a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
   normal.crossVectors(b.sub(a),c.sub(a)).normalize();assert(normal.z>0);
   for(let j=0;j<3;j++){
    assert(normal.distanceTo(new T.Vector3().fromBufferAttribute(n,i+j))<1e-6,'far normals follow actual triangle planes');
    for(let axis=0;axis<3;axis++)assert.equal(colors.array[i*3+axis],colors.array[(i+j)*3+axis],'far faces have coherent colors');
   }
  }
 }
 // Baseline had position, normal, UV, color and index buffers.
 original.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(original.attributes.position.count*3),3));
 extraBytes+=bytes(actual)-bytes(original);patches++;triangles+=segments*segments*2;
 actual.dispose();original.dispose();if(reference!==original)reference.dispose();
}
assert.equal(patches,512);assert.equal(triangles,313344);
assert.equal(extraBytes,1770496,'only distant buffers grow, by 1.69 MiB for the full world');
assert(minDisplay>48,'new palette keeps neutral-map shadow sample above the previous >40 display floor');
for(const z of [0,1,18,28,75,95,125,140,240,275]){
 const low=terrainColor(600,1300,z-1e-4),high=terrainColor(600,1300,z+1e-4);
 assert(Math.max(...low.toArray().map((v,i)=>Math.abs(v-high.toArray()[i])))<1e-5,'no altitude color steps');
}
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
assert(main.includes('vertexColors:true,flatShading:true,roughness:1,map:texture(\'grass\')'));
assert(main.includes('mesh(createTerrainGeometry(cx,cy,segments),terrainMat,[cx,cy,0])'));
assert(T.ShaderChunk.normal_fragment_begin.includes('FLAT_SHADED')&&T.ShaderChunk.normal_fragment_begin.includes('dFdx'),'indexed near meshes use real per-face shader normals');
assert(main.includes("scene.background=new T.Color('#afc4cf');scene.fog=new T.FogExp2('#b8c7ca',.00019)"));
assert(main.includes("HemisphereLight('#d7e9ff','#777650',2.1)"));
assert(main.includes("DirectionalLight('#fff0d3',3.6)"));
console.log('PASS: all 512 terrain LOD meshes retain positions, UVs, triangles and near indices; flat distant normals/colors finite; broad color continuity; unchanged fog/light',JSON.stringify({triangles,extraBytes,minDisplay,maxDisplay}));
console.log('CPU geometry/albedo checks only, not a WebGL render, visual approval, or mobile FPS measurement.');
