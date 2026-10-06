import {createFlightRenderTarget} from './dist/render-color.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REGIONS,regionSpawn,terrainHeight,SEA_LEVEL} from './dist/world.mjs';
import {runInNewContext} from 'node:vm';
import * as T from './dist/vendor/three.module.min.js';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
const functionStart=main.indexOf('function texture(kind)'),functionEnd=main.indexOf('// Continuous',functionStart);
let generated,draws=0;
const canvas={width:0,height:0,getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(image){generated=image.data}}}};
const context={T,document:{createElement:()=>canvas},rand:()=>{draws++;return .5},renderer:{capabilities:{getMaxAnisotropy:()=>4}}};
const texture=runInNewContext(main.slice(functionStart,functionEnd)+';texture("grass")',context);
assert.equal(draws,65536,'map replacement preserves all subsequent seeded scenery');
assert.equal(texture.colorSpace,T.SRGBColorSpace);
assert.deepEqual([...generated.slice(0,4)],[222,222,222,255],'grass detail is neutral; terrain vertex colors supply the hue once');
assert.equal(texture.repeat.x,100);assert.equal(texture.repeat.y,100);
const post=main.slice(main.indexOf('const postMat='),main.indexOf('bindBrightness(document'));
assert(post.includes("${colorManaged?'\\n#include <tonemapping_fragment>\\n':''}\\n#include <colorspace_fragment>\\n"),'sRGB output is unconditional, ACES remains opt-in');
assert.equal((post.match(/#include <colorspace_fragment>/g)||[]).length,1);
assert(post.indexOf('#include <colorspace_fragment>')<post.indexOf('float noise='),'analog noise stays in display space rather than being amplified by sRGB');
assert(post.indexOf('float noise=')<post.indexOf('col*=brightness'),'brightness retains display-space feed gain');
assert(main.includes('renderer.outputColorSpace=T.SRGBColorSpace'));
assert(main.includes('createFlightRenderTarget({hdr:colorManaged})'),'default remains RGBA8, with no HDR-memory increase');
assert.equal(createFlightRenderTarget().texture.colorSpace,T.SRGBColorSpace,'default storage uses hardware sRGB encode/decode; samples remain linear');
assert(T.ShaderChunk.colorspace_fragment.includes('linearToOutputTexel'),'the actual pinned output chunk performs output transfer');
const linear=rgb=>new T.Color().setRGB(...rgb.map(x=>x/255),T.SRGBColorSpace);
const oldMap=linear([120,131,77]),newMap=linear([222,222,222]);
const display=color=>color.clone().convertLinearToSRGB().toArray().map(x=>Math.round(Math.min(1,Math.max(0,x))*255));
const untreated=color=>color.toArray().map(x=>Math.round(Math.min(1,Math.max(0,x))*255));
const results=[];
for(const color of ['#a39b77','#66774a','#737a67']){
 const vertex=new T.Color(color),representativeDiffuse=.45;
 const oldPixel=vertex.clone().multiply(oldMap).multiplyScalar(representativeDiffuse);
 const corrected=vertex.clone().multiply(newMap).multiplyScalar(representativeDiffuse);
 const previous180=untreated(oldPixel.clone().multiplyScalar(1.8)),new100=display(corrected);
 assert(Math.min(...new100)>40,'all terrain hues retain shadow-region detail in this numeric sample');
 assert(new100.every((x,i)=>x>previous180[i]*2),'default corrected sample is readable without slider compensation');
 results.push({vertex:color,old100:untreated(oldPixel),old180:previous180,new100});
}
texture.dispose();
console.log('PASS: one sRGB output conversion, opt-in-only ACES, neutral grass detail, unchanged RNG/UVs, representative terrain display values',JSON.stringify(results));
console.log('Numeric transfer/albedo check only: not rendered pixels, GPU shader validation, calibrated lighting, or a visibility/FPS guarantee');

const stageResults=[];let terrainSamples=0,waterSamples=0;
for(let index=0;index<REGIONS.length;index++){
 const spawn=regionSpawn(index),paths=new Set(),samples=[];
 for(const [dx,dy] of [[0,0],[25,0],[-25,0],[0,25],[0,-25]]){
  const h=terrainHeight(spawn[0]+dx,spawn[1]+dy);
  if(h<SEA_LEVEL){waterSamples++;paths.add('ocean shader');continue}
  terrainSamples++;paths.add('underlying terrain vertex hue × neutral grass detail');
  const hex=h<1?'#a39b77':h>140?'#737a67':'#66774a';
  const value=new T.Color(hex).multiply(newMap).multiplyScalar(.45),rgb=display(value);
  assert(Math.min(...rgb)>40,`${REGIONS[index].id} natural ground keeps representative detail`);samples.push(rgb);
 }
 stageResults.push({region:REGIONS[index].id,paths:[...paths],samples});
}
assert.equal(stageResults.length,8);assert(terrainSamples>20);assert(waterSamples>=5);
assert(stageResults.find(s=>s.region==='offshore').paths.includes('ocean shader'));
const materials=readFileSync(new URL('./dist/surface-materials.mjs',import.meta.url),'utf8');
assert(materials.includes('color:0xffffff,map,roughnessMap:detail'),'concrete retains white base instead of receiving a global material boost');
assert(main.includes('renderer.toneMappingExposure=1.05'));
assert(main.includes("HemisphereLight('#d7e9ff','#777650',2.1)"));
assert(main.includes("DirectionalLight('#fff0d3',3.6)"),'global exposure and lights are unchanged');
console.log('PASS: underlying terrain/water samples around all eight region spawns, natural-terrain numeric floor, ocean distinction, unchanged concrete albedo and global lighting',JSON.stringify(stageResults));
