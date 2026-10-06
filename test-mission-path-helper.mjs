// Synthetic path sampling for UI/lifecycle tests only. Actual stick-controlled
// feasibility is covered independently by test-regional-flight.mjs.
export function finishObjective(mission,state){
 const o=mission.objective;state.paused=false;state.crashed=false;state.vx=state.vy=state.vz=0;
 for(let tick=0;mission.task.departCenter&&tick<1000;tick++){
  const target=mission.navigationTarget,delta=target.map((v,i)=>v-[state.x,state.y,state.z][i]),length=Math.hypot(...delta);
  [state.x,state.y,state.z]=[state.x,state.y,state.z].map((v,i)=>v+delta[i]/Math.max(1,length));mission.update(state,.05);
 }
 if(mission.task.departCenter)throw Error('Departure path did not finish');
 if(o.mechanic==='crossing'){
  for(let along=-30;along<=20&&mission.objective===o;along++){
   [state.x,state.y,state.z]=[o.target[0],o.target[1]+o.direction*along,o.target[2]];mission.update(state,.05);
  }
 }else if(o.mechanic==='orbit'){
  for(let tick=0;tick<=370&&mission.objective===o;tick++){
   const angle=-Math.PI/2+tick*Math.PI/180;
   [state.x,state.y,state.z]=[o.target[0]+Math.cos(angle)*o.radius,o.target[1]+Math.sin(angle)*o.radius,o.target[2]];mission.update(state,.05);
  }
 }else{
  [state.x,state.y,state.z]=o.target;
  for(let tick=0;tick<30&&mission.objective===o;tick++)mission.update(state,.05);
 }
 if(mission.objective===o)throw Error('Synthetic objective path did not complete '+o.id);
}
