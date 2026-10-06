import * as T from './vendor/three.module.min.js';
import {WORLD_HALF,terrainHeight} from './world.mjs';

const clamp01=value=>Math.max(0,Math.min(1,value));
const blend=(low,high,value)=>{const t=clamp01((value-low)/(high-low));return t*t*(3-2*t)};
const shore=new T.Color('#a39b77');
const meadow=new T.Color('#758061');
const stone=new T.Color('#8b8879');
const earth=new T.Color('#93866c');

// Broad, continuous geological washes, rather than random per-triangle noise or
// contour stripes. Colors are linear albedo; the neutral grass map supplies detail.
// No directional light is baked in: the real sun defines the facets as you fly.
export function terrainColor(x,y,z,target=new T.Color()){
 target.copy(shore).lerp(meadow,blend(0,28,z));
 target.lerp(stone,blend(95,275,z));
 const wash=(.5+.5*Math.sin(x*.0016+y*.0009))*blend(18,75,z)*(1-blend(125,240,z))*.18;
 return target.lerp(earth,wash);
}

export function createTerrainGeometry(cx,cy,segments){
 const geo=new T.PlaneGeometry(500,500,segments,segments);
 const p=geo.attributes.position,colors=new Float32Array(p.count*3),color=new T.Color();
 for(let i=0;i<p.count;i++){
  const lx=p.getX(i),ly=p.getY(i),x=lx+cx,y=ly+cy;
  let z=terrainHeight(x,y);
  // Preserve the existing coarse-edge interpolation byte-for-byte in intent:
  // adjacent 24/6 LOD patches share the same piecewise-linear boundary.
  if(segments>6&&(Math.abs(lx)>249.99||Math.abs(ly)>249.99)){
   const vertical=Math.abs(lx)>249.99,t=vertical?y:x;
   const base=Math.floor((t+WORLD_HALF)/(500/6))*(500/6)-WORLD_HALF,u=(t-base)/(500/6);
   z=vertical?terrainHeight(x,base)*(1-u)+terrainHeight(x,base+500/6)*u:terrainHeight(base,y)*(1-u)+terrainHeight(base+500/6,y)*u;
  }
  p.setZ(i,z);terrainColor(x,y,z,color);color.toArray(colors,i*3);
 }
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 // Nearby terrain stays indexed: flatShading uses screen-space face normals,
 // so we do not triple the large near-LOD vertex buffers just to split normals.
 if(segments>6){geo.computeVertexNormals();return geo}
 // Only the small distant mesh gets independent face attributes. Its 83 m
 // planes read as large hillside forms, with no extra triangles or draw calls.
 const faceted=geo.toNonIndexed();geo.dispose();
 const c=faceted.attributes.color;
 for(let i=0;i<c.count;i+=3){
  color.setRGB((c.getX(i)+c.getX(i+1)+c.getX(i+2))/3,(c.getY(i)+c.getY(i+1)+c.getY(i+2))/3,(c.getZ(i)+c.getZ(i+1)+c.getZ(i+2))/3);
  for(let j=0;j<3;j++)c.setXYZ(i+j,color.r,color.g,color.b);
 }
 faceted.computeVertexNormals();return faceted;
}
