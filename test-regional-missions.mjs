import assert from 'node:assert/strict';
import {FlightState} from './dist/flight.mjs';
import {PrecisionMission,MISSION_STAGES} from './dist/precision-missions.mjs';
import {finishObjective} from './test-mission-path-helper.mjs';
const fresh=index=>{const s=new FlightState(),m=new PrecisionMission();m.start(s,index);s.paused=false;return {s,m}};
const set=(s,p)=>{[s.x,s.y,s.z]=p};
const orbit=(s,o,a,r=o.radius)=>set(s,[o.target[0]+Math.cos(a)*r,o.target[1]+Math.sin(a)*r,o.target[2]]);
assert.equal(MISSION_STAGES.length,7);
assert.equal(MISSION_STAGES[5].region,'viaduct');assert.equal(MISSION_STAGES[6].region,'windfarm');
for(const index of [5,6]){
 const {s,m}=fresh(index),o=m.objective;
 set(s,o.target);for(let i=0;i<500;i++)m.update(s,.05);
 assert.equal(m.index,0,'hovering at a regional target cannot complete a route');
 m.retry(s);s.paused=false;
 while(m.objective)finishObjective(m,s);
 assert(m.done);assert(s.paused);assert.equal(m.progress,1);assert(m.completedStages.includes(index));
 assert.equal(m.hasNext,index===5);assert.equal(m.taskStatus,index===5?'weaveComplete':'orbitComplete');
 m.retry(s);assert(!m.done);assert.equal(m.index,0);assert.equal(m.progress,0);assert.equal(m.completedStages.filter(i=>i===index).length,1);
 m.start(s,index);assert.equal(m.index,0);assert.equal(m.progress,0);
}
{
 const {s,m}=fresh(5),o=m.objective;
 for(let along=30;along>=-30;along--){set(s,[o.target[0],o.target[1]+along,o.target[2]]);m.update(s,.05)}
 assert.equal(m.index,0,'backward pass does not finish a directional bridge route');
 m.retry(s);s.paused=false;
 for(let along=-25;along<=0;along++){set(s,[o.target[0],o.target[1]+along,o.target[2]]);m.update(s,.05)}
 assert.equal(m.progress,.5);assert.equal(m.feedback(s).reason,'crossingPass');
 const frozen=JSON.stringify(m.task);s.paused=true;for(let n=0;n<90;n++)m.update(s,.05);assert.equal(JSON.stringify(m.task),frozen);assert.equal(m.feedback(s).reason,'paused');
 s.paused=false;s.crashed=true;m.update(s,.05);assert.equal(JSON.stringify(m.task),frozen);assert.equal(m.feedback(s).reason,'crashed');
 s.crashed=false;set(s,[o.target[0]+o.radius+1,o.target[1],o.target[2]]);m.update(s,.05);assert.equal(m.progress,0);assert.equal(m.feedback(s).reason,'crossingApproach');
 m.retry(s);s.paused=false;set(s,[o.target[0],o.target[1]-20,o.target[2]]);m.update(s,.05);set(s,[o.target[0],o.target[1]+20,o.target[2]]);m.update(s,.05);assert.equal(m.index,0,'teleport across a bay is not a traversal');
 m.retry(s);s.paused=false;finishObjective(m,s);assert.equal(m.index,1);m.retry(s);assert.equal(m.index,1,'retry keeps completed bays');assert.equal(m.progress,0);
}
for(const direction of [-1,1]){
 const {s,m}=fresh(6),o=m.objective;
 for(let tick=0;tick<=180;tick++){orbit(s,o,direction*tick*Math.PI/180);m.update(s,.05)}
 assert(Math.abs(m.progress-.5)<1e-9);assert.equal(m.task.direction,direction);assert.equal(m.feedback(s).reason,'orbitTrack');
 const progress=m.progress;s.paused=true;m.update(s,.05);assert.equal(m.progress,progress);s.paused=false;
 // Backtracking cancels covered distance, so rocking in one arc never wins.
 for(let tick=179;tick>=120;tick--){orbit(s,o,direction*tick*Math.PI/180);m.update(s,.05)}
 assert(Math.abs(m.progress-1/3)<1e-9);
 // Leaving the band preserves progress but requires rejoining the same arc.
 const returnAngle=direction*120*Math.PI/180;
 orbit(s,o,returnAngle,o.radius+o.orbitTolerance+2);m.update(s,.05);
 assert.equal(m.feedback(s).reason,'orbitReturn');const saved=m.progress;
 for(let tick=240;tick<300;tick++){orbit(s,o,direction*tick*Math.PI/180);m.update(s,.05)}
 assert.equal(m.progress,saved,'skipping across the circle cannot add coverage');
 orbit(s,o,returnAngle);m.update(s,.05);m.update(s,.05);
 for(let tick=121;tick<=365&&m.objective===o;tick++){orbit(s,o,direction*tick*Math.PI/180);m.update(s,.05)}
 assert.equal(m.index,1,'either direction completes an actual circuit');m.retry(s);assert.equal(m.index,1);assert.equal(m.progress,0,'retry restarts only the current tower');
 m.leave();assert(!m.active);m.start(s,6);assert.equal(m.index,0);assert.equal(m.progress,0,'replay clears route state');
}
for(const direction of [-1,1]){
 const {s,m}=fresh(6),o=m.objective;orbit(s,o,0);m.update(s,.05);
 for(let attempt=0;attempt<100;attempt++){
  for(let a=0;a<=10;a++){orbit(s,o,direction*a*.01);m.update(s,.05)}
  for(let radius=24;radius<=33;radius++){orbit(s,o,direction*.1,radius);m.update(s,.05)}
  for(let a=10;a>=0;a--){orbit(s,o,direction*a*.01,33);m.update(s,.05)}
  for(let radius=33;radius>=24;radius--){orbit(s,o,0,radius);m.update(s,.05)}
 }
 assert.equal(m.index,0,'repeating a tiny sector via an out-of-band shortcut cannot finish');assert(m.progress<.02);
}
console.log('PASS: new regional mechanics require actual paths, six directional bays, either-direction full circuits, no hover/rocking/teleport shortcuts, pause/crash/rejoin/retry/replay/completion');
