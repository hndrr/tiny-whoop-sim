import * as T from './vendor/three.module.min.js';
import {createTerrainGeometry,terrainPatchMaxHeight} from './terrain-visuals.mjs';
import {terrainHeight,WORLD_HALF,SEA_LEVEL} from './world.mjs';
// Horizontal adaptivity in the spirit of quadtree tall cells: each 500 m patch
// keeps fine geometry only while its coarse form would be visibly wrong. The
// cost is the far mesh's worst interpolation error projected to feed pixels,
// so one threshold fits every patch size; the switch distance still scales
// with feed height and field of view.
export const TERRAIN_LOD=Object.freeze({patch:500,near:24,far:6,pixelError:3,hysteresis:.2,alwaysNear:160,submergedMargin:.5});

// Height of the far patch's actual triangles (PlaneGeometry split a-b-d / b-c-d).
function farSurface(cx,cy,far){
 const step=TERRAIN_LOD.patch/far,h=(i,j)=>terrainHeight(cx-250+i*step,cy+250-j*step);
 return (x,y)=>{
  const u=Math.min(far-1e-9,Math.max(0,(x-cx+250)/step)),v=Math.min(far-1e-9,Math.max(0,(cy+250-y)/step)),i=Math.floor(u),j=Math.floor(v),fx=u-i,fy=v-j;
  const a=h(i,j),b=h(i,j+1),c=h(i+1,j+1),d=h(i+1,j);
  return fx+fy<=1?a+fx*(d-a)+fy*(b-a):c+(1-fx)*(b-c)+(1-fy)*(d-c);
 };
}
// Worst vertical gap between the near patch vertices and the far surface (m).
export function patchError(cx,cy,geometry=null,far=TERRAIN_LOD.far){
 const near=geometry||createTerrainGeometry(cx,cy,TERRAIN_LOD.near),p=near.attributes.position,surface=farSurface(cx,cy,far);let error=0;
 for(let i=0;i<p.count;i++)error=Math.max(error,Math.abs(p.getZ(i)-surface(p.getX(i)+cx,p.getY(i)+cy)));
 if(!geometry)near.dispose();return error;
}
export function projectedError(error,distance,viewportHeight,fov){return error*viewportHeight/(2*Math.tan(fov*Math.PI/360))/Math.max(distance,1)}
// Distance from a point to a patch's box, so a patch under the camera is at 0.
export function patchDistance(chunk,{x,y,z}){
 const h=TERRAIN_LOD.patch/2,dx=Math.max(0,Math.abs(x-chunk.x)-h),dy=Math.max(0,Math.abs(y-chunk.y)-h),dz=Math.max(0,chunk.minZ-z,z-chunk.maxZ);
 return Math.hypot(dx,dy,dz);
}
export function prefersNear(chunk,position,viewportHeight,fov,wasNear=false){
 const distance=patchDistance(chunk,position);if(distance<TERRAIN_LOD.alwaysNear)return true;
 const pixels=projectedError(chunk.error,distance,viewportHeight,fov),threshold=TERRAIN_LOD.pixelError*(wasNear?1-TERRAIN_LOD.hysteresis:1+TERRAIN_LOD.hysteresis);
 return pixels>threshold;
}

// All emerged patches, both levels, live in one BatchedMesh: a single
// multi-draw call (or a per-patch loop where WEBGL_multi_draw is missing).
// `chunks` keeps {x,y,near,far} with visibility proxies for preview code.
export function createTerrain(material){
 const records=[];
 for(let x=-WORLD_HALF+250;x<WORLD_HALF;x+=500)for(let y=-WORLD_HALF+250;y<WORLD_HALF;y+=500){
  if(terrainPatchMaxHeight(x,y)<SEA_LEVEL-TERRAIN_LOD.submergedMargin)continue;
  const near=createTerrainGeometry(x,y,TERRAIN_LOD.near),far=createTerrainGeometry(x,y,TERRAIN_LOD.far);
  // BatchedMesh needs one index layout; the faceted far patch gets a trivial index.
  far.setIndex([...Array(far.attributes.position.count).keys()]);
  near.computeBoundingBox();records.push({x,y,near,far,minZ:near.boundingBox.min.z,maxZ:near.boundingBox.max.z,error:patchError(x,y,near)});
 }
 const vertices=records.reduce((n,r)=>n+r.near.attributes.position.count+r.far.attributes.position.count,0),indices=records.reduce((n,r)=>n+r.near.index.count+r.far.index.count,0);
 const mesh=new T.BatchedMesh(records.length*2,vertices,indices,material);mesh.name='terrain';mesh.castShadow=false;mesh.receiveShadow=true;
 const matrix=new T.Matrix4(),chunks=[];
 const proxy=id=>({get visible(){return mesh.getVisibleAt(id)},set visible(value){mesh.setVisibleAt(id,Boolean(value))}});
 for(const r of records){
  const ids=[r.near,r.far].map(geometry=>{const instance=mesh.addInstance(mesh.addGeometry(geometry));mesh.setMatrixAt(instance,matrix.makeTranslation(r.x,r.y,0));geometry.dispose();return instance});
  const chunk={x:r.x,y:r.y,minZ:r.minZ,maxZ:r.maxZ,error:r.error,near:proxy(ids[0]),far:proxy(ids[1]),isNear:false,
   prefersNear(position,viewportHeight,fov){return prefersNear(chunk,position,viewportHeight,fov,chunk.isNear)}};
  chunk.near.visible=false;chunks.push(chunk);
 }
 mesh.computeBoundingBox();mesh.computeBoundingSphere();
 return {mesh,chunks,
  update(position,viewportHeight,fov){let near=0;for(const c of chunks){c.isNear=c.prefersNear(position,viewportHeight,fov);c.near.visible=c.isNear;c.far.visible=!c.isNear;near+=c.isNear}return near},
  get nearCount(){return chunks.filter(c=>c.isNear).length}};
}
