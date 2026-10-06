import {finishObjective} from './test-mission-path-helper.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {FlightState} from './dist/flight.mjs';
import {PrecisionMission,MISSION_STAGES} from './dist/precision-missions.mjs';

// Execute the actual production registration, rather than reproducing its
// state-changing callback. This path must obey the same modal rules as keys.
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
const from=main.indexOf('if(document.modelContext?.registerTool)'),to=main.indexOf('\n\nconst language=',from);
assert(from>=0&&to>from,'actual tool-registration source boundaries');
const state=new FlightState(),mission=new PrecisionMission(),keys=new Set();
const axes={pitch:0,roll:0,yaw:0,throttle:0},flightSelection={selector:{isOpen:false}};
const tools=[],counts={clear:0,hud:0};
const context={
 document:{modelContext:{registerTool(tool){tools.push(tool)}}},
 s:state,precision:{mission},flightSelection,keys,fpv:true,flightStarted:false,
 clearSticks(){counts.clear++;for(const axis of Object.keys(axes))axes[axis]=0},
 updateHUD(){counts.hud++},
};
runInNewContext(main.slice(from,to),context);
assert.equal(tools.length,2);
const pause=tools.find(tool=>tool.name==='set_flight_pause');
assert(pause,'production pause tool is registered');
function seedInput(){keys.add('KeyW');axes.pitch=.8;axes.throttle=1}
function invoke(paused,expected){
 seedInput();const before={...counts};
 assert.equal(pause.execute({paused}).paused,expected);
 assert.equal(state.paused,expected);
 assert.equal(keys.size,0);assert(Object.values(axes).every(value=>value===0));
 assert.equal(counts.clear,before.clear+1);assert.equal(counts.hud,before.hud+1);
}
function finishStage(stageIndex){
 mission.start(state,stageIndex);state.paused=false;
 while(mission.objective){
  const objective=mission.objective;
  finishObjective(mission,state);state.vx=.3;state.vy=.2;state.vz=0;
  assert.notEqual(mission.objective,objective);
 }
 assert(mission.done);assert(state.paused);
}
for(let stageIndex=0;stageIndex<MISSION_STAGES.length;stageIndex++){
 finishStage(stageIndex);
 const position=[state.x,state.y,state.z],stage=mission.stageIndex;
 for(let attempt=0;attempt<3;attempt++)invoke(false,true);
 for(let frame=0;frame<60;frame++)state.step(1/60,keys,axes,false);
 assert.deepEqual([state.x,state.y,state.z],position,'completed stage stays frozen despite residual velocity');
 assert(mission.done);assert.equal(mission.stageIndex,stage);
 invoke(true,true);
}
for(const active of [true,false]){
 mission.start(state,1);if(!active)mission.leave();
 flightSelection.selector.isOpen=true;
 invoke(false,true);invoke(true,true);
 flightSelection.selector.isOpen=false;
 context.flightStarted=false;invoke(false,false);assert.equal(context.flightStarted,true);
 invoke(true,true);
}
const snapshot=JSON.stringify({state,mission,counts});
for(const input of [undefined,null,{}, {paused:'false'}, {paused:0}]){
 assert.throws(()=>pause.execute(input),/paused must be boolean/);
 assert.equal(JSON.stringify({state,mission,counts}),snapshot,'invalid tool input cannot mutate state');
}
console.log('PASS: actual registered pause tool respects every completed stage and setup modal, freezes residual motion, permits ordinary resume/pause, clears inputs and rejects invalid payloads');
