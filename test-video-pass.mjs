import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {EXPOSURE,exposureTarget,createExposure} from './dist/exposure.mjs';
import {SIGNAL,linkLoss,createSignalModel} from './dist/signal-model.mjs';
import {CAMERA_MOTION,createCameraMotion} from './dist/camera-motion.mjs';
import {AIRFRAME_FX,createAirframeEffects,groundDustColor} from './dist/airframe-effects.mjs';
import {FEED,createFeedPost,markGlow} from './dist/feed-post.mjs';
import {createFlightRenderTarget} from './dist/render-color.mjs';
import {QUALITY_LEVELS} from './dist/render-quality.mjs';
import {terrainHeight,SEA_LEVEL} from './dist/world.mjs';
import {segmentHitsSolid} from './dist/stage.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
// Exposure: a partial, clamped correction around the authored daylight look.
assert(Math.abs(exposureTarget(EXPOSURE.key)-1)<1e-12);assert(exposureTarget(EXPOSURE.key*4)<1&&exposureTarget(EXPOSURE.key/4)>1);
assert.equal(exposureTarget(10),EXPOSURE.min);assert.equal(exposureTarget(1e-6),EXPOSURE.max);
const unsupported=createExposure({extensions:{has:()=>false}},new T.Texture());assert.equal(unsupported.supported,false);assert.equal(unsupported.texture.image.data[0],1,'neutral gain without float targets');
// Link: clean near the pad, worse with range, behind hills, and behind hangars.
const world={segmentHitsSolid,terrainHeight};
assert.equal(linkLoss({x:0,y:30,z:3},world),0);
assert(linkLoss({x:0,y:-1400-SIGNAL.rangeFull,z:5},world)>=SIGNAL.rangeLoss-1e-9,'open-sea range loss');
assert(linkLoss({x:-750,y:1500,z:-2+terrainHeight(-750,1500)+3},world)>=SIGNAL.terrainLoss,'a ridge between pilot and aircraft');
assert(linkLoss({x:-42,y:80,z:3},world)>=SIGNAL.solidLoss&&linkLoss({x:-42,y:80,z:3},world)<.3,'inside a hangar: mild, still flyable');
const link=createSignalModel(world),far={x:-750,y:1500,z:terrainHeight(-750,1500)+3,crashed:false};
for(let i=0;i<60;i++)link.update(1/60,far);assert(link.level>SIGNAL.terrainLoss*.9);for(let i=0;i<30;i++)link.update(1/60,{x:0,y:30,z:3});assert(link.level<SIGNAL.terrainLoss*.6,'recovers over the release time');
// Camera motion: rotation only, bounded FOV, nothing under reduced motion.
for(const fpv of [true,false]){
 const camera=new T.PerspectiveCamera(fpv?105:72,1,.025,1000),motion=createCameraMotion(),state={x:0,y:0,z:2,vx:0,vy:60,vz:0,heading:0,pitch:0,roll:.4,throttle:.8,paused:false,crashed:false};
 let maxFov=0;for(let i=0;i<240;i++){camera.position.set(1,2,3);camera.quaternion.identity();motion.apply(camera,1/60,state,{fpv,clearance:.8});assert.deepEqual(camera.position.toArray(),[1,2,3],'never translates the camera');maxFov=Math.max(maxFov,camera.fov)}
 if(fpv)assert.equal(maxFov,CAMERA_MOTION.fpvFov,'FPV lens is fixed');else{assert(maxFov>CAMERA_MOTION.chaseFov+8&&maxFov<=CAMERA_MOTION.chaseFov+CAMERA_MOTION.chaseFovGain+1e-9,'chase FOV breathes with speed, bounded')}
 const still=createCameraMotion(),c2=new T.PerspectiveCamera(fpv?105:72,1,.025,1000);for(let i=0;i<60;i++){c2.quaternion.identity();still.apply(c2,1/60,state,{fpv,clearance:.8,reducedMotion:true})}
 assert(c2.quaternion.equals(new T.Quaternion()),'reduced motion: no shake or bank follow');assert.equal(c2.fov,fpv?105:72);assert.equal(still.output.yawRate,0);
}
// FPV is hard-mounted: no yaw sway at all, only a sub-pixel pitch vibration.
{const camera=new T.PerspectiveCamera(105,1,.025,1000),motion=createCameraMotion(),state={x:0,y:0,z:1,vx:0,vy:40,vz:0,heading:0,pitch:0,roll:0,throttle:1,paused:false,crashed:false},dir=new T.Vector3();
 const bound=CAMERA_MOTION.vibration.fpv*(.35+state.throttle)+1e-9;
 for(let i=0;i<240;i++){camera.quaternion.identity();motion.apply(camera,1/60,state,{fpv:true,clearance:.5});camera.getWorldDirection(dir);
  assert(Math.abs(Math.atan2(dir.x,-dir.z))<1e-9,'FPV camera never yaws against the airframe');assert(Math.abs(Math.asin(dir.y))<=bound,'FPV pitch vibration stays sub-pixel')}
 // Frame-time jitter on a steady turn must not flicker the skew rate.
 const rates=createCameraMotion(),c3=new T.PerspectiveCamera(105,1,.025,1000);let heading=0,seen=[];
 for(let i=0;i<240;i++){const dt=i%2?1/50:1/75;heading+=1.2*dt+(i%3-1)*.004;c3.quaternion.identity();rates.apply(c3,dt,{...state,heading},{fpv:true,clearance:.5});if(i>60)seen.push(rates.output.yawRate)}
 assert(Math.max(...seen)-Math.min(...seen)<.6,'smoothed yaw rate');assert(Math.abs(seen.reduce((a,b)=>a+b)/seen.length-1.2)<.15,'still tracks the real turn rate');
 const hover=createCameraMotion();for(let i=0;i<60;i++){c3.quaternion.identity();hover.apply(c3,1/60,{...state,heading:(i%2)*.0002},{fpv:true})}assert.equal(hover.output.yawRate,0,'tiny rates fall in the deadzone');}
