import * as T from './vendor/three.module.min.js';
import {PrecisionMission,objectiveFeedback} from './precision-missions.mjs';
import {i18n} from './i18n.mjs';
export function setupPrecision({scene,state,start,leave,retry,next=()=>{},replay=retry,completionLeave=leave,clearInputs=()=>{}}){
 const mission=new PrecisionMission(),panel=document.createElement('aside');panel.id='dispatchPanel';panel.hidden=true;
 panel.innerHTML='<small id="dispatchCount"></small><h2 id="dispatchTitle"></h2><p id="dispatchDistance"></p><p id="dispatchAltitude"></p><div class="dispatch-progress" id="dispatchProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="dispatchFill"></i></div><small id="dispatchStatus" role="status"></small><p id="dispatchHint"></p><button id="retryDispatch"></button><button id="leaveDispatch" data-i18n="modeFree"></button>';
 document.body.append(panel);
 const modes=document.createElement('div');modes.id='flightActivities';modes.innerHTML='<button id="freeFlight" data-i18n="modeFree"></button><button id="precisionFlight" data-i18n="modePrecision" aria-describedby="precisionDescription"></button>';const description=document.createElement('p');description.id='precisionDescription';description.setAttribute('data-i18n','precisionDescription');document.getElementById('helpPanel').prepend(modes,description);
 function bindAction(id,action){const button=document.getElementById(id);button.onclick=event=>{action();if(event.detail>0)button.blur()}}
 bindAction('freeFlight',leave);bindAction('precisionFlight',start);bindAction('retryDispatch',retry);bindAction('leaveDispatch',leave);
 const formatAltitude=value=>Number.isInteger(value*10)?value.toFixed(1):String(value);
 const $=id=>document.getElementById(id),t=(key,params)=>i18n.t(key,params);
 const completion=document.createElement('dialog');completion.id='missionCompletion';completion.hidden=true;
 completion.setAttribute('aria-modal','true');completion.setAttribute('aria-labelledby','missionCongratulations');completion.setAttribute('aria-describedby','missionCompletionSubtitle missionCompletionStage');
 completion.innerHTML='<div class="mission-completion-content"><span class="mission-completion-mark" aria-hidden="true">✦</span><h2 id="missionCongratulations">CONGRATULATIONS!</h2><p id="missionCompletionSubtitle"></p><p id="missionCompletionStage"></p><div class="mission-completion-actions"><button id="nextMissionStage" type="button"></button><button id="replayMissionStage" type="button"></button><button id="leaveMissionCompletion" type="button"></button></div></div>';
 document.body.append(completion);
 let completionVisible=false,previousFocus=null;
 // Native button keyboard activation stays intact; flight shortcuts never see it.
 completion.onkeydown=event=>event.stopPropagation();completion.onkeyup=event=>event.stopPropagation();
 // Completion is a deliberate choice. Escape cannot silently resume the drone.
 completion.oncancel=event=>{event.preventDefault();event.stopPropagation()};
 function hideCompletion(){
  if(!completionVisible)return;
  completionVisible=false;clearInputs();
  const focusWasInside=completion.contains?.(document.activeElement)||document.activeElement?.closest?.('dialog')===completion;
  if(completion.open&&completion.close)completion.close();
  else completion.removeAttribute?.('open');
  completion.hidden=true;
  // close() may restore an old settings control that is now hidden. Prefer the
  // always-visible ARM/PAUSE control, before the chosen callback opens anything.
  if(focusWasInside||!document.activeElement||document.activeElement===document.body){
   const target=$('pause')||previousFocus;
   if(target&&!target.hidden&&!target.closest?.('[hidden]'))target.focus?.({preventScroll:true});
  }
  previousFocus=null;
 }
 function showCompletion(){
  if(completionVisible)return;
  completionVisible=true;previousFocus=document.activeElement;clearInputs();completion.hidden=false;
  if(completion.showModal)completion.showModal();else completion.setAttribute('open','');
  (mission.hasNext?$('nextMissionStage'):$('replayMissionStage')).focus?.({preventScroll:true});
 }
 function bindCompletion(id,action,enabled=()=>true){
  $(id).onclick=event=>{
   event.stopPropagation?.();
   if(!completionVisible||!mission.active||!mission.done||!enabled())return;
   hideCompletion();action();
  };
 }
 bindCompletion('nextMissionStage',next,()=>mission.hasNext);
 bindCompletion('replayMissionStage',replay);bindCompletion('leaveMissionCompletion',completionLeave);
 const marker=new T.Group();scene.add(marker);
 const material=new T.MeshBasicMaterial({color:'#94f5cf',transparent:true,opacity:.75,depthWrite:false});
 // A solid diamond-shaped pad and four corner posts, never a fly-through hoop.
 const pad=new T.Mesh(new T.PlaneGeometry(Math.sqrt(32),Math.sqrt(32)),new T.MeshBasicMaterial({color:'#94f5cf',transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false}));pad.rotation.z=Math.PI/4;pad.position.z=.035;marker.add(pad);
 const corners=new T.Group();marker.add(corners);
 for(const [x,y] of [[4,0],[-4,0],[0,4],[0,-4]]){
  const post=new T.Mesh(new T.BoxGeometry(.07,.07,1.1),material);post.position.set(x,y,.55);corners.add(post);
 }
 const diamond=new T.Mesh(new T.OctahedronGeometry(.35),material);diamond.position.z=3;marker.add(diamond);
 function render(started=false){
  panel.hidden=!mission.active;marker.visible=!!mission.objective;
  $('freeFlight').setAttribute('aria-pressed',String(!mission.active));$('precisionFlight').setAttribute('aria-pressed',String(mission.active));
  document.body.classList.toggle('precision-active',mission.active);
  document.body.classList.toggle('precision-paused',mission.active&&state.paused&&!state.crashed);
  document.body.classList.toggle('precision-complete',mission.active&&mission.done);
  if(!mission.active||!mission.done)hideCompletion();
  if(!mission.active)return;
  const total=mission.objectives.length,holdSeconds=mission.holdSeconds;
  $('dispatchCount').textContent=t('missionStageProgress',{stage:mission.stageIndex+1,current:Math.min(mission.index+1,total),total});
  $('dispatchTitle').textContent=t(mission.done?'missionComplete':mission.objective.title);
  $('dispatchHint').textContent=mission.done?t('missionReady'):t(mission.objective.hint);
  $('retryDispatch').textContent=t(mission.done?'replayMission':'retryObjective');
  const progress=Math.round(mission.done?100:Math.min(100,Math.max(0,mission.hold/holdSeconds*100)));
  $('dispatchFill').style.width=progress+'%';
  $('dispatchProgress').setAttribute('aria-valuenow',String(progress));
  $('dispatchProgress').setAttribute('aria-label',t('holdProgress'));
  $('dispatchStatus').textContent=mission.done?t('missionComplete'):'';
  if(mission.done){
   $('missionCompletionSubtitle').textContent=t(mission.allComplete?'allStagesComplete':'stageComplete',{stage:mission.stageIndex+1,title:t(mission.stage.title)});
   $('missionCompletionStage').textContent=t(mission.stage.title);
   $('nextMissionStage').textContent=t('nextStage');$('nextMissionStage').hidden=!mission.hasNext;
   $('replayMissionStage').textContent=t('replayMission');$('leaveMissionCompletion').textContent=t('modeFree');
   showCompletion();
  }
  if(mission.objective){const o=mission.objective,f=objectiveFeedback(state,o);marker.position.set(o.target[0],o.target[1],0);pad.scale.setScalar(f.radius/4);corners.scale.set(f.radius/4,f.radius/4,1);diamond.position.z=o.target[2];for(const post of corners.children){post.scale.z=(f.maxAltitude-f.minAltitude)/1.1;post.position.z=(f.minAltitude+f.maxAltitude)/2}
   const dx=o.target[0]-state.x,dy=o.target[1]-state.y;
   const relative=Math.atan2(-dx,dy)-state.heading;const angle=Math.atan2(Math.sin(relative),Math.cos(relative));
   const direction=Math.abs(angle)<.35?'targetAhead':Math.abs(angle)>2.55?'targetBehind':angle>0?'targetLeft':'targetRight';
   $('dispatchDistance').textContent=t(f.distance<=f.radius?'targetInside':direction,{distance:f.distance.toFixed(1)});
   $('dispatchAltitude').textContent=t('targetAltitude',{height:f.altitude.toFixed(1),min:formatAltitude(f.minAltitude),max:formatAltitude(f.maxAltitude)});
   const params={action:t(started||state.elapsed>0?'resume':'startFlight'),distance:f.remaining.toFixed(1),speed:f.horizontalSpeed.toFixed(1),limit:f.horizontalLimit,vertical:f.verticalSpeed.toFixed(1),verticalLimit:f.verticalLimit,seconds:holdSeconds.toFixed(1),progress};
   $('dispatchStatus').textContent=t('feedback_'+f.reason,params);
  }else {$('dispatchDistance').textContent='';$('dispatchAltitude').textContent=''}
 }
 return {mission,render};
}
