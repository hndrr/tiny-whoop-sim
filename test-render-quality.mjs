import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QUALITY,QUALITY_LEVELS,createQualityController,snapRefresh,initialLevel,levelIndex} from './dist/render-quality.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
// Refresh is estimated from the fastest tenth of early frames and snapped.
assert(Math.abs(snapRefresh(Array(60).fill(8.4))-1000/120)<1e-9);assert(Math.abs(snapRefresh(Array(60).fill(6.9))-1000/144)<1e-9);
assert(Math.abs(snapRefresh([...Array(54).fill(16.7),...Array(6).fill(33)])-1000/60)<1e-9);
assert.equal(initialLevel({coarse:false}),0);assert.equal(initialLevel({coarse:true}),1);assert.equal(initialLevel({override:'low'}),3);assert.equal(initialLevel({override:'bogus'}),0);
// Drive a controller with a synthetic display: `ms` per frame for `seconds`.
function drive(controller,ms,seconds,options){for(let t=0;t<seconds;t+=ms/1000)controller.sample(ms,options)}
for(const hz of [60,120,144]){
 const refresh=1000/hz,changes=[],q=createQualityController({onChange:l=>changes.push(l.name)});
 drive(q,refresh,4);assert.equal(q.index,0,`${hz} Hz on-time frames keep the top level`);assert(Math.abs(q.refreshMs-refresh)<1e-9);
 // 1.5x over budget: one step after >1.5 s, then the dwell holds it for 3 s.
 drive(q,refresh*1.5,1.4);assert.equal(q.index,0,'short spikes are tolerated');
 drive(q,refresh*1.5,.5);assert.equal(q.index,1);drive(q,refresh*1.5,2.4);assert.equal(q.index,1,'minimum dwell between steps');
 drive(q,refresh*1.5,3);assert.equal(q.index,2,'sustained load keeps stepping down');
 assert.deepEqual(changes,['balanced','medium']);
}
// Recovery probes upward after 5 s of headroom; a failed probe backs off.
{
 const refresh=1000/60,q=createQualityController();
 drive(q,refresh,1);drive(q,refresh*1.6,2);assert.equal(q.index,1);
 drive(q,refresh,5.5);assert.equal(q.index,0,'headroom restores the higher level');
 drive(q,refresh*1.6,1.7);assert.equal(q.index,1,'probe failed and was reverted');assert.equal(q.history.at(-1).reason,'probe failed');
 drive(q,refresh,6);assert.equal(q.index,1,'back-off: the same probe now waits longer');
 drive(q,refresh,5);assert.equal(q.index,0,'after the doubled wait it is retried');
}
// Coarse pointers never climb to the MSAA level; overrides never move.
{const q=createQualityController({coarse:true});drive(q,1000/60,30);assert.equal(q.index,1);drive(q,1000/60*2,20);assert.equal(q.index,QUALITY_LEVELS.length-1,'bottoms out at low');}
{const q=createQualityController({override:'medium'});drive(q,1000/60*3,20);assert.equal(q.level.name,'medium');assert.equal(q.history.length,0)}
// Paused, hidden and stalled frames are not evidence.
{const q=createQualityController();drive(q,1000/60,1);drive(q,40,10,{active:false});drive(q,400,10);assert.equal(q.index,0);assert(q.cost<1.05)}
// Levels: monotone cost, MSAA only at the top, FPV feed untouched.
for(let i=1;i<QUALITY_LEVELS.length;i++){const a=QUALITY_LEVELS[i-1],b=QUALITY_LEVELS[i];assert(b.chaseScale<=a.chaseScale&&b.waves<=a.waves&&b.shadowMap<=a.shadowMap&&b.msaa<=a.msaa)}
assert.equal(QUALITY_LEVELS.filter(l=>l.msaa>0).length,1);assert.equal(levelIndex('high'),0);
assert(main.includes('const scale=fpv?Math.min(1,576/h):renderer.getPixelRatio()*renderLevel.chaseScale,samples=fpv?0:renderLevel.msaa;if(target.samples!==samples){target.samples=samples;target.dispose()}'));
assert(main.includes("renderQuality.sample(frameMs,{active:!document.hidden&&!s.paused})"));
assert(main.includes('oceanSurface.setWaveCount(Math.min(level.waves,coarsePointer?OCEAN.coarseWaves:OCEAN.waves))'));
assert(main.includes('sun.shadow.map?.dispose();sun.shadow.map=null;shadowSchedule.invalidate()'));
assert(main.includes("override:new URLSearchParams(location.search).get('quality')"));
console.log('PASS: refresh-normalised cost at 60/120/144 Hz, spike tolerance, one-step changes with dwell, headroom probing with back-off, coarse floor, fixed override, ignored paused/stalled frames and main wiring');
console.log('Synthetic frame-series checks only; real-device frame times and the visual effect of each level need device verification.');
