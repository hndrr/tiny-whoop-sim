import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.min.js';
import {createForestVisuals} from './dist/forest-visuals.mjs';
const forest=createForestVisuals({random:()=>.5,terrainHeight:()=>0,nearestRegion:()=>({distance:1e4,radius:0})});
const originals=forest.batches.map(b=>new Float32Array(b.crowns.geometry.attributes.color.array));
const mirror=u=>1-Math.abs(((u%2)+2)%2-1);
let seamPairs=0;
for(const {crowns,trunks} of forest.batches){
 const g=crowns.geometry,p=g.attributes.position,uv=g.attributes.uv;
 assert.equal(uv.count,p.count);assert([...uv.array].every(Number.isFinite));
 for(let i=0;i<uv.count;i+=3){
  const us=[uv.getX(i),uv.getX(i+1),uv.getX(i+2)];
  assert(Math.max(...us)-Math.min(...us)<=.400001,'a face must span only its angular slice, not an entire repeated image');
 }
 for(let i=0;i<uv.count;i++)if(uv.getX(i)===0){
  const match=Array.from({length:uv.count},(_,j)=>j).find(j=>uv.getX(j)===2&&Math.abs(uv.getY(j)-uv.getY(i))<1e-6&&Math.hypot(p.getX(j)-p.getX(i),p.getY(j)-p.getY(i),p.getZ(j)-p.getZ(i))<1e-5);
  assert.notEqual(match,undefined,'each closed crown seam has matching position/V at U=0/2');
  assert.equal(mirror(uv.getX(i)),mirror(uv.getX(match)));seamPairs++;
 }
 const tp=trunks.geometry.attributes.position,tu=trunks.geometry.attributes.uv;
 // CylinderGeometry(5 sectors) has two six-vertex torso rows first.
 for(const offset of [0,6]){assert.equal(tu.getX(offset),0);assert.equal(tu.getX(offset+5),2);assert.equal(mirror(tu.getX(offset)),mirror(tu.getX(offset+5)));}
 assert(tp.getZ(0)>tp.getZ(6));assert(tu.getY(0)>tu.getY(6),'bark V increases from root toward +Z tip');
}
assert(seamPairs>20);
const foliage=new T.Texture(),bark=new T.Texture();foliage.wrapS=bark.wrapS=T.MirroredRepeatWrapping;
let externalDisposals=0;foliage.addEventListener('dispose',()=>externalDisposals++);bark.addEventListener('dispose',()=>externalDisposals++);
forest.applyPaintedTextures({foliage,bark});
for(const {crowns,trunks} of forest.batches){
 assert.equal(crowns.material.map,foliage);assert.equal(trunks.material.map,bark);assert.equal(trunks.material.color.getHex(),0xffffff);
 assert([...crowns.geometry.attributes.color.array].every(v=>v>.70&&v<=1.01),'painted tint stays near neutral instead of dark multiplying the albedo');
 assert.equal(crowns.material.transparent,false);assert.equal(crowns.material.alphaTest,0);
}
forest.applyPaintedTextures({bark});forest.batches.forEach((b,i)=>{assert.equal(b.crowns.material.map,null);assert.deepEqual(b.crowns.geometry.attributes.color.array,originals[i]);assert.equal(b.trunks.material.map,bark);});
forest.applyPaintedTextures();for(const b of forest.batches){assert.equal(b.trunks.material.map,null);assert.equal(b.trunks.material.color.getHex(),0x655c49);}
forest.applyPaintedTextures({foliage,bark});forest.dispose();forest.dispose();forest.applyPaintedTextures({foliage,bark});assert.equal(externalDisposals,0,'caller owns map lifetime');
foliage.dispose();bark.dispose();assert.equal(externalDisposals,2);
console.log(`PASS: continuous per-mass UVs, ${seamPairs} closed mirrored seam pairs, +Z bark orientation, neutral painted shading, fallback restoration and caller-owned texture lifetime`);
