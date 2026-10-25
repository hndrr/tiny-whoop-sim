import * as T from './vendor/three.module.min.js';
import {WORLD_HALF,terrainHeight} from './world.mjs';
import {ATMOSPHERE,CLOUD_GLSL} from './atmosphere.mjs';
const SUN=ATMOSPHERE.sunDirection;

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

// Highest vertex of a patch. Near-LOD edges interpolate between coarse grid
// vertices, which are themselves grid samples, so the grid maximum is exact.
export function terrainPatchMaxHeight(cx,cy,segments=24){
 let max=-Infinity;
 for(let j=0;j<=segments;j++)for(let i=0;i<=segments;i++)max=Math.max(max,terrainHeight(cx-250+500*i/segments,cy-250+500*j/segments));
 return max;
}

// Mean linear albedo of the neutral grass grain (sRGB codes low..low+span,
// uniformly distributed), so distant fading keeps average brightness.
export function noiseMapMean(low=210,span=24,steps=4096){
 const eotf=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);let sum=0;
 for(let i=0;i<steps;i++)sum+=eotf((low+span*(i+.5)/steps)/255);
 return sum/steps;
}
export const TERRAIN_SHADING=Object.freeze({detailNear:60,detailFar:380,patchNear:18,patchFar:55,rockSlope:[.18,.32],macroScale:[170,47],shoreTop:1.6,wetTop:-1.4});
// Per-pixel richness on the faceted terrain, all procedural and texture-free:
// broad soil/vegetation variation, rock on steep faces, a wet shoreline band.
// The grain map fades to its mean with distance (no distant moire), like an
// optical layer that is only resolved near the viewer.
export function applyTerrainShading(material,{detailMean}){
 const c=TERRAIN_SHADING,f=v=>v.toFixed(4);
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrainWorld;').replace('#include <begin_vertex>',`#include <begin_vertex>
vec4 terrainWorld=vec4(transformed,1.);
#ifdef USE_BATCHING
terrainWorld=batchingMatrix*terrainWorld;
#endif
vTerrainWorld=(modelMatrix*terrainWorld).xyz;`);
  if(shader.uniforms)shader.uniforms.cloudClock=material.userData.cloudClock??{value:0};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vTerrainWorld;
uniform float cloudClock;${CLOUD_GLSL}
float terrainHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float terrainNoise(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.-2.*u);return mix(mix(terrainHash(i),terrainHash(i+vec2(1.,0.)),u.x),mix(terrainHash(i+vec2(0.,1.)),terrainHash(i+vec2(1.,1.)),u.x),u.y);}`).replace('#include <map_fragment>',`#ifdef USE_MAP
float terrainNear=1.-smoothstep(${f(c.detailNear)},${f(c.detailFar)},distance(vTerrainWorld,cameraPosition));
diffuseColor.rgb*=mix(vec3(${f(detailMean)}),texture2D(map,vMapUv).rgb,terrainNear);
#endif`).replace('#include <color_fragment>',`#include <color_fragment>
{
 vec3 faceNormal=normalize(cross(dFdx(vTerrainWorld),dFdy(vTerrainWorld)));
 float slope=1.-abs(faceNormal.z);
 float macro=terrainNoise(vTerrainWorld.xy/${f(c.macroScale[0])})*.65+terrainNoise(vTerrainWorld.xy/${f(c.macroScale[1])}+7.3)*.35;
 diffuseColor.rgb*=.84+.32*macro;
 diffuseColor.rgb*=mix(vec3(1.),vec3(1.07,.98,.85),smoothstep(.56,.8,macro)*.55);
 diffuseColor.rgb*=mix(vec3(1.),vec3(.9,1.05,.8),smoothstep(.44,.22,macro)*(1.-smoothstep(.06,.14,slope))*(1.-smoothstep(230.,300.,vTerrainWorld.z))*.5);
 #ifdef USE_MAP
 diffuseColor.rgb*=mix(1.,.9+.2*terrainNoise(vTerrainWorld.xy/11.),terrainNear);
 #endif
 float rock=smoothstep(${f(c.rockSlope[0])},${f(c.rockSlope[1])},slope+(macro-.5)*.06);
 if(rock>0.){float grain=terrainNoise(vTerrainWorld.xy/7.)*.6+terrainNoise(vTerrainWorld.xy/2.3)*.4;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.205,.196,.172)*(.78+.44*grain),rock*.85);}
 diffuseColor.rgb*=1.-.32*(1.-smoothstep(${f(-2.4)},${f(c.wetTop)},vTerrainWorld.z));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.29,.25,.17),(1.-smoothstep(${f(c.wetTop)},${f(c.shoreTop)},vTerrainWorld.z))*.35);
 // Close-range ground: grass and bare-earth patches at a few metres, a small
 // sun-lit relief and sparse flower specks. Fades out before it can alias.
 float patchNear=1.-smoothstep(${f(c.patchNear)},${f(c.patchFar)},distance(vTerrainWorld,cameraPosition));
 if(patchNear>0.){
  vec2 w=vTerrainWorld.xy;
  float patchN=terrainNoise(w/3.1)*.6+terrainNoise(w/1.3+4.7)*.4;
  float land=(1.-rock)*smoothstep(${f(c.wetTop)},${f(c.wetTop+.8)},vTerrainWorld.z)*(1.-smoothstep(230.,280.,vTerrainWorld.z));
  float grassy=smoothstep(.4,.62,patchN)*land;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.74,.93,.58),grassy*.6*patchNear);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.04,.9,.74),smoothstep(.3,.14,patchN)*land*.45*patchNear);
  vec2 e=vec2(.35,0.);float hx=terrainNoise((w+e)/.9)-terrainNoise((w-e)/.9),hy=terrainNoise((w+e.yx)/.9)-terrainNoise((w-e.yx)/.9);
  diffuseColor.rgb*=1.+clamp(hx*${f(-SUN[0])}+hy*${f(-SUN[1])},-.6,.6)*.32*patchNear;
  vec2 cell=floor(w*2.5);float speck=step(.982,terrainHash(cell))*step(length(fract(w*2.5)-.5),.16)*grassy;
  diffuseColor.rgb=mix(diffuseColor.rgb,terrainHash(cell+3.1)>.5?vec3(.86,.8,.36):vec3(.82,.84,.86),speck*.8*patchNear);
 }
}`).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
reflectedLight.directDiffuse*=1.-cloudShadow(vTerrainWorld,cloudClock);`);
 };
 material.customProgramCacheKey=()=>'terrain-shading-v2';
 return material;
}
