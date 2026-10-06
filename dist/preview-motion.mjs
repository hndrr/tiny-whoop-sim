// Inspector-only clock. Never receives or changes the in-flight aircraft/state.
export const PREVIEW_TURN_SECONDS=20;
export const PREVIEW_PROP_SPEED=18;
export const PREVIEW_RESUME_SECONDS=1.2;
export function createPreviewMotion(){
 let previous=null,grace=0;
 return {
  reset(){previous=null;grace=0},
  suspend(){previous=null},
  interact(){grace=PREVIEW_RESUME_SECONDS},
  step(now,model,{dragging=false,reduced=false}={}){
   const dt=previous===null?0:Math.max(0,Math.min((now-previous)/1000,.05));previous=now;
   if(reduced)return 0;
   for(const [i,prop] of model.propellers.entries())prop.rotation.z=(prop.rotation.z+dt*PREVIEW_PROP_SPEED*(i%2?1:-1))%(Math.PI*2);
   if(dragging)return 0;
   const active=Math.max(0,dt-grace);grace=Math.max(0,grace-dt);
   return active*Math.PI*2/PREVIEW_TURN_SECONDS;
  }
 };
}
