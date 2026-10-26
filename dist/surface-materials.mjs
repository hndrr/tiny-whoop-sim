import * as T from './vendor/three.module.min.js';
import {SIZE,pixels,meanLinearAlbedo} from './surface-patterns.mjs';
export function createSurfaceMaterials(renderer,{coarse=false}={}){
 const textures=[];
 function texture(kind,data,size=SIZE){const t=new T.DataTexture(pixels(kind,data,size),size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=data?T.NoColorSpace:T.SRGBColorSpace;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(coarse?2:4,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;textures.push(t);return t}
 function surface(kind,tileMeters,bumpScale){const map=texture(kind,false),detail=texture(kind,true),material=new T.MeshStandardMaterial({color:0xffffff,map,roughnessMap:detail,bumpMap:detail,bumpScale,roughness:1,metalness:0});material.userData.tileMeters=tileMeters;return material}
 // Smaller 128px detail for cargo surfaces: ribs and boards stay several texels
 // wide at their tile scale. Colour is divided by the map's mean albedo.
 function detailed(kind,tileMeters,bumpScale,color,roughness,metalness){const map=texture(kind,false,128),detail=texture(kind,true,128),material=new T.MeshStandardMaterial({color,map,roughnessMap:detail,bumpMap:detail,bumpScale,roughness,metalness});material.color.multiplyScalar(1/meanLinearAlbedo(map.image.data));material.userData.tileMeters=tileMeters;return material}
 return {asphalt:weathered(surface('asphalt',4,.025)),concrete:surface('concrete',3,.018),container:detailed('corrugated',2,.012,'#6b827b',.75,.15),crate:detailed('planks',1.5,.01,'#8c704b',1,0),textures};
}
// Box faces use metre-scaled UVs, avoiding stretched aggregate on long runways.
export function surfaceBoxGeometry(size,tileMeters){const geo=new T.BoxGeometry(1,1,1),uv=geo.attributes.uv,normals=geo.attributes.normal;for(let i=0;i<uv.count;i++){const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i));const width=nx>.5?size[2]:size[0],height=ny>.5?size[2]:size[1];uv.setXY(i,uv.getX(i)*width/tileMeters,uv.getY(i)*height/tileMeters)}return geo}
// One static, low-resolution analytic sky for rough metal reflections, no cubecamera.
export function createSkyEnvironment(renderer){if(!renderer.extensions.has('EXT_color_buffer_float'))return null;const width=256,height=128,bytes=new Uint8Array(width*height*4);for(let y=0;y<height;y++){const elevation=-Math.cos(y/(height-1)*Math.PI),sky=Math.max(0,elevation);for(let x=0;x<width;x++){const o=(y*width+x)*4;const rgb=elevation<0?[.25,.27,.23]:[.62-sky*.35,.73-sky*.29,.79-sky*.20];for(let k=0;k<3;k++)bytes[o+k]=Math.round(rgb[k]*255);bytes[o+3]=255}}
 const source=new T.DataTexture(bytes,width,height);source.colorSpace=T.LinearSRGBColorSpace;source.mapping=T.EquirectangularReflectionMapping;source.needsUpdate=true;const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel(),xr=renderer.xr.enabled,autoClear=renderer.autoClear;
 const setTarget=renderer.setRenderTarget,created=new Set(),disposed=new Set();
 const onDispose=event=>disposed.add(event.target);
 let generator,failed=false;
 try{
  generator=new T.PMREMGenerator(renderer);
  // r180 owns its ping-pong target but not the result on a thrown render.
  // Capture both through public APIs during this synchronous one-time operation.
  renderer.setRenderTarget=function(target,...args){if(target&&target!==previous&&!created.has(target)){created.add(target);target.addEventListener('dispose',onDispose)}return setTarget.call(this,target,...args)};
  return generator.fromEquirectangular(source);
 }catch{failed=true;return null}
 finally{
  renderer.setRenderTarget=setTarget;
  source.dispose();generator?.dispose();
  if(failed)for(const target of created)if(!disposed.has(target))target.dispose();
  for(const target of created)target.removeEventListener('dispose',onDispose);
  renderer.setRenderTarget(previous,face,level);renderer.xr.enabled=xr;renderer.autoClear=autoClear;
 }
}
// Cylinders close on the same mirrored-image edge; caps use planar metre UVs.
export function scaleCylinderSurfaceUV(geometry,{diameter,height,tileMeters,repeat=1}){
 const uv=geometry.attributes.uv,position=geometry.attributes.position,normal=geometry.attributes.normal;
 const spans=2*Math.max(1,Math.round(Math.PI*diameter*repeat/tileMeters/2));
 for(let i=0;i<uv.count;i++){
  if(Math.abs(normal.getZ(i))>.5)uv.setXY(i,(position.getX(i)+diameter/2)/tileMeters,(position.getY(i)+diameter/2)/tileMeters);
  else uv.setXY(i,uv.getX(i)*spans/repeat,uv.getY(i)*height/tileMeters);
 }
 return geometry;
}
// Breaks the 4 m asphalt tile at runway scale: broad world-space patching,
// darker oil/rubber patches and faint wheel streaks along the runway (+y).
// Mean multiplier stays ~1, so the authored average brightness is kept.
export function weathered(material){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=function(shader,renderer){
  previous.call(this,shader,renderer);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSurfaceWorld;').replace('#include <begin_vertex>',`#include <begin_vertex>
vec4 surfaceWorld=vec4(transformed,1.);
#ifdef USE_BATCHING
surfaceWorld=batchingMatrix*surfaceWorld;
#endif
#ifdef USE_INSTANCING
surfaceWorld=instanceMatrix*surfaceWorld;
#endif
vSurfaceWorld=(modelMatrix*surfaceWorld).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vSurfaceWorld;
float wearHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float wearNoise(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.-2.*u);return mix(mix(wearHash(i),wearHash(i+vec2(1.,0.)),u.x),mix(wearHash(i+vec2(0.,1.)),wearHash(i+vec2(1.,1.)),u.x),u.y);}`).replace('#include <map_fragment>',`#include <map_fragment>
{
 vec2 w=vSurfaceWorld.xy;
 float broad=wearNoise(w/23.)*.6+wearNoise(w/9.+5.1)*.4;
 float stain=smoothstep(.62,.8,wearNoise(w/5.3+11.7));
 float streak=smoothstep(.55,.85,wearNoise(vec2(w.x*1.4,w.y*.035)+2.3))*smoothstep(.3,.6,wearNoise(w/31.));
 diffuseColor.rgb*=(.9+.2*broad)*(1.-.22*stain)*(1.-.18*streak)*1.035;
}`);
 };
 material.customProgramCacheKey=()=>`${key()}|weathered-v1`;
 return material;
}

