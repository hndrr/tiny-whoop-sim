import * as T from './vendor/three.module.min.js';
import {PrecisionMission,objectiveFeedback} from './precision-missions.mjs';
import {groundHeight} from './world.mjs';
import {supportingSurfaceHeight} from './stage.mjs';
import {i18n} from './i18n.mjs';
export function setupPrecision({scene,state,start,leave,retry,next=()=>{},replay=retry,completionLeave=leave,clearInputs=()=>{}}){
 const mission=new PrecisionMission(),panel=document.createElement('aside');panel.id='dispatchPanel';panel.hidden=true;
 panel.innerHTML='<small id="dispatchCount"></small><h2 id="dispatchTitle"></h2><p id="dispatchDistance"></p><p id="dispatchAltitude"></p><small id="dispatchPayload" role="status" hidden></small><div class="dispatch-progress" id="dispatchProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="dispatchFill"></i></div><small id="dispatchStatus" role="status"></small><p id="dispatchHint"></p><button id="retryDispatch"></button><button id="leaveDispatch" data-i18n="modeFree"></button>';
 document.body.append(panel);
 const modes=document.createElement('div');modes.id='flightActivities';modes.innerHTML='<button id="freeFlight" data-i18n="modeFree"></button><button id="precisionFlight" data-i18n="modePrecision" aria-describedby="precisionDescription"></button>';const description=document.createElement('p');description.id='precisionDescription';description.setAttribute('data-i18n','precisionDescription');document.getElementById('helpPanel').prepend(modes,description);
 function bindAction(id,action){const button=document.getElementById(id);button.onclick=event=>{action();if(event.detail>0)button.blur()}}
 bindAction('freeFlight',leave);bindAction('precisionFlight',start);bindAction('retryDispatch',retry);bindAction('leaveDispatch',leave);
 const formatAltitude=value=>Number.isInteger(value*10)?value.toFixed(1):String(value);
 const $=id=>document.getElementById(id),t=(key,params)=>i18n.t(key,params);
 // Repeated flight frames must not re-announce unchanged live-region text.
 const setText=(id,value)=>{const node=$(id);if(node.textContent!==value)node.textContent=value};
 const completion=document.createElement('dialog');completion.id='missionCompletion';completion.hidden=true;
 completion.setAttribute('aria-modal','true');completion.setAttribute('aria-labelledby','missionCongratulations');completion.setAttribute('aria-describedby','missionCompletionSubtitle missionCompletionStage');
 completion.innerHTML='<div class="mission-completion-content"><span class="mission-completion-mark" aria-hidden="true">✦</span><h2 id="missionCongratulations">CONGRATULATIONS!</h2><p id="missionCompletionSubtitle"></p><p id="missionCompletionStage"></p><div class="mission-completion-actions"><button id="nextMissionStage" type="button"></button><button id="replayMissionStage" type="button"></button><button id="leaveMissionCompletion" type="button"></button></div></div>';
 document.body.append(completion);
 let completionVisible=false,previousFocus=null;
 // Native button keyboard activation stays intact; flight shortcuts never see it.
 completion.onkeydown=event=>event.stopPropagation();completion.onkeyup=event=>event.stopPropagation();
 // Completion is a deliberate choice. Escape cannot silently resume the drone.
 completion.oncancel=event=>{event.preventDefault();event.stopPropagation()};
 const completionIsOpen=()=>completion.open||completion.getAttribute('open')!==null&&completion.getAttribute('open')!==undefined;
 // Native close events can arrive after another render has reopened the modal.
 // Only reconcile a genuinely closed dialog; never treat closing as a choice.
 completion.onclose=()=>{if(!completionIsOpen())hideCompletion()};
 function hideCompletion(){
  if(!completionVisible)return;
  completionVisible=false;clearInputs();
  const focusWasInside=completion.contains?.(document.activeElement)||document.activeElement?.closest?.('dialog')===completion;
  if(completion.open&&completion.close)completion.close();
  else completion.removeAttribute?.('open');
  completion.hidden=true;
  // close() may restore an old settings control that is now hidden. Prefer the
  // always-visible ARM/PAUSE control, before the chosen callback opens anything.
  if(focusWasInside||!document.activeElement||document.activeElement===document.body||document.activeElement.closest?.('[hidden]')){
   const target=$('pause')||previousFocus;
   if(target&&!target.hidden&&!target.closest?.('[hidden]'))target.focus?.({preventScroll:true});
  }
  previousFocus=null;
 }
 function showCompletion(){
  if(completionVisible&&completionIsOpen())return;
  // Recover even before the queued native close event has been delivered.
  if(completionVisible)hideCompletion();
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
 // These are flight-path guides only. They add no collision or hover targets.
 // Keep the original pad/corners/beacon together for the earlier stages.
 const crossing=new T.Group();crossing.name='crossing-guide';marker.add(crossing);
 const entryMaterial=new T.MeshBasicMaterial({color:'#94f5cf',transparent:true,opacity:.78,depthWrite:false});
 const exitMaterial=new T.MeshBasicMaterial({color:'#87cfff',transparent:true,opacity:.78,depthWrite:false});
 const boxGeometry=new T.BoxGeometry(1,1,1);
 function portal(name,mat){const group=new T.Group();group.name=name;for(let n=0;n<4;n++)group.add(new T.Mesh(boxGeometry,mat));crossing.add(group);return group}
 const entrance=portal('crossing-entrance',entryMaterial),exit=portal('crossing-exit',exitMaterial);
 const arrows=new T.Group();arrows.name='crossing-arrows';crossing.add(arrows);
 const arrowShape=new T.Shape();arrowShape.moveTo(-.75,-2.2);arrowShape.lineTo(.75,-2.2);arrowShape.lineTo(.75,0);arrowShape.lineTo(2.4,0);arrowShape.lineTo(0,2.8);arrowShape.lineTo(-2.4,0);arrowShape.lineTo(-.75,0);arrowShape.closePath();
 const arrowGeometry=new T.ExtrudeGeometry(arrowShape,{depth:.18,bevelEnabled:false});
 for(let n=0;n<4;n++)arrows.add(new T.Mesh(arrowGeometry,entryMaterial));
 const pathBeacon=new T.Mesh(new T.OctahedronGeometry(1.3),exitMaterial);pathBeacon.name='path-waypoint';marker.add(pathBeacon);
 const orbit=new T.Group();orbit.name='orbit-guide';marker.add(orbit);
 const laneMaterial=new T.MeshBasicMaterial({color:'#94f5cf',transparent:true,opacity:.075,side:T.DoubleSide,depthWrite:false});
 const flightLane=new T.Mesh(new T.RingGeometry(16,32,96),laneMaterial);flightLane.name='orbit-flight-lane';orbit.add(flightLane);
 const lineGeometry=()=>new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(new Float32Array(97*3),3));
 const guideMaterial=new T.LineBasicMaterial({color:'#94f5cf',transparent:true,opacity:.68,depthWrite:false});
 const boundaryMaterial=new T.LineBasicMaterial({color:'#94f5cf',transparent:true,opacity:.3,depthWrite:false});
 const groundGuide=new T.Line(lineGeometry(),guideMaterial);groundGuide.name='orbit-ground-guide';orbit.add(groundGuide);
 const flightGuide=new T.Line(lineGeometry(),guideMaterial);flightGuide.name='orbit-flight-guide';orbit.add(flightGuide);
 const innerGuide=new T.Line(lineGeometry(),boundaryMaterial),outerGuide=new T.Line(lineGeometry(),boundaryMaterial);orbit.add(innerGuide,outerGuide);
 const orbitArc=new T.Line(lineGeometry(),new T.LineBasicMaterial({color:'#f3ffc3',transparent:true,opacity:1,depthWrite:false}));orbitArc.name='orbit-progress-arc';orbit.add(orbitArc);
 let guideObjective=null;
 function setCircle(line,o,radius,height,terrain=false){
  const positions=line.geometry.attributes.position;
  for(let n=0;n<=96;n++){const angle=n/96*Math.PI*2,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;positions.setXYZ(n,x,y,terrain?groundHeight(o.target[0]+x,o.target[1]+y)-marker.position.z+.25:height)}
  positions.needsUpdate=true;line.geometry.computeBoundingSphere();
 }
 function renderGuide(o,f){
  const isCrossing=o.mechanic==='crossing',isOrbit=o.mechanic==='orbit',isPath=isCrossing||isOrbit;
  pad.visible=corners.visible=diamond.visible=!isPath;crossing.visible=isCrossing;orbit.visible=isOrbit;pathBeacon.visible=isPath;
  if(!isPath)return;
  const nav=mission.navigationTarget??o.target;pathBeacon.position.set(nav[0]-marker.position.x,nav[1]-marker.position.y,nav[2]-marker.position.z);
  pathBeacon.material=isCrossing&&f.reason==='crossingApproach'?entryMaterial:exitMaterial;
  if(guideObjective!==o){
   guideObjective=o;
   if(isCrossing){
    // Portals mark the actual crossing planes; the beacon stays farther out
    // so the route also guides the turn safely clear of the bridge pillars.
    const depth=o.crossingDepth??18,direction=o.direction??1,height=f.maxAltitude-f.minAltitude;
    for(const [frame,side] of [[entrance,-1],[exit,1]]){
     frame.position.y=side*direction*depth;
     frame.children[0].position.set(-f.radius,0,(f.minAltitude+f.maxAltitude)/2);frame.children[1].position.set(f.radius,0,(f.minAltitude+f.maxAltitude)/2);
     frame.children[0].scale.set(.18,.18,height);frame.children[1].scale.set(.18,.18,height);
     frame.children[2].position.set(0,0,f.minAltitude);frame.children[3].position.set(0,0,f.maxAltitude);
     frame.children[2].scale.set(f.radius*2,.18,.18);frame.children[3].scale.set(f.radius*2,.18,.18);
    }
    for(const [n,arrow] of arrows.children.entries()){arrow.position.set(0,(-.75+n*.5)*depth,f.minAltitude+.4);arrow.rotation.z=direction===1?0:Math.PI}
   }else{
    const height=o.target[2]-marker.position.z,tolerance=o.orbitTolerance??8;
    flightLane.geometry.dispose();flightLane.geometry=new T.RingGeometry(Math.max(.1,f.radius-tolerance),f.radius+tolerance,96);flightLane.position.z=height;
    setCircle(groundGuide,o,f.radius,0,true);setCircle(flightGuide,o,f.radius,height);
    setCircle(innerGuide,o,Math.max(.1,f.radius-tolerance),height);setCircle(outerGuide,o,f.radius+tolerance,height);
   }
  }
  if(isOrbit){
   const start=f.orbitStartAngle??0,sweep=f.orbitAngle??((f.orbitDirection??1)*(mission.progress??0)*(o.requiredAngle??Math.PI*2));
   const positions=orbitArc.geometry.attributes.position,height=o.target[2]-marker.position.z+.12;
   for(let n=0;n<=96;n++){const angle=start+sweep*n/96;positions.setXYZ(n,Math.cos(angle)*f.radius,Math.sin(angle)*f.radius,height)}
   positions.needsUpdate=true;orbitArc.geometry.computeBoundingSphere();orbitArc.visible=Math.abs(sweep)>.001;
  }
 }
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
  $('dispatchPayload').hidden=!mission.taskStatus;setText('dispatchPayload',mission.taskStatus?t(mission.taskStatus):'');
  $('dispatchTitle').textContent=t(mission.done?'missionComplete':mission.objective.title);
  $('dispatchHint').textContent=mission.done?t('missionReady'):t(mission.objective.hint);
  $('retryDispatch').textContent=t(mission.done?'replayMission':'retryObjective');
  const mechanic=(mission.objective??(mission.done?mission.objectives[total-1]:null))?.mechanic,isPath=mechanic==='crossing'||mechanic==='orbit';
  const progress=Math.round(mission.done?100:Math.min(100,Math.max(0,(mission.progress??mission.hold/holdSeconds)*100)));
  $('dispatchFill').style.width=progress+'%';
  $('dispatchProgress').setAttribute('aria-valuenow',String(progress));
  $('dispatchProgress').setAttribute('aria-label',t(mechanic==='crossing'?'crossingProgress':mechanic==='orbit'?'orbitProgress':'holdProgress'));
  $('dispatchProgress').setAttribute('aria-valuetext',t('missionProgressValue',{progress}));
  panel.setAttribute('data-mechanic',mechanic??'hover');
  if(mission.done){
   setText('dispatchStatus',t('missionComplete'));
   $('missionCompletionSubtitle').textContent=t(mission.allComplete?'allStagesComplete':'stageComplete',{stage:mission.stageIndex+1,title:t(mission.stage.title)});
   $('missionCompletionStage').textContent=t(mission.stage.title);
   $('nextMissionStage').textContent=t('nextStage');$('nextMissionStage').hidden=!mission.hasNext;
   $('replayMissionStage').textContent=t('replayMission');$('leaveMissionCompletion').textContent=t('modeFree');
   showCompletion();
  }
  if(mission.objective){const o=mission.objective,f=mission.feedback?.(state)??objectiveFeedback(state,o);marker.position.set(o.target[0],o.target[1],groundHeight(o.target[0],o.target[1]));pad.position.z=supportingSurfaceHeight(...o.target)-marker.position.z+.035;pad.scale.setScalar(f.radius/4);corners.scale.set(f.radius/4,f.radius/4,1);diamond.position.z=o.target[2]-marker.position.z;diamond.scale.setScalar(mission.stage.kind?7:1);for(const post of corners.children){post.scale.z=(f.maxAltitude-f.minAltitude)/1.1;post.position.z=(f.minAltitude+f.maxAltitude)/2}
   renderGuide(o,f);
   const nav=isPath?mission.navigationTarget??o.target:o.target,dx=nav[0]-state.x,dy=nav[1]-state.y;
   const relative=Math.atan2(-dx,dy)-state.heading;const angle=Math.atan2(Math.sin(relative),Math.cos(relative));
   const direction=Math.abs(angle)<.35?'Ahead':Math.abs(angle)>2.55?'Behind':angle>0?'Left':'Right';
   $('dispatchDistance').textContent=isPath?t(mechanic==='orbit'&&f.reason==='orbitTrack'?'orbitInLane':'waypoint'+direction,{distance:(mechanic==='orbit'&&f.reason==='orbitTrack'?Math.hypot(state.x-o.target[0],state.y-o.target[1]):Math.hypot(dx,dy)).toFixed(1)}):t(f.distance<=f.radius?'targetInside':'target'+direction,{distance:f.distance.toFixed(1)});
   $('dispatchAltitude').textContent=t('targetAltitude',{height:f.altitude.toFixed(1),min:formatAltitude(f.minAltitude),max:formatAltitude(f.maxAltitude)});
   const params={action:t(started||state.elapsed>0?'resume':'startFlight'),distance:f.remaining.toFixed(1),speed:f.horizontalSpeed.toFixed(1),limit:f.horizontalLimit,vertical:f.verticalSpeed.toFixed(1),verticalLimit:f.verticalLimit,seconds:holdSeconds.toFixed(1),progress};
   setText('dispatchStatus',t(isPath&&f.reason==='paused'&&progress>0?'feedback_mechanicPaused':mission.stage.kind&&f.reason==='hold'?'feedback_arrival':'feedback_'+f.reason,params));
  }else {$('dispatchDistance').textContent='';$('dispatchAltitude').textContent=''}
 }
 return {mission,render};
}
