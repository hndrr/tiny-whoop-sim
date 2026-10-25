import * as T from './vendor/three.module.min.js';
// Camera-following meadow grass: the ground within the grass fade distance is
// split into fixed cells, and only cells that enter the disc are filled, a few
// per frame, nearest first. Placement is a pure hash of the cell, so returning
// to a spot shows the same tufts. One InstancedMesh, one draw; paved areas,
// building footprints, steep rock, beach and high stone are left bare.
export const GRASS_FIELD=Object.freeze({cell:16,radius:64,capacity:9000,fillPerFrame:6,shoreTop:-1.2,stoneLine:230,maxSlope:.42,hideAbove:70,
 tints:[[1,1,1],[1.08,1.04,.82],[.86,.96,.82],[1.14,1.06,.74]]});
// Full avalanche integer hash (each input mixed in turn), so consecutive blade
// indices do not line up.
const mix=h=>{h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return h^(h>>>16)};
const hash=(a,b,c)=>(mix(mix(mix(a|0)+(b|0))+(c|0))>>>0)/4294967296;
// Axis-aligned footprints in a coarse spatial grid for cheap point queries.
export function footprintIndex(rects,cell=32){
 const grid=new Map(),key=(i,j)=>i*65536+j;
 for(const r of rects){for(let i=Math.floor(r[0]/cell);i<=Math.floor(r[2]/cell);i++)for(let j=Math.floor(r[1]/cell);j<=Math.floor(r[3]/cell);j++){const k=key(i,j);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(r)}}
 return (x,y)=>{const list=grid.get(key(Math.floor(x/cell),Math.floor(y/cell)));if(!list)return false;for(const r of list)if(x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3])return true;return false};
}
// Footprint rectangle of a centred box, with a margin.
export const boxFootprint=(position,size,margin=0)=>[position[0]-size[0]/2-margin,position[1]-size[1]/2-margin,position[0]+size[0]/2+margin,position[1]+size[1]/2+margin];
export function cellsInRange(x,y,{cell=GRASS_FIELD.cell,radius=GRASS_FIELD.radius}={}){
 const cells=[],reach=radius+cell*.7072,ci=Math.floor(x/cell),cj=Math.floor(y/cell),n=Math.ceil(reach/cell);
 for(let i=ci-n;i<=ci+n;i++)for(let j=cj-n;j<=cj+n;j++){const d=Math.hypot((i+.5)*cell-x,(j+.5)*cell-y);if(d<=reach)cells.push({i,j,d})}
 return cells.sort((a,b)=>a.d-b.d);
}
export const maxCells=({cell=GRASS_FIELD.cell,radius=GRASS_FIELD.radius}={})=>{let n=0;const reach=radius+cell*.7072;for(let x=0;x<cell;x+=cell/4)for(let y=0;y<cell;y+=cell/4)n=Math.max(n,cellsInRange(x,y,{cell,radius}).length);return n};
// Blade transforms for one cell: [x,y,z,yaw,tilt,scale,tint] or null (bare).
export function cellBlades(i,j,count,{terrainHeight,exclude=()=>false,cell=GRASS_FIELD.cell}){
 const c=GRASS_FIELD,blades=[];
 for(let k=0;k<count;k++){
  const x=(i+hash(i,j,k*4+1))*cell,y=(j+hash(i,j,k*4+2))*cell,z=terrainHeight(x,y);
  const slope=Math.hypot(terrainHeight(x+.8,y)-terrainHeight(x-.8,y),terrainHeight(x,y+.8)-terrainHeight(x,y-.8))/1.6;
  // Meadow clumps: a low-frequency mask thins grass into patches.
  const clump=.5+.5*Math.sin(x*.21+Math.sin(y*.17)*1.7)*Math.cos(y*.19-x*.05);
  if(z<c.shoreTop||z>c.stoneLine||slope>c.maxSlope||hash(i,j,k*4+3)>.35+.65*clump||exclude(x,y)){blades.push(null);continue}
  const r=hash(i,j,k*4+4);
  blades.push([x,y,z,r*Math.PI*2,(hash(k,i,j)-.5)*.35,.55+1.6*r*r,Math.floor(hash(j,k,i)*c.tints.length)]);
 }
 return blades;
}
// A tuft of blades fanned around the root reads as a clump rather than a
// lone spike. Works on any upright (+z) indexed blade geometry.
export function tuftGeometry(blade,count=4){
 const p=blade.attributes.position,n=blade.attributes.normal,c=blade.attributes.color,index=blade.index.array,pos=[],nor=[],col=[],idx=[],v=new T.Vector3(),m=new T.Matrix4(),lean=new T.Matrix4(),nm=new T.Matrix3();
 for(let b=0;b<count;b++){
  const yaw=b*Math.PI*2/count+(b%2)*.4,tilt=.16+.12*(b%3)/2,shift=.025*(b%2+1);
  m.makeRotationZ(yaw).multiply(lean.makeTranslation(shift,0,0)).multiply(new T.Matrix4().makeRotationY(tilt)).multiply(new T.Matrix4().makeScale(1,1,1-.18*(b%2)));nm.getNormalMatrix(m);
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m);pos.push(v.x,v.y,v.z);v.fromBufferAttribute(n,i).applyMatrix3(nm).normalize();nor.push(v.x,v.y,v.z);if(c)col.push(c.getX(i),c.getY(i),c.getZ(i))}
  for(const k of index)idx.push(k+b*p.count);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));if(c)g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeBoundingSphere();return g;
}
export function createGrassField({geometry,material,terrainHeight,exclude=()=>false,capacity=GRASS_FIELD.capacity}){
 const c=GRASS_FIELD,slots=maxCells(),perCell=Math.max(1,Math.floor(capacity/slots));
 const mesh=new T.InstancedMesh(geometry,material,slots*perCell);mesh.name='grass-field';mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;
 const zero=new T.Matrix4().makeScale(0,0,0),dummy=new T.Object3D(),tint=new T.Color();
 for(let n=0;n<mesh.count;n++){mesh.setMatrixAt(n,zero);mesh.setColorAt(n,tint.setRGB(1,1,1))}
 const live=new Map(),free=Array.from({length:slots},(_,n)=>n);let density=1,filled=0;
 const key=(i,j)=>`${i},${j}`;
 function fill(slot,i,j){
  const used=Math.round(perCell*density),blades=cellBlades(i,j,used,{terrainHeight,exclude});
  for(let k=0;k<perCell;k++){
   const b=k<used?blades[k]:null,n=slot*perCell+k;
   if(!b){mesh.setMatrixAt(n,zero);continue}
   dummy.position.set(b[0],b[1],b[2]);dummy.rotation.set(b[4],0,b[3],'ZXY');dummy.scale.setScalar(b[5]);dummy.updateMatrix();mesh.setMatrixAt(n,dummy.matrix);
   const t=c.tints[b[6]];mesh.setColorAt(n,tint.setRGB(t[0],t[1],t[2]));
  }
  mesh.instanceMatrix.addUpdateRange(slot*perCell*16,perCell*16);mesh.instanceColor.addUpdateRange(slot*perCell*3,perCell*3);filled++;
 }
 function clear(slot){for(let k=0;k<perCell;k++)mesh.setMatrixAt(slot*perCell+k,zero);mesh.instanceMatrix.addUpdateRange(slot*perCell*16,perCell*16)}
 return {mesh,perCell,slots,get cells(){return live.size},get filled(){return filled},
  update(position,{budget=c.fillPerFrame}={}){
   const high=position.z-terrainHeight(position.x,position.y)>c.hideAbove;mesh.visible=!high;if(high)return;
   const wanted=cellsInRange(position.x,position.y),keep=new Set(wanted.map(w=>key(w.i,w.j)));let changed=false;
   for(const [k,slot] of live)if(!keep.has(k)){live.delete(k);free.push(slot);clear(slot);changed=true}
   for(const w of wanted){if(budget<=0)break;const k=key(w.i,w.j);if(live.has(k)||!free.length)continue;const slot=free.pop();live.set(k,slot);fill(slot,w.i,w.j);budget--;changed=true}
   if(changed){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true}
  },
  // Quality level: fraction of each cell's blades; cells refill progressively.
  setDensity(value){const next=Math.max(0,Math.min(1,value));if(next===density)return;density=next;for(const [k,slot] of live){free.push(slot);clear(slot)}live.clear();mesh.instanceMatrix.needsUpdate=true},
  dispose(){mesh.dispose()}};
}
