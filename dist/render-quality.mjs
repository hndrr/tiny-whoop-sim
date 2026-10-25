// Adaptive render quality. The cost is the smoothed frame interval divided by
// the display's refresh interval: dimensionless, so the same thresholds hold
// at 60, 90, 120 or 144 Hz and at any resolution (the paper's normalised cost).
// The level moves one step at a time with hysteresis and a minimum dwell, the
// analogue of smoothing tall-cell heights so the grid never jumps.
export const QUALITY_LEVELS=Object.freeze([
 Object.freeze({name:'high',chaseScale:1,msaa:4,waves:16,shadowMap:2048,bloom:1,flare:1,dof:1,motionTaps:6,grass:1,shafts:12}),
 Object.freeze({name:'balanced',chaseScale:.85,msaa:0,waves:12,shadowMap:2048,bloom:1,flare:1,dof:1,motionTaps:4,grass:.75,shafts:8}),
 Object.freeze({name:'medium',chaseScale:.72,msaa:0,waves:10,shadowMap:1024,bloom:.8,flare:1,dof:0,motionTaps:3,grass:.5,shafts:6}),
 Object.freeze({name:'low',chaseScale:.6,msaa:0,waves:6,shadowMap:1024,bloom:.5,flare:.6,dof:0,motionTaps:0,grass:.3,shafts:0})
]);
export const QUALITY=Object.freeze({down:1.2,up:1.05,downAfter:1.5,upAfter:5,dwell:3,stall:250,smoothing:.1,refreshSamples:120,refreshRates:[30,60,75,90,120,144,165,240]});
export function levelIndex(name){return QUALITY_LEVELS.findIndex(level=>level.name===name)}
// Coarse-pointer devices start below the top level and never use MSAA there.
export function initialLevel({coarse=false,override=null}={}){const forced=levelIndex(override);return forced>=0?forced:coarse?1:0}
export function snapRefresh(intervals){
 if(!intervals.length)return 1000/60;
 const sorted=[...intervals].sort((a,b)=>a-b),fast=sorted[Math.floor((sorted.length-1)*.1)];
 return 1000/QUALITY.refreshRates.reduce((best,rate)=>Math.abs(1000/rate-fast)<Math.abs(1000/best-fast)?rate:best);
}
export function createQualityController({coarse=false,override=null,onChange=()=>{}}={}){
 const fixed=levelIndex(override)>=0,intervals=[],history=[];
 let index=initialLevel({coarse,override}),refreshMs=1000/60,smoothed=null,over=0,under=0,sinceChange=Infinity,clock=0;
 // A failed step up doubles the wait before trying that level again, so a
 // vsync-capped device does not oscillate between two levels.
 const upWait=QUALITY_LEVELS.map(()=>QUALITY.upAfter);let probing=null;
 const floor=coarse?1:0;
 function set(next,reason){if(next===index)return;history.push({at:+clock.toFixed(2),from:QUALITY_LEVELS[index].name,to:QUALITY_LEVELS[next].name,reason});if(history.length>32)history.shift();index=next;sinceChange=0;over=under=0;onChange(QUALITY_LEVELS[index])}
 return {
  get level(){return QUALITY_LEVELS[index]},get index(){return index},get refreshMs(){return refreshMs},get history(){return [...history]},
  get cost(){return smoothed===null?null:smoothed/refreshMs},
  sample(frameMs,{active=true}={}){
   if(!active||!Number.isFinite(frameMs)||frameMs<=0||frameMs>QUALITY.stall)return index;
   const seconds=frameMs/1000;clock+=seconds;sinceChange+=seconds;
   if(intervals.length<QUALITY.refreshSamples){intervals.push(frameMs);refreshMs=snapRefresh(intervals)}
   smoothed=smoothed===null?frameMs:smoothed+(frameMs-smoothed)*QUALITY.smoothing;
   if(fixed||intervals.length<30)return index;
   const cost=smoothed/refreshMs;
   over=cost>QUALITY.down?over+seconds:0;under=cost<QUALITY.up?under+seconds:0;
   if(probing!==null&&sinceChange<QUALITY.dwell+QUALITY.downAfter&&over>QUALITY.downAfter){upWait[probing]*=2;const failed=probing;probing=null;set(failed+1,'probe failed');return index}
   if(sinceChange<QUALITY.dwell)return index;
   if(over>QUALITY.downAfter&&index<QUALITY_LEVELS.length-1){probing=null;set(index+1,'over budget')}
   else if(under>upWait[Math.max(floor,index-1)]&&index>floor){probing=index-1;set(index-1,'headroom')}
   else if(probing!==null&&sinceChange>QUALITY.dwell+QUALITY.downAfter)probing=null;
   return index;
  }
 };
}
