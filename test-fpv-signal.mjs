import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8'),post=main.slice(main.indexOf('const postMat='),main.indexOf('bindBrightness(document'));
assert(post.includes('if(fpv>.5){float shift=.0022;'));
assert(post.includes(')*.5,.22);}gl_FragColor'),'softening remains inside FPV guard');
assert(post.includes('-.5)*.065*fpv;'));
assert(post.includes('col*=1.+.03*fpv*sin(uvv.y*resolution.y*3.14159);'));
assert(post.includes('float vig=1.-.16*r*fpv'),'vignette unchanged');
assert(post.includes('1.+.095*r*fpv'),'lens distortion unchanged');
assert(main.includes('Math.min(1,576/h)'),'no extra whole-scene pixelation');
assert.equal((post.match(/#include <colorspace_fragment>/g)||[]).length,1);
assert(post.indexOf('#include <colorspace_fragment>')<post.indexOf('float noise='),'noise remains after display transfer');
assert(post.indexOf('float noise=')<post.indexOf('col*=brightness'),'existing display-space brightness gain retained');
// Read constants from the actual shader, then check its noise/scanline arithmetic.
const noiseStrength=Number(post.match(/-.5\)\*([.\d]+)\*fpv;/)[1]);
const scanStrength=Number(post.match(/col\*=1\.\+([.\d]+)\*fpv\*sin/)[1]);
function signal(value,fpv,grain,phase){return (value+(grain-.5)*noiseStrength*fpv)*(1+scanStrength*fpv*Math.sin(phase))}
for(const value of [.05,.2,.5,.85]){
 assert.equal(signal(value,0,0,Math.PI/2),value,'chase stays clean');
 const samples=[];for(const grain of [.1,.9])for(const phase of [0,Math.PI/2,Math.PI,3*Math.PI/2])samples.push(signal(value,1,grain,phase));
 assert(Math.abs(samples.reduce((s,v)=>s+v,0)/samples.length-value)<1e-12,'balanced signal modulation does not darken mean terrain');
}
assert(noiseStrength*.5*255>8&&noiseStrength*.5*255<9);
assert.equal(scanStrength,.03);
console.log('PASS: stronger FPV-only chroma/softening/grain/scanlines, unchanged lens/vignette/576px target, one display transfer, zero-mean scan/noise, clean chase and retained brightness');
console.log('Signal arithmetic/guards only; actual analog feel and rendered visibility require private-device feedback');
