import * as T from './vendor/three.module.min.js';
import {REGIONS,REGION_ELEVATIONS} from './world.mjs';
import {getVehicle} from './vehicle-catalog.mjs';
import {createFlightSelector,capturePreview,loadSelection} from './flight-selector.mjs';
// A reversible snapshot of scene presentation only. Physics and live camera are untouched.
export function withStagePreview({scene,skyDome,sun,terrainChunks,regionGroups,airfieldGroup,drone},index,render){
 const r=REGIONS[index],height=REGION_ELEVATIONS[index],saved=[];
 function visible(object,value){saved.push([object,object.visible]);object.visible=value}
 const skyPosition=skyDome.position.clone(),sunPosition=sun.position.clone(),sunTarget=sun.target.position.clone();
 const camera=new T.PerspectiveCamera(56,1.8, .1,20000);camera.up.set(0,0,1);
 const distance=index===0?150:index===5?150:230;
 camera.position.set(r.x+distance*.78,r.y-distance,height+distance*.72);camera.lookAt(r.x,index===0?32:r.y,height+(index===6?35:8));
 try{
  visible(drone,false);visible(airfieldGroup,index===0);
  regionGroups.forEach((g,i)=>visible(g,Math.hypot(REGIONS[i].x-r.x,REGIONS[i].y-r.y)<2400));
  for(const c of terrainChunks){const near=Math.hypot(c.x-r.x,c.y-r.y)<950;visible(c.near,near);visible(c.far,!near)}
  skyDome.position.copy(camera.position);sun.position.set(r.x-80,r.y-95,height+140);sun.target.position.set(r.x,r.y,height);
  return render(camera);
 }finally{for(const [object,value] of saved)object.visible=value;skyDome.position.copy(skyPosition);sun.position.copy(sunPosition);sun.target.position.copy(sunTarget)}
}
export function setupFlightSelection({renderer,scene,skyDome,sun,terrainChunks,regionGroups,airfieldGroup,getDrone,state,clearInputs,updateHUD,setVehicle,closeHelp}){
 let selected=loadSelection();
 setVehicle(selected.vehicle);state.relocate(REGIONS.findIndex(r=>r.id===selected.region));
 const button=document.createElement('button');button.id='chooseFlight';button.type='button';button.textContent='CHOOSE AREA + AIRCRAFT';
 const summary=document.createElement('p');summary.className='flight-selection-summary';summary.id='flightSelectionSummary';summary.setAttribute('aria-live','polite');
 const oldSelect=document.getElementById('areaSelect'),oldButton=document.getElementById('relocate');
 const oldLabel=document.querySelector('label[for="areaSelect"]');if(oldLabel)oldLabel.hidden=true;oldSelect.hidden=true;oldButton.hidden=true;oldSelect.before(button,summary);
 const brand=document.querySelector('.brand');let brandTitle=brand?.firstChild;
 function refresh(){const vehicle=getVehicle(selected.vehicle),region=REGIONS.find(r=>r.id===selected.region);summary.textContent=`${vehicle.name} / ${region.label}`;if(brandTitle?.nodeType===3)brandTitle.textContent=vehicle.name;oldSelect.value=String(REGIONS.indexOf(region));}
 const selector=createFlightSelector({renderer,getSelection:()=>selected,
  captureStage:index=>withStagePreview({scene,skyDome,sun,terrainChunks,regionGroups,airfieldGroup,drone:getDrone()},index,camera=>capturePreview(renderer,scene,camera,360,200)),
  onOpen(){state.paused=true;clearInputs();closeHelp();updateHUD()},
  onApply(next,{areaChanged,vehicleChanged}){if(vehicleChanged)setVehicle(next.vehicle);if(areaChanged)state.relocate(REGIONS.findIndex(r=>r.id===next.region));selected=next;state.paused=true;clearInputs();refresh();updateHUD()},
  onClose(){state.paused=true;clearInputs();updateHUD()}
 });
 button.onclick=()=>selector.open();refresh();
 return {selector,get selected(){return {...selected}},reset(){state.relocate(REGIONS.findIndex(r=>r.id===selected.region));clearInputs();updateHUD()}};
}