// Rotor dust over land only, within 1.2 m and while flying; contact shade under a low hover.
{const scene=new T.Scene(),fx=createAirframeEffects(scene),hover={x:-60,y:-30,z:terrainHeight(-60,-30)+.4,throttle:.6,paused:false,crashed:false};
 for(let i=0;i<60;i++)fx.update(1/60,hover);assert(fx.alive>40&&fx.alive<=AIRFRAME_FX.maxDust);assert(fx.dust.visible&&fx.shade.visible);
 const high=createAirframeEffects(new T.Scene());for(let i=0;i<60;i++)high.update(1/60,{...hover,z:hover.z+5});assert.equal(high.alive,0);assert(!high.shade.visible);
 const sea=createAirframeEffects(new T.Scene());for(let i=0;i<60;i++)sea.update(1/60,{x:0,y:-1400,z:SEA_LEVEL+.4,throttle:.6,paused:false,crashed:false});assert.equal(sea.alive,0,'the sea has its own ripples');
 const still=createAirframeEffects(new T.Scene());for(let i=0;i<60;i++)still.update(1/60,hover,{reducedMotion:true});assert.equal(still.alive,0);
 assert(groundDustColor(5,25,0).r>.5,'grey runway dust');}
// Video pass per-frame optics: sun projection, blur gating, chase-only focus.
{const target=createFlightRenderTarget({floatDepth:true}),post=createFeedPost({target}),u=post.material.uniforms,camera=new T.PerspectiveCamera(72,16/9,.025,20000),drone=new T.Object3D();
 assert.equal(target.texture.generateMipmaps,true);assert.equal(target.texture.minFilter,T.LinearMipmapLinearFilter);assert.equal(target.resolveDepthBuffer,true);assert.equal(u.hasDepth.value,1);
 const sun=new T.Vector3(-80,-95,140).normalize();camera.position.set(0,0,2);camera.lookAt(sun.clone().multiplyScalar(100).add(camera.position));camera.updateMatrixWorld();drone.position.set(0,.8,2);
 const state={vx:0,vy:0,vz:0,paused:false};post.update(1/60,{camera,state,fpv:false,drone,level:QUALITY_LEVELS[0]});
 assert(Math.abs(u.sun.value.x-.5)<1e-3&&Math.abs(u.sun.value.y-.5)<1e-3&&u.sun.value.z>0,'sun at the centre when looking at it');assert.equal(u.blurTaps.value,0,'no blur at rest');assert.equal(u.dofStrength.value,1);
 state.vy=40;post.update(1/60,{camera,state,fpv:true,drone,level:QUALITY_LEVELS[0]});assert.equal(u.blurTaps.value,6);assert.equal(u.dofStrength.value,0,'FPV keeps everything in focus');
 assert.equal(u.jello.value.y,0,'no per-frame scanline wobble on the FPV lens');post.update(1/60,{camera,state,fpv:false,drone,motion:{yawRate:0,pitchRate:0,shake:.01},level:QUALITY_LEVELS[0]});assert(u.jello.value.y>0,'chase camera keeps its soft-mount wobble');
 post.update(1/60,{camera,state,fpv:true,drone,level:QUALITY_LEVELS.at(-1)});assert.equal(u.blurTaps.value,0,'low quality drops motion blur');
 post.update(1/60,{camera,state,fpv:true,drone,reducedMotion:true,level:QUALITY_LEVELS[0]});assert.equal(u.blurTaps.value,0);assert.deepEqual(u.jello.value.toArray(),[0,0]);}
// Glow marks compose with existing hooks and alter only feed alpha.
{const m=markGlow(new T.MeshBasicMaterial(),.7),shader={fragmentShader:T.ShaderLib.basic.fragmentShader,vertexShader:''};m.onBeforeCompile(shader,null);assert(shader.fragmentShader.includes('#include <opaque_fragment>\ngl_FragColor.a=0.300;'));assert(m.customProgramCacheKey().endsWith('|glow0.7'))}
for(let i=1;i<QUALITY_LEVELS.length;i++)for(const key of ['bloom','flare','dof','motionTaps','grass'])assert(QUALITY_LEVELS[i][key]<=QUALITY_LEVELS[i-1][key],`${key} never rises as quality drops`);
assert(main.indexOf('cameraLife(dt);')<main.indexOf('renderer.render(scene,camera)'));assert(main.indexOf('renderer.render(scene,camera)')<main.indexOf('videoFx(dt);renderer.setRenderTarget(null)'));
assert(main.includes("drone.visible=!fpv||drone.userData.fpvParts===true&&reversedDepth;drone.userData.setView?.(fpv);"));
console.log('PASS: partial clamped exposure, range/terrain/hangar link loss with release, rotation-only camera life with bounded chase FOV, land-only rotor dust and contact shade, sun/blur/focus optics and quality gating, composable glow marks, frame ordering');
console.log('CPU checks only; rendered optics, analog feel and GPU cost need browser/device verification.');
