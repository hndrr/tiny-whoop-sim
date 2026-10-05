import assert from 'node:assert/strict';
import {createPreviewMotion,PREVIEW_TURN_SECONDS,PREVIEW_PROP_SPEED,PREVIEW_RESUME_SECONDS} from './dist/preview-motion.mjs';
import {VEHICLES,createVehicle,disposeVehicle} from './dist/vehicle-catalog.mjs';
for(const {id} of VEHICLES){
 const model=createVehicle(id),flight=createVehicle(id),motion=createPreviewMotion();
 const positions=model.propellers.map(p=>p.position.toArray());
 motion.step(0,model);let yaw=0;
 for(let i=1;i<=PREVIEW_TURN_SECONDS*60;i++)yaw+=motion.step(i*1000/60,model);
 assert.ok(Math.abs(yaw-Math.PI*2)<1e-10,'20 second 360 degree turn');
 for(const [i,p] of model.propellers.entries()){
  assert.deepEqual(p.position.toArray(),positions[i]);assert.equal(p.rotation.x,0);assert.equal(p.rotation.y,0);
  assert.ok(Math.abs(p.rotation.z-(PREVIEW_TURN_SECONDS*PREVIEW_PROP_SPEED*(i%2?1:-1))%(Math.PI*2))<1e-10,'props rotate locally around motor Z');
  assert.equal(flight.propellers[i].rotation.z,0,'separately constructed flight model is untouched');
 }
 const before=model.propellers[0].rotation.z;motion.suspend();assert.equal(motion.step(1000000,model),0);assert.equal(model.propellers[0].rotation.z,before);
 const delta=motion.step(2000000,model);assert.ok(Math.abs(delta-.05*Math.PI*2/PREVIEW_TURN_SECONDS)<1e-12,'long dt clamped');
 motion.interact();assert.equal(motion.step(2000040,model,{dragging:true}),0);
 for(let i=1;i<=PREVIEW_RESUME_SECONDS*20;i++)assert.ok(Math.abs(motion.step(2000040+i*50,model))<1e-12);
 assert.ok(motion.step(2001290,model)>0);
 const reduced=model.propellers.map(p=>p.rotation.z);assert.equal(motion.step(2001340,model,{reduced:true}),0);assert.deepEqual(model.propellers.map(p=>p.rotation.z),reduced);
 motion.reset();assert.equal(motion.step(9999999,model),0,'reopen starts a new clock');
 disposeVehicle(model.group);disposeVehicle(flight.group);
}
console.log('PASS: all five preview clocks, local prop axes, exact 20s turn, interaction grace, long dt clamp, reduced motion and isolated flight models');
