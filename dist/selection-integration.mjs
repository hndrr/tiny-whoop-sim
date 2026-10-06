import {i18n} from './i18n.mjs';
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
// Startup/reset uses the original race pad; explicit relocation keeps its 7m spawn.
export function resetSelectedFlight(state,region){
 const index=REGIONS.findIndex(r=>r.id===region);
 if(index<=0)state.reset();else state.relocate(index);
}
export function setupFlightSelection({renderer,scene,skyDome,sun,terrainChunks,regionGroups,airfieldGroup,getDrone,state,clearInputs,updateHUD,setVehicle,closeHelp,onAreaChange=()=>{},getMode=()=> 'free',getMissionStage=()=>0,onStart=()=>{},selectorFactory=createFlightSelector}){
 let selected=loadSelection(),previousPaused=true,applied=false;
 setVehicle(selected.vehicle);state.setAircraft(selected.vehicle);resetSelectedFlight(state,selected.region);
 const button=document.createElement('button');button.id='chooseFlight';button.type='button';button.textContent='CHOOSE AREA + AIRCRAFT';
 const summary=document.createElement('p');summary.className='flight-selection-summary';summary.id='flightSelectionSummary';summary.setAttribute('aria-live','polite');
 const oldSelect=document.getElementById('areaSelect'),oldButton=document.getElementById('relocate');
 const oldLabel=document.querySelector('label[for="areaSelect"]');if(oldLabel)oldLabel.hidden=true;oldSelect.hidden=true;oldButton.hidden=true;oldSelect.before(button,summary);
 const brand=document.querySelector('.brand');let brandTitle=brand?.firstChild;
 function refresh(){button.textContent=i18n.t('chooseFlight');const vehicle=getVehicle(selected.vehicle),region=REGIONS.find(r=>r.id===selected.region);summary.textContent=`${vehicle.name} / ${i18n.t(`region.${region.id}`)}`;if(brandTitle?.nodeType===3)brandTitle.textContent=vehicle.name;oldSelect.value=String(REGIONS.indexOf(region));}
 const selector=selectorFactory({renderer,getSelection:()=>selected,getMode,getMissionStage,
  captureStage:index=>withStagePreview({scene,skyDome,sun,terrainChunks,regionGroups,airfieldGroup,drone:getDrone()},index,camera=>capturePreview(renderer,scene,camera,360,200)),
  onOpen(){previousPaused=state.paused;applied=false;state.paused=true;clearInputs();closeHelp();document.getElementById('help').setAttribute('aria-expanded','true');updateHUD()},
  onApply(next,{areaChanged,vehicleChanged,mode='free',stageIndex=0}){applied=true;if(vehicleChanged){setVehicle(next.vehicle);state.setAircraft(next.vehicle);}if(areaChanged){onAreaChange();state.relocate(REGIONS.findIndex(r=>r.id===next.region));}selected=next;onStart(mode,stageIndex);state.paused=false;clearInputs();refresh();updateHUD()},
  onClose(){document.getElementById('help').setAttribute('aria-expanded','false');if(!applied)state.paused=previousPaused||document.hidden;clearInputs();updateHUD()}
 });
 button.onclick=()=>selector.open();document.getElementById('help').onclick=()=>selector.open();
 // Retain the existing control instructions inside the same settings surface.
 const helpContent=document.createElement('div');helpContent.className='selector-help';for(const node of document.querySelectorAll('#helpPanel .controlRow,#helpPanel .tip'))helpContent.append(node);selector.element?.querySelector('.selector-body')?.append(helpContent);refresh();
 return {selector,refreshLanguage(){selector.refreshLanguage?.();refresh()},setRegion(region){selected={...selected,region};refresh()},get selected(){return {...selected}},reset(){resetSelectedFlight(state,selected.region);clearInputs();updateHUD()}};
}
