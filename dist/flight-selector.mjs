import {MISSION_STAGES,normalizeStageIndex} from './precision-missions.mjs';
import {createPreviewMotion} from './preview-motion.mjs';
import {i18n} from './i18n.mjs';
import {getFlightProfile} from './flight-profiles.mjs';
import * as T from './vendor/three.module.min.js';
import {VEHICLES,getVehicle,createVehicle,disposeVehicle} from './vehicle-catalog.mjs';
import {REGIONS} from './world.mjs';
const STORAGE_KEY='skyward.flight-selection.v1';
export function normalizeSelection(value={}){return {vehicle:getVehicle(value?.vehicle).id,region:REGIONS.some(r=>r.id===value?.region)?value.region:REGIONS[0].id}}
export function loadSelection(){try{return normalizeSelection(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'))}catch{return normalizeSelection()}}
export function saveSelection(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(normalizeSelection(value)))}catch{/* Private browsing/storage limits must not block flight. */}}
// Reuse the flight renderer and one target/buffer/canvas while the inspector is open.
// Readback is needed to copy an offscreen target to 2D without another WebGL context.
export function createPreviewCapture(renderer,width,height){
 const target=new T.WebGLRenderTarget(width,height);target.texture.colorSpace=T.SRGBColorSpace;
 const pixels=new Uint8Array(width*height*4);
 const rows=Array.from({length:height},(_,row)=>pixels.subarray(row*width*4,(row+1)*width*4));
 let disposed=false,canvas=null,context=null,data=null;
 return {render(scene,camera){
  if(disposed)throw Error('Preview capture disposed');
  const oldTarget=renderer.getRenderTarget(),oldFace=renderer.getActiveCubeFace?.()||0,oldLevel=renderer.getActiveMipmapLevel?.()||0;
  try{renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,width,height,pixels)}finally{renderer.setRenderTarget(oldTarget,oldFace,oldLevel)}
  if(!canvas){canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;context=canvas.getContext('2d');data=context.createImageData(width,height)}
  for(let row=0;row<height;row++)data.data.set(rows[row],(height-row-1)*width*4);
  context.putImageData(data,0,0);return canvas;
 },dispose(){if(!disposed){disposed=true;target.dispose()}}};
}
export function capturePreview(renderer,scene,camera,width,height){
 const capture=createPreviewCapture(renderer,width,height);
 try{return capture.render(scene,camera)}finally{capture.dispose()}
}
export function createFlightSelector({renderer,captureStage,getSelection,getMode=()=> 'free',getMissionStage=()=>0,onOpen,onApply,onClose,mount=document.body}){
 const dialog=document.createElement('dialog');dialog.id='flightSelector';dialog.className='flight-selector';dialog.setAttribute('aria-labelledby','selectorTitle');
 dialog.innerHTML=`<form method="dialog"><header class="selector-heading"><div><p class="selector-kicker" data-i18n="selectorKicker">FLIGHT DECK / CONFIGURATION</p><h2 id="selectorTitle" data-i18n="flightSetup">FLIGHT SETUP</h2></div><button type="button" data-action="cancel" aria-label="Close flight selection" data-i18n-aria-label="selectorClose">✕</button></header><p class="selector-intro" data-i18n="selectorIntro">Explore the actual scenery and inspect your aircraft. Flight stays paused while you choose.</p><div class="selector-body"><section class="selector-mode"><div role="group" aria-label="Flight mode"><button type="button" id="selectorFree" data-i18n="modeFree"></button><button type="button" id="selectorMission" data-i18n="modePrecision"></button></div><p id="selectorAreaHint" class="selector-area-hint" aria-live="polite"></p></section><section id="selectorMissionStages" hidden><div class="selector-section-title"><h3 data-i18n="missionStageChoice"></h3><span data-i18n="untimedStages"></span></div><div class="mission-stage-grid" role="group" data-i18n-aria-label="missionStageChoice"></div></section><section id="selectorStages" aria-labelledby="stageTitle"><div class="selector-section-title"><h3 id="stageTitle" data-i18n="stageTitle">STARTING AREA</h3><span data-i18n="connectedIsland">ONE CONNECTED ISLAND + OCEAN</span></div><div class="stage-grid" role="group" aria-describedby="selectorAreaHint" aria-label="Starting area" data-i18n-aria-label="startingArea"></div></section><section aria-labelledby="aircraftTitle"><div class="selector-section-title"><h3 id="aircraftTitle" data-i18n="aircraftTitle">AIRCRAFT</h3><span data-i18n="fiveStyles">FIVE DISTINCT FLIGHT STYLES</span></div><div class="aircraft-layout"><div class="aircraft-inspector"><canvas class="aircraft-preview" width="600" height="360" tabindex="0" role="img" aria-label="Aircraft preview. Drag or use left and right arrows to rotate." data-i18n-aria-label="previewAria"></canvas><p class="preview-status" role="status" hidden></p><div class="viewer-tools"><button type="button" data-action="left" aria-label="Rotate aircraft left" data-i18n-aria-label="rotateLeft">↶</button><span data-i18n="dragRotate">DRAG TO ROTATE · ← →</span><button type="button" data-action="right" aria-label="Rotate aircraft right" data-i18n-aria-label="rotateRight">↷</button></div></div><div><div class="vehicle-options" role="group" aria-label="Aircraft" data-i18n-aria-label="aircraft"></div><p class="physics-note" data-i18n="physicsNote">All use stabilized ANGLE assistance. Ratings compare arcade tuning with WHOOP 75 = 100, not real-world specifications. Acceleration and top speed are horizontal; turn includes bank response and yaw.</p></div></div></section></div><footer class="selector-footer"><div><strong class="selection-summary" aria-live="polite"></strong><p data-i18n="selectionEffect">Changing area starts a new flight. Changing only aircraft keeps your position and progress.</p></div><div class="selector-actions"><button type="button" data-action="cancel" data-i18n="cancel">CANCEL</button><button type="submit" class="selector-apply" data-i18n="startMissionFlight">START FLIGHT</button></div></footer></form>`;
 mount.append(dialog);
 const $=selector=>dialog.querySelector(selector),stages=$('.stage-grid'),options=$('.vehicle-options'),canvas=$('.aircraft-preview');
 const previewScene=new T.Scene();previewScene.add(new T.HemisphereLight('#e9f6ff','#365c59',3));const light=new T.DirectionalLight('#fff1d0',4);light.position.set(-1,-2,3);previewScene.add(light);
 const previewCamera=new T.PerspectiveCamera(38,600/360,.001,10);previewCamera.up.set(0,0,1);
 let pending=normalizeSelection(),model=null,yaw=.5,elevation=.72,scheduled=0,generation=0,opener=null,drag=null,lastCommitted=normalizeSelection(),pendingMode='free',pendingStage=0,sessionActive=false;
 const stageCache=new Map(),motion=createPreviewMotion();
 const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 let capture=null,lastPaint=null,backdrop=null;
 function createBackdrop(){
  const group=new T.Group();group.name='inspector-backdrop';
  const gradient=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({
   depthTest:false,depthWrite:false,
   vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.999,1.0);}',
   fragmentShader:'varying vec2 vUv; void main(){vec3 low=vec3(0.075,0.13,0.15);vec3 high=vec3(0.21,0.32,0.34);float glow=exp(-5.0*length((vUv-vec2(0.55,0.5))*vec2(1.0,0.8)));gl_FragColor=vec4(mix(low,high,vUv.y)+glow*0.065,1.0); }'
  }));gradient.frustumCulled=false;gradient.renderOrder=-100;group.add(gradient);
  const shadow=new T.Mesh(new T.PlaneGeometry(.24,.24),new T.ShaderMaterial({
   transparent:true,depthWrite:false,
   vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   fragmentShader:'varying vec2 vUv; void main(){float r=length((vUv-0.5)*2.0);gl_FragColor=vec4(0.02,0.035,0.04,0.32*(1.0-smoothstep(0.0,1.0,r)));}'
  }));shadow.position.z=-.021;group.add(shadow);return group;
 }

 function releaseCapture(){capture?.dispose();capture=null}
 function stopAnimation(){if(scheduled)cancelAnimationFrame(scheduled);scheduled=0;lastPaint=null;motion.suspend()}

 for(const [index,region] of REGIONS.entries()){
  const button=document.createElement('button');button.type='button';button.className='stage-card';button.dataset.region=region.id;button.setAttribute('aria-pressed','false');
  const image=document.createElement('img');image.alt=i18n.t('sceneAlt',{name:i18n.t(`region.${region.id}`)});image.width=360;image.height=200;image.hidden=true;
  const loading=document.createElement('span');loading.className='stage-loading';loading.dataset.i18n='renderingScene';loading.textContent=i18n.t('renderingScene');
  const text=document.createElement('span');text.className='stage-card-copy';const title=document.createElement('strong');title.dataset.i18n=`region.${region.id}`;title.textContent=i18n.t(`region.${region.id}`);const note=document.createElement('small');note.dataset.i18n=`stageNote.${region.id}`;note.textContent=i18n.t(`stageNote.${region.id}`);text.append(title,note);button.append(image,loading,text);stages.append(button);
 }
 for(const [index,stage] of MISSION_STAGES.entries()){
  const button=document.createElement('button');button.type='button';button.className='mission-stage-option';button.dataset.missionStage=String(index);
  const title=document.createElement('strong');title.setAttribute('data-i18n',stage.title);const description=document.createElement('span');description.setAttribute('data-i18n',stage.description);button.append(title,description);
  button.onclick=()=>{pendingStage=index;sync()};$('.mission-stage-grid').append(button);
 }
 for(const vehicle of VEHICLES){const button=document.createElement('button');button.type='button';button.className='vehicle-option';button.dataset.vehicle=vehicle.id;button.setAttribute('aria-pressed','false');button.innerHTML=`<span class="vehicle-swatch"></span><span><strong>${vehicle.name}</strong><small data-i18n="vehicle.${vehicle.id}.tag">${i18n.t(`vehicle.${vehicle.id}.tag`)}</small><span data-i18n="vehicle.${vehicle.id}.description">${i18n.t(`vehicle.${vehicle.id}.description`)}</span><span class="vehicle-trait" data-i18n="vehicle.${vehicle.id}.trait">${i18n.t(`vehicle.${vehicle.id}.trait`)}</span><span class="vehicle-metrics">${metrics(vehicle.id)}</span></span>`;button.style.setProperty('--vehicle-color',vehicle.color);button.onclick=()=>{pending.vehicle=vehicle.id;setModel();sync()};options.append(button)}
 function metrics(id){const p=getFlightProfile(id);return i18n.t('profileMetrics',{acceleration:Math.round(p.acceleration*100),response:Math.round(p.response*100),topSpeed:Math.round(p.topSpeed*100)})}
 function refreshLanguage(){
  i18n.apply(dialog);
  for(const button of stages.children){const image=button.querySelector('img');if(image)image.alt=i18n.t('sceneAlt',{name:i18n.t(`region.${button.dataset.region}`)})}
  for(const button of options.children){const label=button.querySelector('.vehicle-metrics');if(label)label.textContent=metrics(button.dataset.vehicle)}
  canvas.setAttribute('aria-label',i18n.t('namedPreviewAria',{name:getVehicle(pending.vehicle).name}));
  if(!$('.preview-status').hidden)$('.preview-status').textContent=i18n.t('aircraftPreviewUnavailable');
  sync();
 }
 function sync(){
  const mission=pendingMode==='mission',effectiveRegion=mission?'airfield':pending.region;
  $('#selectorFree').setAttribute('aria-pressed',String(!mission));$('#selectorMission').setAttribute('aria-pressed',String(mission));
  $('#selectorMissionStages').hidden=!mission;for(const [index,button] of [...$('.mission-stage-grid').children].entries())button.setAttribute('aria-pressed',String(index===pendingStage));
  $('#selectorAreaHint').textContent=i18n.t(mission?'missionAreaHint':'freeAreaHint');
  for(const button of stages.children){
   const region=button.dataset.region,fixed=mission&&region==='airfield';
   // Keep the free-flight choice pending, but expose only the actual mission area.
   button.hidden=mission&&!fixed;button.disabled=mission;button.tabIndex=mission?-1:0;
   button.onclick=mission?null:()=>{pending.region=region;sync()};
   button.setAttribute('aria-pressed',String(region===effectiveRegion));
   const title=button.querySelector('strong');title.dataset.i18n=fixed?'missionFixedArea':`region.${region}`;title.textContent=i18n.t(title.dataset.i18n);
  }
  for(const button of options.children)button.setAttribute('aria-pressed',String(button.dataset.vehicle===pending.vehicle));
  $('.selection-summary').textContent=`${mission?i18n.t(MISSION_STAGES[pendingStage].title):i18n.t('modeFree')} / ${getVehicle(pending.vehicle).name} / ${i18n.t(mission?'missionFixedArea':`region.${effectiveRegion}`)}`;
 }
 $('#selectorFree').onclick=()=>{pendingMode='free';sync()};$('#selectorMission').onclick=()=>{pendingMode='mission';sync()};
 function renderVehicle(now){
  scheduled=0;if(!dialog.open||document.hidden||!model)return;
  yaw+=motion.step(now,model,{dragging:Boolean(drag),reduced:Boolean(reducedMotion?.matches)});
  // Limit the shared-renderer GPU readback to 30fps; RAF still keeps the clock smooth.
  if(lastPaint===null||now-lastPaint>=1000/30-1){
   lastPaint=now;previewCamera.position.set(Math.sin(yaw)*.23,-Math.cos(yaw)*.23,Math.sin(elevation)*.22);previewCamera.lookAt(0,0,.01);
   try{capture??=createPreviewCapture(renderer,canvas.width,canvas.height);canvas.getContext('2d').drawImage(capture.render(previewScene,previewCamera),0,0);$('.preview-status').hidden=true}
   catch{releaseCapture();canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);$('.preview-status').textContent=i18n.t('aircraftPreviewUnavailable');$('.preview-status').hidden=false;motion.suspend();return}
  }
  if(!reducedMotion?.matches)scheduleRender();
 }
 function scheduleRender(){if(!scheduled&&dialog.open&&!document.hidden)scheduled=requestAnimationFrame(renderVehicle)}
 function manualRender(){motion.interact();lastPaint=null;scheduleRender()}
 reducedMotion?.addEventListener?.('change',()=>{stopAnimation();scheduleRender()});
 function setModel(){if(model){previewScene.remove(model.group);disposeVehicle(model.group)}model=createVehicle(pending.vehicle);previewScene.add(model.group);canvas.setAttribute('aria-label',i18n.t('namedPreviewAria',{name:model.preset.name}));lastPaint=null;motion.suspend();scheduleRender()}
 function rotate(amount){yaw+=amount;manualRender()}
 function close(){if(!dialog.open)return;dialog.close();finishClose();}
 function releaseDrag(){const previous=drag;drag=null;if(previous){motion.interact();if(canvas.hasPointerCapture(previous.id))canvas.releasePointerCapture(previous.id)}}
 function finishClose(){if(dialog.open||!sessionActive)return;sessionActive=false;generation++;stopAnimation();releaseCapture();releaseDrag();if(backdrop){previewScene.remove(backdrop);disposeVehicle(backdrop);backdrop=null}if(model){previewScene.remove(model.group);disposeVehicle(model.group);model=null}onClose?.();if(opener?.isConnected&&!opener.closest('[hidden]'))opener.focus();else document.getElementById('help')?.focus();}
 dialog.addEventListener('close',finishClose);dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 addEventListener('blur',releaseDrag);
 document.addEventListener('visibilitychange',()=>{stopAnimation();if(document.hidden)releaseDrag();else scheduleRender()});
 dialog.querySelectorAll('[data-action="cancel"]').forEach(b=>b.onclick=close);$('[data-action="left"]').onclick=()=>rotate(-.3);$('[data-action="right"]').onclick=()=>rotate(.3);
 $('form').addEventListener('submit',e=>{e.preventDefault();if(!dialog.open)return;const next={...pending,region:pendingMode==='mission'?'airfield':pending.region};onApply(next,{areaChanged:next.region!==lastCommitted.region,vehicleChanged:next.vehicle!==lastCommitted.vehicle,mode:pendingMode,stageIndex:pendingStage});saveSelection(next);close()});
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.code)){e.preventDefault();e.stopPropagation();if(e.code==='Home'){yaw=.5;elevation=.72}else if(e.code==='ArrowUp'||e.code==='ArrowDown'){elevation=Math.max(.15,Math.min(1.4,elevation+(e.code==='ArrowUp'?.12:-.12)))}else yaw+=e.code==='ArrowLeft'?-.2:.2;manualRender()}});
 canvas.addEventListener('pointerdown',e=>{if(drag)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};motion.interact()});
 canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw+=(e.clientX-drag.x)*.013;elevation=Math.max(.15,Math.min(1.4,elevation+(e.clientY-drag.y)*.008));drag.x=e.clientX;drag.y=e.clientY;manualRender()});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(drag?.id===e.pointerId)releaseDrag()});
 // Stop global flight shortcuts while the modal owns keyboard interaction.
 dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('keyup',e=>e.stopPropagation());
 async function prepareStages(ticket){for(const [index,r] of REGIONS.entries()){if(ticket!==generation||!dialog.open)return;const button=stages.children[index],img=button.querySelector('img'),status=button.querySelector('.stage-loading');if(!stageCache.has(r.id)){await new Promise(resolve=>requestAnimationFrame(resolve));if(ticket!==generation||!dialog.open)return;try{stageCache.set(r.id,captureStage(index).toDataURL('image/png'))}catch{status.dataset.i18n='previewUnavailable';status.textContent=i18n.t('previewUnavailable');continue}}img.src=stageCache.get(r.id);img.hidden=false;status.hidden=true}}
 return {refreshLanguage,element:dialog,get isOpen(){return dialog.open},open(mode){if(dialog.open){if(mode){pendingMode=mode==='mission'?'mission':'free';sync()}return;}finishClose();opener=document.activeElement;sessionActive=true;onOpen?.();lastCommitted=normalizeSelection(getSelection());pending={...lastCommitted};pendingStage=normalizeStageIndex(getMissionStage());pendingMode=(mode||getMode())==='mission'?'mission':'free';refreshLanguage();yaw=.5;elevation=.72;motion.reset();lastPaint=null;sync();dialog.showModal();backdrop=createBackdrop();previewScene.add(backdrop);$('.selector-body').scrollTop=0;setModel();prepareStages(++generation);(pendingMode==='mission'?$('#selectorMission'):$('#selectorFree')).focus({preventScroll:true});const selectedArea=stages.querySelector('[aria-pressed="true"]'),selectedAircraft=options.querySelector('[aria-pressed="true"]');if(selectedArea?.offsetLeft!==undefined)stages.scrollLeft=selectedArea.offsetLeft;if(selectedAircraft?.offsetTop!==undefined)options.scrollTop=selectedAircraft.offsetTop},close};
}
