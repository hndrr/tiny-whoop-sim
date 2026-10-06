import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as T from './dist/vendor/three.module.min.js';
import {WORLD_OBJECTS,WORLD_HALF,terrainHeight} from './dist/world.mjs';
import {SOLIDS} from './dist/stage.mjs';
import {createTerrainGeometry} from './dist/terrain-visuals.mjs';
import {surfaceBoxGeometry} from './dist/surface-materials.mjs';
import {groundSlabPlacement,coveredSupportPlacement,groundSurfaceGeometry,SURFACE_LAYERS} from './dist/render-surfaces.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8'),selector=readFileSync(new URL('./dist/flight-selector.mjs',import.meta.url),'utf8');
const snapshot=JSON.stringify({SOLIDS,WORLD_OBJECTS});
const top=o=>o.position[2]+o.size[2]/2,bottom=o=>o.position[2]-o.size[2]/2;
const close=(a,b,m,eps=1e-9)=>assert(Math.abs(a-b)<eps,`${m}: ${a} vs ${b}`);
const between=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a);return text.slice(a,b)};
// Exercise the actual main box helper, including its asphalt-only floor hook,
// corrected UV sizing and unchanged single-mesh geometry/material path.
const scene=new T.Scene(),asphalt=new T.MeshStandardMaterial(),other=new T.MeshStandardMaterial();asphalt.userData.tileMeters=4;
// Exact top-face UV parity, winding and metre scale for each corrected slab.
for(const size of [[8,24,.238],[30,44,.238],[18,16,.218],[55,8,.066]]){
 const plane=groundSurfaceGeometry(size,4),boxGeometry=surfaceBoxGeometry(size,4),p=plane.attributes.position,uv=plane.attributes.uv;
 const indices=[];for(let i=0;i<boxGeometry.attributes.normal.count;i++)if(boxGeometry.attributes.normal.getZ(i)===1)indices.push(i);
 for(let i=0;i<p.count;i++){const j=indices[i];assert.deepEqual([p.getX(i),p.getY(i),p.getZ(i)],[boxGeometry.attributes.position.getX(j),boxGeometry.attributes.position.getY(j),boxGeometry.attributes.position.getZ(j)]);assert.deepEqual([uv.getX(i),uv.getY(i)],[boxGeometry.attributes.uv.getX(j),boxGeometry.attributes.uv.getY(j)])}
 const a=new T.Vector3().fromBufferAttribute(p,plane.index.getX(0)),b=new T.Vector3().fromBufferAttribute(p,plane.index.getX(1)),c=new T.Vector3().fromBufferAttribute(p,plane.index.getX(2));assert(b.sub(a).cross(c.sub(a)).z>0,'top triangles face upward');plane.dispose();boxGeometry.dispose();
}
const context={T,scene,surfaces:{asphalt},groundSlabPlacement,groundSurfaceGeometry,surfaceBoxGeometry};
const {box}=runInNewContext(between(main,'function mesh(','function texture(')+';({box})',context);
const floors=[];
for(const object of [...SOLIDS,...WORLD_OBJECTS]){
 const view=object.material==='floor'?groundSlabPlacement(object.position,object.size,{indoor:true}):coveredSupportPlacement(object);
 assert.deepEqual(view.position.slice(0,2),object.position.slice(0,2));assert.deepEqual(view.size.slice(0,2),object.size.slice(0,2));close(bottom(view),bottom(object),'base stays fixed');
 if(object.material==='floor'&&view.position!==object.position){
  floors.push(object);const mesh=box(object.position,object.size,asphalt,scene,true);mesh.updateMatrixWorld();
  close(mesh.position.z+mesh.scale.z/2,terrainHeight(...object.position)+SURFACE_LAYERS.floor,'indoor floor stays clearly above plateau');
  assert.equal(mesh.material,asphalt);assert.equal(mesh.geometry.type,'PlaneGeometry');for(let i=0;i<mesh.geometry.attributes.normal.count;i++)assert.equal(mesh.geometry.attributes.normal.getZ(i),1,'corrected slabs have no portal-side lip');assert.equal(mesh.children.length,0);
  const plain=box(object.position,object.size,other);assert.deepEqual(plain.position.toArray(),object.position,'non-floor materials are not raised');
 }
}
assert.equal(floors.length,9,'only three airfield and six village floors are corrected');
// The tunnel's floor ends meet wall ends at y=64/88. Its corrected top must
// not create a competing vertical face along the 18 mm visible portal lip.
const tunnelFloor=box([32,76,-.12],[8,24,.2],asphalt,scene,true);tunnelFloor.updateMatrixWorld();
for(const [y,direction] of [[60,1],[92,-1]])for(const x of [28.07,35.93]){
 const ray=new T.Raycaster(new T.Vector3(x,y,.009),new T.Vector3(0,direction,0));
 assert.equal(ray.intersectObject(tunnelFloor).length,0,'portal-end ray cannot hit a coplanar floor side');
}

