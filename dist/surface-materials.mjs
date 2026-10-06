import * as T from './vendor/three.module.min.js';
import {SIZE,pixels} from './surface-patterns.mjs';
export function createSurfaceMaterials(renderer,{coarse=false}={}){
 const textures=[];
 function texture(kind,data){const t=new T.DataTexture(pixels(kind,data),SIZE,SIZE,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=data?T.NoColorSpace:T.SRGBColorSpace;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(coarse?2:4,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;textures.push(t);return t}
 function surface(kind,tileMeters,bumpScale){const map=texture(kind,false),detail=texture(kind,true),material=new T.MeshStandardMaterial({color:0xffffff,map,roughnessMap:detail,bumpMap:detail,bumpScale,roughness:1,metalness:0});material.userData.tileMeters=tileMeters;return material}
 return {asphalt:surface('asphalt',4,.025),concrete:surface('concrete',3,.018),textures};
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
