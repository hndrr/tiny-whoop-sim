import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {OCEAN,coastDepthTexture,createOceanMaterial,createPropWash,createOceanSurface} from './dist/ocean-surface.mjs';
import {SEA_LEVEL,terrainHeight,WORLD_HALF,WORLD_SIZE} from './dist/world.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
// Coastal depth: land is 0, the open sea floor (-9 m) reads 6.6 m of water.
const size=64,coast=coastDepthTexture(size),at=(x,y)=>{const i=Math.floor((x+WORLD_HALF)/WORLD_SIZE*size),j=Math.floor((y+WORLD_HALF)/WORLD_SIZE*size);return coast.image.data[j*size+i]/255*OCEAN.coast.depth};
assert.equal(coast.format,T.RedFormat);assert.equal(coast.magFilter,T.LinearFilter);
assert.equal(at(0,0),0,'airfield is land');assert(Math.abs(at(-3900,-3900)-(SEA_LEVEL-terrainHeight(-3875,-3875)))<OCEAN.coast.depth/255+1e-9,'open sea depth');
assert(Math.abs(at(-3900,-3900)-6.6)<.05);
// Material: footprint-limited swell loop with an early exit, legacy display
// authoring and the shared atmosphere; no vertex displacement.
const material=createOceanMaterial({coast,waveCount:10}),fragment=material.fragmentShader;
assert.equal(material.uniforms.waveCount.value,10);assert(fragment.includes('if(i>=waveCount)break;float fade=clamp(1.8-k*foot*1.6,0.,1.);if(fade<=0.)break;'));
assert(fragment.includes('atmosphereFactor(')&&fragment.includes('float atmosphereDensity('));assert(!material.vertexShader.includes('sin('),'flat surface; waves are normals only');
assert(fragment.trim().endsWith('gl_FragColor=sRGBTransferEOTF(vec4(clamp(color,0.,1.),1.));}'));
// Numeric model of the cut-off: farther / grazing pixels evaluate fewer bands.
const bands=foot=>{let k=.32,n=0;for(let i=0;i<OCEAN.waves;i++){if(1.8-k*foot*1.6<=0)break;n++;k*=1.18}return n};
assert.equal(bands(0),OCEAN.waves);assert(bands(.5)<bands(.1)&&bands(3)<=3,'distant water costs only a few bands');
// Prop wash with a fake renderer: unsupported devices are a no-op.
const none=createPropWash({extensions:{has:()=>false}},material);none.update(1/60,{x:0,y:-1400,z:-2,throttle:.5});assert.equal(none.state.supported,false);
function fakeRenderer(){return {target:null,renders:0,clears:0,extensions:{has:name=>name==='EXT_color_buffer_float'},getRenderTarget(){return this.target},setRenderTarget(t){this.target=t},render(){this.renders++},clear(){this.clears++}}}
const water={x:0,y:-1400,z:SEA_LEVEL+.8,throttle:.6,crashed:false,ditched:false};
// The solver steps at 60 Hz whatever the frame rate, and only while low over water.
for(const hz of [30,60,144]){
 const r=fakeRenderer(),wash=createPropWash(r,createOceanMaterial({coast}));const flight={...water};
 for(let i=0;i<hz;i++)wash.update(1/hz,flight);
 assert(Math.abs(wash.state.steps-60)<=2,`${hz} Hz runs ~60 solver steps per second (${wash.state.steps})`);assert.equal(r.target,null,'restores the bound target');
}
const r=fakeRenderer(),m=createOceanMaterial({coast}),wash=createPropWash(r,m),flight={...water};
wash.update(1/60,flight);assert(wash.state.active);assert.equal(r.clears,2,'fresh field on activation');assert.equal(m.uniforms.rippleFrame.value.w,1);
// Moving 0.5 m scrolls the domain by whole texels (>= 4 texels per shift).
const texel=OCEAN.ripple.span/OCEAN.ripple.size;flight.x+=.5;wash.update(1/60,flight);assert(Math.abs((wash.state.center[0]-water.x)/texel-Math.round((wash.state.center[0]-water.x)/texel))<1e-9);assert(wash.state.center[0]>water.x);
// Climbing away keeps the solver running for the linger time, then stops it.
flight.z=SEA_LEVEL+20;const before=wash.state.steps;for(let i=0;i<60*OCEAN.ripple.linger-2;i++)wash.update(1/60,flight);assert(wash.state.active&&wash.state.steps>before);
for(let i=0;i<10;i++)wash.update(1/60,flight);assert(!wash.state.active);assert.equal(m.uniforms.rippleFrame.value.w,0);const idle=r.renders;for(let i=0;i<120;i++)wash.update(1/60,flight);assert.equal(r.renders,idle,'no GPU passes while idle');
// Over land nothing runs; ditching produces a splash even at zero clearance.
const land=createPropWash(fakeRenderer(),createOceanMaterial({coast}));land.update(1/60,{x:0,y:0,z:1,throttle:.5});assert(!land.state.active);
const ditch=createPropWash(fakeRenderer(),createOceanMaterial({coast}));ditch.update(1/60,{...water,crashed:true,ditched:true});assert(ditch.state.active,'splash on ditching');
// Surface controller: pixel footprint from the feed height and camera FOV.
const surface=createOceanSurface(fakeRenderer(),m);surface.update(1/60,{x:0,y:0,z:1},{fov:72},720);assert(Math.abs(m.uniforms.pixelAngle.value-2*Math.tan(36*Math.PI/180)/720)<1e-12);
surface.setWaveCount(6);assert.equal(m.uniforms.waveCount.value,6);
assert(main.includes('const oceanMat=createOceanMaterial({coast:coastDepthTexture(),waveCount:coarsePointer?OCEAN.coarseWaves:OCEAN.waves});'));
assert(main.includes('oceanSurface.update(dt,s,camera,target.height)'));
console.log('PASS: coastal depth texture, footprint-limited swell with early exit, flat normal-only surface, 60 Hz downwash solver at any frame rate, whole-texel scrolling, linger/idle with no GPU work, splash and pixel-angle wiring');
console.log('CPU/fake-renderer checks only; rendered water appearance and GPU cost need browser verification.');
