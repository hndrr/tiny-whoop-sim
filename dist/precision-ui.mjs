import * as T from './vendor/three.module.min.js';
import {PrecisionMission,PRECISION_OBJECTIVES,HOLD_SECONDS} from './precision-missions.mjs';
import {i18n} from './i18n.mjs';
export function setupPrecision({scene,state,start,leave,retry}){
 const mission=new PrecisionMission(),panel=document.createElement('aside');panel.id='dispatchPanel';panel.hidden=true;
 panel.innerHTML='<small id="dispatchCount"></small><h2 id="dispatchTitle"></h2><p id="dispatchHint"></p><p id="dispatchDistance"></p><div class="dispatch-progress"><i id="dispatchFill"></i></div><small id="dispatchStatus" role="status"></small><button id="retryDispatch"></button><button id="leaveDispatch" data-i18n="modeFree"></button>';
 document.body.append(panel);
 const modes=document.createElement('div');modes.id='flightActivities';modes.innerHTML='<button id="freeFlight" data-i18n="modeFree"></button><button id="precisionFlight" data-i18n="modePrecision"></button>';document.getElementById('helpPanel').prepend(modes);
 function bindAction(id,action){const button=document.getElementById(id);button.onclick=event=>{action();if(event.detail>0)button.blur()}}
 bindAction('freeFlight',leave);bindAction('precisionFlight',start);bindAction('retryDispatch',retry);bindAction('leaveDispatch',leave);
 const marker=new T.Group();scene.add(marker);
 const material=new T.MeshBasicMaterial({color:'#94f5cf',transparent:true,opacity:.75,depthWrite:false});
 const ring=new T.Mesh(new T.TorusGeometry(4,.055,6,48),material);marker.add(ring);
 const stem=new T.Mesh(new T.CylinderGeometry(.025,.025,3,6).rotateX(Math.PI/2),material);stem.position.z=1.5;marker.add(stem);
 const diamond=new T.Mesh(new T.OctahedronGeometry(.35),material);diamond.position.z=3.3;marker.add(diamond);
 const $=id=>document.getElementById(id),t=(key,params)=>i18n.t(key,params);
 function render(){
  panel.hidden=!mission.active;marker.visible=!!mission.objective;
  $('freeFlight').setAttribute('aria-pressed',String(!mission.active));$('precisionFlight').setAttribute('aria-pressed',String(mission.active));
  document.body.classList.toggle('precision-active',mission.active);
  if(!mission.active)return;
  $('dispatchCount').textContent=t('dispatch',{current:Math.min(mission.index+1,4),total:4});
  $('dispatchTitle').textContent=t(mission.done?'missionComplete':mission.objective.title);
  $('dispatchHint').textContent=mission.done?t('missionReady'):t(mission.objective.hint);
  $('retryDispatch').textContent=t(mission.done?'replayMission':'retryObjective');
  $('dispatchFill').style.width=(mission.done?100:mission.hold/HOLD_SECONDS*100)+'%';
  $('dispatchStatus').textContent=mission.done?t('missionComplete'):state.crashed?t('retryObjective'):t('holdSteady');
  if(mission.objective){const o=mission.objective;marker.position.set(...o.target);ring.scale.setScalar(o.id==='return'?1.25:1);
   const dx=o.target[0]-state.x,dy=o.target[1]-state.y,distance=Math.hypot(dx,dy,o.target[2]-state.z);
   const relative=Math.atan2(-dx,dy)-state.heading;const angle=Math.atan2(Math.sin(relative),Math.cos(relative));
   const direction=Math.abs(angle)<.35?'↑':Math.abs(angle)>2.55?'↓':angle>0?'←':'→';
   $('dispatchDistance').textContent=direction+' '+Math.round(distance)+' m';
  }else $('dispatchDistance').textContent='';
 }
 return {mission,render};
}
