import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import * as T from './dist/vendor/three.module.min.js';
import {createFlightRenderTarget} from './dist/render-color.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
const between=(start,end)=>{const from=main.indexOf(start),to=main.indexOf(end,from);assert(from>=0&&to>from);return main.slice(from,to)};
const compositor=between('const target=createFlightRenderTarget','bindBrightness(document');
const controls=between('function resize(){',"document.body.classList.add('fpv')");
const originalShaderHash={false:'181f0637ce4329c26e467504f003b3624631bca2f40db2011d53120279c69f5b',true:'0710ba34091c748dcada829b76721b5188da8fff16817a23dd5d6d97ddf89ad4'};
let shader;
function makeHarness({hdr=false,reduced=false,listens=true}={}){
 const media={matches:reduced},listeners=new Map(),elements=new Map(),classes=new Map();
 if(listens)media.addEventListener=(name,fn)=>{assert.equal(name,'change');listeners.set('motion',fn)};
 const context={T,createFlightRenderTarget,colorManaged:hdr,matchMedia(query){assert.equal(query,'(prefers-reduced-motion: reduce)');return media},
  innerWidth:390,innerHeight:844,fpv:true,flightStarted:true,renderer:{ratio:1.25,setSize(w,h){this.width=w;this.height=h},getPixelRatio(){return this.ratio}},
  camera:new T.PerspectiveCamera(105,1,.025,20000),chaseCamera:{reset(){}},keys:new Set(),clearSticks(){},updateHUD(){},
  precision:{mission:{active:false,retry(){}}},flightSelection:{reset(){}},s:{crashed:false,paused:true,reset(){}},
  document:{body:{classList:{toggle(name,value){classes.set(name,value)}}}},$(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)},
  addEventListener(name,fn){assert.equal(name,'resize');listeners.set('resize',fn)}
 };
 const result=runInNewContext(compositor+controls+';({postMat,target,postScene,postCam,resize,switchCamera,reset,toggle})',context);
 return {...result,context,media,listeners,classes};
}
for(const hdr of [false,true])for(const reduced of [false,true]){
 const h=makeHarness({hdr,reduced}),{postMat,target}=h,u=postMat.uniforms;shader=postMat.fragmentShader;
 assert.equal(u.chaseMotion.value,reduced?0:1);assert.equal(u.fpv.value,1);assert.equal(u.brightness.value,1);
 assert.equal(u.feed.value,target.texture);assert.equal(h.postScene.children.length,1);assert.equal(h.postScene.children[0].material,postMat);
 assert.equal(target.texture.type,hdr?T.HalfFloatType:T.UnsignedByteType);
 assert.equal(target.texture.colorSpace,hdr?T.LinearSRGBColorSpace:T.SRGBColorSpace);
 // Strip only the two new, chase-exclusive branches and unused chase uniform.
 // Everything else must match the approved 53b030a FPV shader token for token.
 const chaseBlocks=shader.match(/if\(fpv<\.5\)\{[^{}]*\}/g);assert.equal(chaseBlocks.length,2);
 const legacy=shader.replace(/\/\/[^\n]*/g,'').replace(/if\(fpv<\.5\)\{[^{}]*\}/g,'').replace('uniform float chaseMotion;','').replace(/\s+/g,'');
 assert.equal(createHash('sha256').update(legacy).digest('hex'),originalShaderHash[hdr],'SDR/HDR FPV shader is unchanged');
 assert.equal((shader.match(/#include <colorspace_fragment>/g)||[]).length,1);
 assert(shader.indexOf('vec2 tap=')<shader.indexOf('#include <colorspace_fragment>'),'sample mixing stays in scene-linear space');
 assert(shader.indexOf('#include <colorspace_fragment>')<shader.indexOf('float chaseNoise='));
 assert(shader.indexOf('float chaseNoise=')<shader.indexOf('col*=brightness'));
 assert(!chaseBlocks.join('').includes('vig'),'no darkening vignette in chase');
 assert(!chaseBlocks.join('').includes('floor('),'no quantized coordinates or low-resolution pixelation');
 assert.equal((chaseBlocks.join('').match(/texture2D\(/g)||[]).length,2,'chase adds exactly two taps to the existing pass');
 assert(!shader.includes('sRGBTransferEOTF'),'hardware-decoded feed is never decoded twice');
 // Actual uniform/lifecycle wiring: repeat switches, brightness changes, reset,
 // portrait/landscape resizing and preference changes without new targets.
 const texture=target.texture;
 for(const [w,height,ratio] of [[390,844,1.25],[844,390,1.25],[1920,1080,1.75],[320,480,1],[1,1,1]]){
  h.context.innerWidth=w;h.context.innerHeight=height;h.context.renderer.ratio=ratio;
  for(let iteration=0;iteration<8;iteration++){
   h.switchCamera();h.resize();assert.equal(u.fpv.value,h.context.fpv?1:0);
   const scale=h.context.fpv?Math.min(1,576/height):ratio;
   assert.equal(target.width,Math.floor(w*scale));assert.equal(target.height,Math.floor(height*scale));
   assert.deepEqual(u.resolution.value.toArray(),[w,height]);assert.equal(target.texture,texture);assert.equal(u.feed.value,texture);
   assert.equal(h.context.camera.fov,h.context.fpv?105:72);assert.equal(h.classes.get('fpv'),h.context.fpv);
   u.brightness.value=.6+iteration*.15;const gain=u.brightness.value,mode=u.fpv.value;
   for(const missionActive of [false,true]){h.context.precision.mission.active=missionActive;h.reset();assert.equal(u.fpv.value,mode);assert.equal(u.brightness.value,gain)}
   h.media.matches=!h.media.matches;h.listeners.get('motion')();assert.equal(u.chaseMotion.value,h.media.matches?0:1);assert.equal(u.fpv.value,mode);assert.equal(u.brightness.value,gain);
  }
 }
 target.dispose();h.postScene.children[0].geometry.dispose();postMat.dispose();
}
// Browsers without the modern preference-change listener still honor its initial state.
for(const reduced of [false,true]){const h=makeHarness({reduced,listens:false});assert.equal(h.postMat.uniforms.chaseMotion.value,reduced?0:1);h.target.dispose();h.postMat.dispose();h.postScene.children[0].geometry.dispose()}
// Numeric checks derive every coefficient from the actual shader source.
const tap=Number(shader.match(/vec2 tap=vec2\(([.\d]+)\/max/)[1]);
const softness=Number(shader.match(/mix\(col,\(left\+right\)\*\.5,([.\d]+)\)/)[1]);
const chroma=Number(shader.match(/mix\(col\.rb,vec2\(right\.r,left\.b\),([.\d]+)\)/)[1]);
const grain=Number(shader.match(/float chaseNoise=[^;]*\*([.\d]+);/)[1]);
const scan=Number(shader.match(/col\+=chaseNoise;col\*=1\.\+([.\d]+)\*sin/)[1]);
assert.equal(tap,.65);assert.equal(softness,.12);assert.equal(chroma,.14);assert.equal(grain,.012);assert.equal(scan,.006);
assert(tap*chroma<.1,'effective color-kernel offset remains subpixel');assert(grain<.065*.2);assert.equal(scan,.03*.2);
function mix(a,b,t){return a*(1-t)+b*t}
function spatial(center,left,right){return center.map((value,c)=>{const soft=mix(value,(left[c]+right[c])*.5,softness);return c===1?soft:mix(soft,c===0?right[c]:left[c],chroma)})}
function signal(value,noise,phase){return (value+(noise-.5)*grain)*(1+scan*Math.sin(phase))}
const bound=grain/2+scan+grain/2*scan;
for(const gain of [.6,1,1.8])for(const value of [.02,.05,.2,.5,.85,.98]){
 const flat=spatial([value,value,value],[value,value,value],[value,value,value]);
 assert(flat.every(v=>Math.abs(v-value)<1e-15),'constant color is unchanged by convex scene-linear mixing');
 let sum=0,count=0;
 for(const noise of [0,.1,.25,.75,.9,1])for(const phase of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
  const result=signal(value,noise,phase)*gain;sum+=result;count++;
  assert(Math.abs(result-value*gain)<=bound*gain+1e-15);
 }
 assert(Math.abs(sum/count-value*gain)<1e-14,'balanced, unclipped flat-color samples preserve mean brightness');
}
assert(bound*255<3.07,'default-gain signal perturbation is bounded to 3.07 display codes before clipping');
for(const left of [0,.2,.8,1])for(const center of [0,.2,.8,1])for(const right of [0,.2,.8,1]){
 const out=spatial([center,center,center],[left,left,left],[right,right,right]);
 assert(out.every(v=>v>=Math.min(left,center,right)-1e-15&&v<=Math.max(left,center,right)+1e-15),'positive spatial taps introduce no ringing or overshoot');
}
const fract=x=>x-Math.floor(x),hash=(x,y)=>fract(Math.sin(x*12.9898+y*78.233)*43758.5453);
function chaseNoise(x,y,time,motion){const shift=fract(time*motion)*333;return (hash(x+shift,y+shift)-.5)*grain}
assert.equal(chaseNoise(20.3,40.5,0,0),chaseNoise(20.3,40.5,10.37,0),'reduced motion freezes new grain');
assert.notEqual(chaseNoise(20.3,40.5,0,1),chaseNoise(20.3,40.5,.37,1));
console.log('PASS: full-resolution chase analog, exact legacy SDR/HDR FPV shader hashes, one pass/target, color-space/brightness order, reduced motion, switches/resizes/reset and bounded zero-mean signal');
console.log('Chase strengths:',JSON.stringify({tapCssPixels:tap,softness,chroma,effectiveChromaCssPixels:tap*chroma,grainPeakCodes:grain*.5*255,scanPercent:scan*100,maxUnclippedSignalDeltaCodes:bound*255}));
console.log('Source/lifecycle and CPU arithmetic checks only; shader compilation, rendered appearance and mobile FPS are not verified');
