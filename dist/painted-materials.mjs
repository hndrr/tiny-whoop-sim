import * as T from './vendor/three.module.min.js';
export const PAINTED_ASSETS=Object.freeze({concrete:'painted-concrete-256.webp',hangar:'painted-hangar-256.webp',foliage:'painted-foliage-256.webp',bark:'painted-bark-256.webp'});
// Local original generated albedos only. Texture decoding can fail independently;
// keep the established procedural/material fallback for each failed surface.
export async function loadPaintedTextures(renderer,{coarse=false,load=url=>new T.TextureLoader().loadAsync(url)}={}){
 const entries=await Promise.all(Object.entries(PAINTED_ASSETS).map(async([name,file])=>{
  let texture;
  try{
   texture=await load(new URL(`./assets/${file}`,import.meta.url).href);
   texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.MirroredRepeatWrapping;
   texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;
   texture.anisotropy=Math.min(coarse?2:4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
   return [name,texture];
  }catch{texture?.dispose();return [name,null]}
 }));
 return Object.fromEntries(entries);
}
export function applyPaintedArchitecture(surfaces,roofMaterial,{concrete,hangar}){
 if(concrete&&surfaces.concrete.map!==concrete){
  const previous=surfaces.concrete.map;
  // The shared concrete geometry has a 3 m UV span; this gives painted 6 m tiles.
  concrete.repeat.set(.5,.5);surfaces.concrete.map=concrete;surfaces.concrete.color.set(0xffffff);surfaces.concrete.bumpScale=.008;surfaces.concrete.needsUpdate=true;
  const index=surfaces.textures.indexOf(previous);if(index>=0)surfaces.textures.splice(index,1);
  surfaces.textures.push(concrete);previous?.dispose();
 }
 if(hangar){roofMaterial.map=hangar;roofMaterial.color.set(0xffffff);roofMaterial.roughness=.85;roofMaterial.metalness=.15;roofMaterial.needsUpdate=true}
}
