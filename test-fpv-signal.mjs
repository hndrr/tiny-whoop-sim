import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FEED,feedFragmentShader} from './dist/feed-post.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
// The FPV goggle chain keeps its approved strengths; the video pass adds
// rolling-shutter skew, link breakup, glow, sun flare and exposure on top.
assert.deepEqual(FEED.fpv,{lens:.095,chroma:.0022,soft:.22,tap:.0018,vignette:.16,grain:.065,scan:.03});
for(const hdr of [false,true]){
 const post=feedFragmentShader({colorManaged:hdr});
 assert(post.includes('mix(0.0300,0.0950,fpv)*r'),'lens distortion: FPV unchanged');
 assert(post.includes('float vig=1.-mix(0.0800,0.1600,fpv)*r'),'vignette: FPV unchanged');
 assert(post.includes('col*=1.+mix(0.0180,0.0300,fpv)*sin(uvv.y*resolution.y*mix(1.5707963,3.14159,fpv))'),'FPV scanlines unchanged');
 assert(main.includes('Math.min(1,576/h)'),'no extra whole-scene pixelation');
 assert.equal((post.match(/#include <colorspace_fragment>/g)||[]).length,1);assert.equal(post.includes('#include <tonemapping_fragment>'),hdr);
 assert(post.indexOf('#include <colorspace_fragment>')<post.indexOf('float noise='),'noise remains after display transfer');
 assert(post.indexOf('float noise=')<post.indexOf('col*=brightness'),'display-space brightness gain retained');
 for(const part of ['uv.x+=jello.x*(uvv.y-.5)','float weak=smoothstep(.3,1.,signal)','vec3 glow=','if(sun.z>0.)','col*=texture2D(exposureMap,vec2(.5)).r;'])assert(post.includes(part),part);
 assert(post.indexOf('col*=texture2D(exposureMap')<post.indexOf('#include <colorspace_fragment>'),'exposure acts in scene-linear light');
}
// Zero-mean grain and scanlines at full link: they never darken mean terrain.
function signal(value,grain,phase){return (value+(grain-.5)*FEED.fpv.grain)*(1+FEED.fpv.scan*Math.sin(phase))}
for(const value of [.05,.2,.5,.85]){
 const samples=[];for(const grain of [.1,.9])for(const phase of [0,Math.PI/2,Math.PI,3*Math.PI/2])samples.push(signal(value,grain,phase));
 assert(Math.abs(samples.reduce((s,v)=>s+v,0)/samples.length-value)<1e-12,'balanced signal modulation does not darken mean terrain');
}
assert(FEED.fpv.grain*.5*255>8&&FEED.fpv.grain*.5*255<9);
console.log('PASS: approved FPV lens/chroma/softening/grain/scanlines/vignette and 576px target, one display transfer, linear exposure, added skew/breakup/glow/flare, zero-mean noise and retained brightness');
console.log('Signal arithmetic/source checks only; actual analog feel and rendered visibility require device feedback');
