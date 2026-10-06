// Outdoor tasks share the existing island, flight model and swept collision.
// Coordinates are absolute world metres; altitude limits are clearance above
// terrain / mean sea level. Mission inventory is abstract, not cargo physics.
const objective=(id,target,checkpoint,options={})=>({
 id,title:`${id}Title`,hint:`${id}Hint`,target,checkpoint,
 radius:18,minAltitude:10,maxAltitude:60,horizontalLimit:6,verticalLimit:3,...options,
});
export const ERRAND_STAGES=[
 {id:'harborDelivery',region:'harbor',kind:'delivery',title:'stage4Title',description:'stage4Description',objectives:[
  objective('harborPickup',[1730,-180,16],[1700,-210,9],{action:'pickup',minAltitude:8,maxAltitude:24,horizontalLimit:3}),
  objective('harborCoast',[1800,-320,26],[1730,-180,16],{radius:20,minAltitude:14,maxAltitude:40,horizontalLimit:14,verticalLimit:5}),
  objective('harborDelivery',[1890,-75,20],[1800,-320,26],{action:'deliver',minAltitude:8,maxAltitude:30,horizontalLimit:3}),
 ]},
 {id:'lighthouseInspection',region:'lighthouse',kind:'inspection',title:'stage5Title',description:'stage5Description',objectives:[
  objective('lighthouseCoast',[-2040,80,50],[-1815,225,10],{radius:20,minAltitude:28,maxAltitude:64,horizontalLimit:14,verticalLimit:5}),
  objective('lighthouseInspect',[-1900,205,50],[-2040,80,50],{action:'inspect',minAltitude:30,maxAltitude:62,horizontalLimit:4}),
  objective('lighthouseReturn',[-1815,225,16],[-1900,205,50],{action:'report',minAltitude:5,maxAltitude:22,horizontalLimit:3}),
 ]},
];

// Inventory follows completed actions, so retry preserves a pickup or scan,
// while replaying or choosing a new stage always begins empty.
export function errandStatus(stage,index){
 const actions=stage.objectives.slice(0,index).map(objective=>objective.action);
 if(stage.kind==='delivery')return actions.includes('deliver')?'cargoDelivered':actions.includes('pickup')?'cargoCarrying':'cargoAwaiting';
 if(stage.kind==='inspection')return actions.includes('report')?'inspectionReported':actions.includes('inspect')?'inspectionRecorded':'inspectionAwaiting';
 return null;
}