const terrainMeshes=new Map(),ray=new T.Raycaster(),terrainMaterial=new T.MeshBasicMaterial();
let floorSamples=0,minimumGap=Infinity;
for(const floor of floors)for(const segments of [24,6]){
 const view=groundSlabPlacement(floor.position,floor.size,{indoor:true});
 for(const u of [-.45,0,.45])for(const v of [-.45,0,.45]){
  const x=floor.position[0]+u*floor.size[0],y=floor.position[1]+v*floor.size[1];
  const cx=Math.floor((x+WORLD_HALF)/500)*500-WORLD_HALF+250,cy=Math.floor((y+WORLD_HALF)/500)*500-WORLD_HALF+250,key=`${cx},${cy},${segments}`;
  if(!terrainMeshes.has(key)){const mesh=new T.Mesh(createTerrainGeometry(cx,cy,segments),terrainMaterial);mesh.position.set(cx,cy,0);mesh.updateMatrixWorld();terrainMeshes.set(key,mesh)}
  ray.set(new T.Vector3(x,y,10000),new T.Vector3(0,0,-1));const hits=ray.intersectObject(terrainMeshes.get(key));assert(hits.length>0);
  const gap=top(view)-hits[0].point.z;assert(gap>.0179&&gap<.0181,'raised floor beats both actual terrain LODs without a large visual step');minimumGap=Math.min(minimumGap,gap);floorSamples++;
 }
}
// West paving overlaps the north hangar. Deterministic layers prevent replacing
// the old terrain conflict with a new paving/floor conflict.
const paving=groundSlabPlacement([-42,61,-.04],[55,8,.04]);
const hangar=groundSlabPlacement([-42,80,-.12],[44,24,.2],{indoor:true});
close(top(paving),.006,'paving clearance');close(top(hangar)-top(paving),.012,'floor wins the shared strip');
for(const object of [{position:[5,25,.025],size:[23,125,.05]},{position:[32,25,.02],size:[31,75,.04]},...WORLD_OBJECTS.filter(o=>o.material==='floor'&&o.region!==3)]){
 const view=groundSlabPlacement(object.position,object.size,{indoor:true});assert.equal(view.position,object.position,'raised runway/deck does not get moved');assert.equal(view.size,object.size);
}
const supports=WORLD_OBJECTS.filter(o=>coveredSupportPlacement(o).position!==o.position);assert.equal(supports.length,6);
assert.equal(supports.filter(o=>o.region===1).length,4);assert.equal(supports.filter(o=>o.region===4).length,2);
for(const support of supports){const view=coveredSupportPlacement(support);close(top(support)-top(view),.02,'support hides below its covering face');close(bottom(support),bottom(view),'support base unchanged')}
assert.equal(JSON.stringify({SOLIDS,WORLD_OBJECTS}),snapshot,'all collision and world records are unchanged');
assert(main.includes('for(const o of SOLIDS)box(o.position,o.size,stageMats[o.material],scene,true)'));
assert(main.includes('const view=coveredSupportPlacement(o);m=box(view.position,view.size,stageMats[o.material]||yellow,regionGroups[o.region],true)'));
// Real custom ShaderMaterial construction, with no GPU. Include expansion checks
// catch missing chunks/helpers; they do not claim driver shader compilation.
const sky=runInNewContext(between(main,'const skyGeo=','const oceanMat=')+';({skyMat})',{T,scene}).skyMat;
const ocean=runInNewContext(between(main,'const oceanMat=','const airfieldStart=')+';({oceanMat})',{T,mesh(){}}).oceanMat;
const backdrop=runInNewContext(between(selector,'function createBackdrop(){','function releaseCapture()')+';createBackdrop()',{T});
const contact=backdrop.children[1].material;
function expand(shader){return shader.replace(/#include <([\w]+)>/g,(_,name)=>{assert.equal(typeof T.ShaderChunk[name],'string');return expand(T.ShaderChunk[name])})}
for(const material of [sky,ocean,contact]){
 assert(material.vertexShader.includes('#include <common>'));assert(material.vertexShader.includes('#include <logdepthbuf_pars_vertex>'));assert(material.vertexShader.includes('#include <logdepthbuf_vertex>'));
 assert(material.fragmentShader.includes('#include <logdepthbuf_pars_fragment>'));assert(material.fragmentShader.includes('#include <logdepthbuf_fragment>'));
 const vertex=expand(material.vertexShader),fragment=expand(material.fragmentShader);
 assert(vertex.includes('bool isPerspectiveMatrix'));assert(vertex.includes('vFragDepth = 1.0 + gl_Position.w'));
 assert(fragment.includes('gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5'));
 assert.equal((vertex.match(/varying float vFragDepth;/g)||[]).length,1);assert.equal((fragment.match(/uniform float logDepthBufFC;/g)||[]).length,1);
}
assert.equal(backdrop.children[0].material.depthTest,false);assert.equal(backdrop.children[0].material.depthWrite,false);
assert(main.includes('antialias:true,logarithmicDepthBuffer:true,powerPreference:'));
assert(main.includes('PerspectiveCamera(105,1,.025,20000)'),'near clipping, FOV and world reach remain unchanged');
const vendor=readFileSync(new URL('./dist/vendor/three.module.min.js',import.meta.url),'utf8');
assert(vendor.includes('"logDepthBufFC",2/(Math.log(e.far+1)/Math.LN2)'),'pinned renderer updates log factor for every flight/preview camera');
assert(T.ShaderChunk.logdepthbuf_fragment.includes('vIsPerspective == 0.0 ? gl_FragCoord.z'),'orthographic shadow-map depth retains ordinary mapping');
// Quantized depth models use actual common-ray intersections with parallel
// planes. A grazing view increases the ray separation; it must not be modeled
// by comparing two different screen pixels at one world XY.
const near=.025,far=20000,levels=2**24-1,f32=Math.fround;
const conventional=d=>far/(far-near)-far*near/((far-near)*d);
const logarithmic=d=>f32(f32(Math.log2(f32(1+d)))*f32(1/Math.log2(far+1)));
const quantize=v=>Math.round(v*levels);
let oldTies=0,checks=0,minSteps=Infinity;
for(const [distance,height,clearance] of [[8,1.2,.018],[30,1.2,.018],[100,100,.013],[150,150,.013],[250,250,.013],[500,500,.013],[950,950,.013],[1500,1000,.018],[2400,1500,.02]]){
 const nearer=distance*(height-clearance)/height,oldSteps=quantize(conventional(distance))-quantize(conventional(nearer)),steps=quantize(logarithmic(distance))-quantize(logarithmic(nearer));
 if(oldSteps===0)oldTies++;assert(steps>=6,'log-depth resolves representative corrected surface layers despite float32 rounding');minSteps=Math.min(minSteps,steps);checks++;
}
assert(oldTies>=4,'old mapping collapses several aerial layers to the same stored depth');
for(const [n,f] of [[.025,20000],[.1,20000],[.001,10]])for(const d of [n,(n+f)/2,f]){const depth=Math.log2(1+d)/Math.log2(f+1);assert(depth>0&&depth<=1)}
for(const mesh of terrainMeshes.values())mesh.geometry.dispose();terrainMaterial.dispose();for(const mesh of scene.children)mesh.geometry.dispose();asphalt.dispose();other.dispose();sky.dispose();ocean.dispose();for(const mesh of backdrop.children){mesh.geometry.dispose();mesh.material.dispose()}
console.log('PASS: nine indoor floors above actual near/far terrain, separate paving layer, six covered supports, immutable collision records, three custom depth shaders and preview/orthographic contracts',JSON.stringify({floorSamples,minimumGap,oldTies,checks,minSteps}));
console.log('CPU geometry/depth/source checks only. No GPU reproduction, driver shader compilation, visual clearance approval, or mobile performance guarantee.');
