import * as T from './vendor/three.module.min.js';
import {PrecisionMission,objectiveFeedback,HOLD_SECONDS} from './precision-missions.mjs';
import {i18n} from './i18n.mjs';
export function setupPrecision({scene,state,start,leave,retry}){
 const mission=new PrecisionMission(),panel=document.createElement('aside');panel.id='dispatchPanel';panel.hidden=true;
 panel.innerHTML='<small id="dispatchCount"></small><h2 id="dispatchTitle"></h2><p id="dispatchDistance"></p><p id="dispatchAltitude"></p><div class="dispatch-progress" id="dispatchProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="dispatchFill"></i></div><small id="dispatchStatus" role="status"></small><p id="dispatchHint"></p><button id="retryDispatch"></button><button id="leaveDispatch" data-i18n="modeFree"></button>';
 document.body.append(panel);
 const modes=document.createElement('div');modes.id='flightActivities';modes.innerHTML='<button id="freeFlight" data-i18n="modeFree"></button><button id="precisionFlight" data-i18n="modePrecision"></button>';document.getElementById('helpPanel').prepend(modes);
 function bindAction(id,action){const button=document.getElementById(id);button.onclick=event=>{action();if(event.detail>0)button.blur()}}
 bindAction('freeFlight',leave);bindAction('precisionFlight',start);bindAction('retryDispatch',retry);bindAction('leaveDispatch',leave);
 const marker=new T.Group();scene.add(marker);
 const material=new T.MeshBasicMaterial({color:'#94f5cf',transparent:true,opacity:.75,depthWrite:false});
 // A solid diamond-shaped pad and four corner posts, never a fly-through hoop.
 const pad=new T.Mesh(new T.PlaneGeometry(Math.sqrt(32),Math.sqrt(32)),new T.MeshBasicMaterial({color:'#94f5cf',transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false}));pad.rotation.z=Math.PI/4;pad.position.z=.035;marker.add(pad);
 const corners=new T.Group();marker.add(corners);
 for(const [x,y] of [[4,0],[-4,0],[0,4],[0,-4]]){
  const post=new T.Mesh(new T.BoxGeometry(.07,.07,1.1),material);post.position.set(x,y,.55);corners.add(post);
 }
 const diamond=new T.Mesh(new T.OctahedronGeometry(.35),material);diamond.position.z=3;marker.add(diamond);
 const $=id=>document.getElementById(id),t=(key,params)=>i18n.t(key,params);
 function render(){
  panel.hidden=!mission.active;marker.visible=!!mission.objective;
  $('freeFlight').setAttribute('aria-pressed',String(!mission.active));$('precisionFlight').setAttribute('aria-pressed',String(mission.active));
  document.body.classList.toggle('precision-active',mission.active);
  document.body.classList.toggle('precision-paused',mission.active&&state.paused&&!state.crashed);
  if(!mission.active)return;
  $('dispatchCount').textContent=t('dispatch',{current:Math.min(mission.index+1,4),total:4});
  $('dispatchTitle').textContent=t(mission.done?'missionComplete':mission.objective.title);
  $('dispatchHint').textContent=mission.done?t('missionReady'):t(mission.objective.hint);
  $('retryDispatch').textContent=t(mission.done?'replayMission':'retryObjective');
  $('dispatchFill').style.width=(mission.done?100:mission.hold/HOLD_SECONDS*100)+'%';
  const progress=Math.round(mission.done?100:mission.hold/HOLD_SECONDS*100);
  $('dispatchProgress').setAttribute('aria-valuenow',String(progress));
  $('dispatchProgress').setAttribute('aria-label',t('holdProgress'));
  $('dispatchStatus').textContent=mission.done?t('missionComplete'):'';
  if(mission.objective){const o=mission.objective,f=objectiveFeedback(state,o);marker.position.set(o.target[0],o.target[1],0);pad.scale.setScalar(f.radius/4);corners.scale.set(f.radius/4,f.radius/4,1);diamond.position.z=o.target[2];for(const post of corners.children){post.scale.z=(f.maxAltitude-f.minAltitude)/1.1;post.position.z=(f.minAltitude+f.maxAltitude)/2}
   const dx=o.target[0]-state.x,dy=o.target[1]-state.y;
   const relative=Math.atan2(-dx,dy)-state.heading;const angle=Math.atan2(Math.sin(relative),Math.cos(relative));
   const direction=Math.abs(angle)<.35?'targetAhead':Math.abs(angle)>2.55?'targetBehind':angle>0?'targetLeft':'targetRight';
   $('dispatchDistance').textContent=t(f.distance<=f.radius?'targetInside':direction,{distance:f.distance.toFixed(1)});
   $('dispatchAltitude').textContent=t('targetAltitude',{height:f.altitude.toFixed(1),min:f.minAltitude<.1?f.minAltitude.toFixed(3):f.minAltitude.toFixed(1),max:f.maxAltitude.toFixed(1)});
   const params={distance:f.remaining.toFixed(1),speed:f.horizontalSpeed.toFixed(1),limit:f.horizontalLimit,vertical:f.verticalSpeed.toFixed(1),verticalLimit:f.verticalLimit,progress};
   $('dispatchStatus').textContent=t('feedback_'+f.reason,params);
  }else {$('dispatchDistance').textContent='';$('dispatchAltitude').textContent=''}

 }
 return {mission,render};
}
