import * as T from './vendor/three.module.min.js';
import {VEHICLES,getVehicle,createVehicle,disposeVehicle} from './vehicle-catalog.mjs';
import {REGIONS} from './world.mjs';
const STORAGE_KEY='skyward.flight-selection.v1';
export function normalizeSelection(value={}){return {vehicle:getVehicle(value?.vehicle).id,region:REGIONS.some(r=>r.id===value?.region)?value.region:REGIONS[0].id}}
export function loadSelection(){try{return normalizeSelection(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'))}catch{return normalizeSelection()}}
export function saveSelection(value){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(normalizeSelection(value)))}catch{/* Private browsing/storage limits must not block flight. */}}
// Uses the flight renderer. No extra WebGL context, animation loop or permanent GPU target.
export function capturePreview(renderer,scene,camera,width,height){
 // Target viewport/scissor use physical pixels; renderer.setViewport would multiply by DPR.
 const target=new T.WebGLRenderTarget(width,height);target.texture.colorSpace=T.SRGBColorSpace;
 const oldTarget=renderer.getRenderTarget(),oldFace=renderer.getActiveCubeFace?.()||0,oldLevel=renderer.getActiveMipmapLevel?.()||0;
 const pixels=new Uint8Array(width*height*4);
 try{renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,width,height,pixels)}finally{renderer.setRenderTarget(oldTarget,oldFace,oldLevel);target.dispose()}
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d'),data=context.createImageData(width,height);
 for(let row=0;row<height;row++)data.data.set(pixels.subarray(row*width*4,(row+1)*width*4),(height-row-1)*width*4);
 context.putImageData(data,0,0);return canvas;
}
const stageNotes=['18-gate indoor / outdoor course','Piers, cranes and cargo lanes','Tall arches across the ridge','Hillside buildings and alleys','Open excavation and machinery','Coastal tower and open water','Wind turbines above the hills','Open sea and navigation buoys'];
export function createFlightSelector({renderer,captureStage,getSelection,onOpen,onApply,onClose,mount=document.body}){
 const dialog=document.createElement('dialog');dialog.id='flightSelector';dialog.className='flight-selector';dialog.setAttribute('aria-labelledby','selectorTitle');
 dialog.innerHTML=`<form method="dialog"><header class="selector-heading"><div><p class="selector-kicker">FLIGHT DECK / CONFIGURATION</p><h2 id="selectorTitle">Choose your flight</h2></div><button type="button" data-action="cancel" aria-label="Close flight selection">✕</button></header><p class="selector-intro">Explore the actual scenery and inspect your aircraft. Flight stays paused while you choose.</p><div class="selector-body"><section aria-labelledby="stageTitle"><div class="selector-section-title"><h3 id="stageTitle">01 / STARTING AREA</h3><span>ONE CONNECTED ISLAND + OCEAN</span></div><div class="stage-grid" role="group" aria-label="Starting area"></div></section><section aria-labelledby="aircraftTitle"><div class="selector-section-title"><h3 id="aircraftTitle">02 / AIRCRAFT</h3><span>ORIGINAL VISUAL PRESETS</span></div><div class="aircraft-layout"><div class="aircraft-inspector"><canvas class="aircraft-preview" width="600" height="360" tabindex="0" role="img" aria-label="Aircraft preview. Drag or use left and right arrows to rotate."></canvas><p class="preview-status" role="status" hidden></p><div class="viewer-tools"><button type="button" data-action="left" aria-label="Rotate aircraft left">↶</button><span>DRAG TO ROTATE · ← →</span><button type="button" data-action="right" aria-label="Rotate aircraft right">↷</button></div></div><div><div class="vehicle-options" role="group" aria-label="Aircraft"></div><p class="physics-note">Visual variants share the same stabilized ANGLE flight physics. The selected airframe appears in chase view; FPV uses its camera position.</p></div></div></section></div><footer class="selector-footer"><div><strong class="selection-summary" aria-live="polite"></strong><p>Changing area starts a new flight. Changing only aircraft keeps your position and progress.</p></div><div class="selector-actions"><button type="button" data-action="cancel">CANCEL</button><button type="submit" class="selector-apply">APPLY SELECTION</button></div></footer></form>`;
 mount.append(dialog);
 const $=selector=>dialog.querySelector(selector),stages=$('.stage-grid'),options=$('.vehicle-options'),canvas=$('.aircraft-preview');
 const previewScene=new T.Scene();previewScene.background=new T.Color('#172a30');previewScene.add(new T.HemisphereLight('#e9f6ff','#365c59',3));const light=new T.DirectionalLight('#fff1d0',4);light.position.set(-1,-2,3);previewScene.add(light);
 const previewCamera=new T.PerspectiveCamera(38,600/360,.001,10);previewCamera.up.set(0,0,1);
 let pending=normalizeSelection(),model=null,yaw=.5,elevation=.72,scheduled=0,generation=0,opener=null,drag=null,lastCommitted=normalizeSelection();
 const stageCache=new Map();
 for(const [index,region] of REGIONS.entries()){
  const button=document.createElement('button');button.type='button';button.className='stage-card';button.dataset.region=region.id;button.setAttribute('aria-pressed','false');
  const image=document.createElement('img');image.alt=`In-engine view of ${region.label}`;image.width=360;image.height=200;image.hidden=true;
  const loading=document.createElement('span');loading.className='stage-loading';loading.textContent='RENDERING SCENE…';
  const text=document.createElement('span');text.className='stage-card-copy';const title=document.createElement('strong');title.textContent=region.label;const note=document.createElement('small');note.textContent=stageNotes[index];text.append(title,note);button.append(image,loading,text);button.onclick=()=>{pending.region=region.id;sync()};stages.append(button);
 }
 for(const vehicle of VEHICLES){const button=document.createElement('button');button.type='button';button.className='vehicle-option';button.dataset.vehicle=vehicle.id;button.setAttribute('aria-pressed','false');button.innerHTML=`<span class="vehicle-swatch"></span><span><strong>${vehicle.name}</strong><small>${vehicle.tag}</small><span>${vehicle.description}</span></span>`;button.style.setProperty('--vehicle-color',vehicle.color);button.onclick=()=>{pending.vehicle=vehicle.id;setModel();sync()};options.append(button)}
 function sync(){for(const b of stages.children)b.setAttribute('aria-pressed',String(b.dataset.region===pending.region));for(const b of options.children)b.setAttribute('aria-pressed',String(b.dataset.vehicle===pending.vehicle));$('.selection-summary').textContent=`${getVehicle(pending.vehicle).name} / ${REGIONS.find(r=>r.id===pending.region).label}`;}
 function renderVehicle(){scheduled=0;if(!dialog.open||!model)return;previewCamera.position.set(Math.sin(yaw)*.23,-Math.cos(yaw)*.23,Math.sin(elevation)*.22);previewCamera.lookAt(0,0,.01);try{const image=capturePreview(renderer,previewScene,previewCamera,canvas.width,canvas.height);canvas.getContext('2d').drawImage(image,0,0);$('.preview-status').hidden=true}catch{canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);$('.preview-status').textContent='Aircraft preview unavailable. You can still choose a model below.';$('.preview-status').hidden=false}}
 function scheduleRender(){if(!scheduled&&dialog.open)scheduled=requestAnimationFrame(renderVehicle)}
 function setModel(){if(model){previewScene.remove(model.group);disposeVehicle(model.group)}model=createVehicle(pending.vehicle);previewScene.add(model.group);canvas.setAttribute('aria-label',`${model.preset.name} 3D preview. Drag or use left and right arrows to rotate.`);scheduleRender()}
 function rotate(amount){yaw+=amount;scheduleRender()}
 function close(){if(!dialog.open)return;dialog.close();}
 function releaseDrag(){if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);drag=null}
 dialog.addEventListener('close',()=>{if(dialog.open)return;generation++;if(scheduled)cancelAnimationFrame(scheduled);scheduled=0;releaseDrag();if(model){previewScene.remove(model.group);disposeVehicle(model.group);model=null}onClose?.();if(opener?.isConnected&&!opener.closest('[hidden]'))opener.focus();else document.getElementById('help')?.focus();});
 addEventListener('blur',releaseDrag);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseDrag()});
 dialog.querySelectorAll('[data-action="cancel"]').forEach(b=>b.onclick=close);$('[data-action="left"]').onclick=()=>rotate(-.3);$('[data-action="right"]').onclick=()=>rotate(.3);
 $('form').addEventListener('submit',e=>{e.preventDefault();const next={...pending};onApply(next,{areaChanged:next.region!==lastCommitted.region,vehicleChanged:next.vehicle!==lastCommitted.vehicle});saveSelection(next);close()});
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.code)){e.preventDefault();e.stopPropagation();if(e.code==='Home'){yaw=.5;elevation=.72}else if(e.code==='ArrowUp'||e.code==='ArrowDown'){elevation=Math.max(.15,Math.min(1.4,elevation+(e.code==='ArrowUp'?.12:-.12)))}else yaw+=e.code==='ArrowLeft'?-.2:.2;scheduleRender()}});
 canvas.addEventListener('pointerdown',e=>{if(drag)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY}});
 canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw+=(e.clientX-drag.x)*.013;elevation=Math.max(.15,Math.min(1.4,elevation+(e.clientY-drag.y)*.008));drag.x=e.clientX;drag.y=e.clientY;scheduleRender()});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(drag?.id===e.pointerId)releaseDrag()});
 // Stop global flight shortcuts while the modal owns keyboard interaction.
 dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('keyup',e=>e.stopPropagation());
 async function prepareStages(ticket){for(const [index,r] of REGIONS.entries()){if(ticket!==generation||!dialog.open)return;const button=stages.children[index],img=button.querySelector('img'),status=button.querySelector('.stage-loading');if(!stageCache.has(r.id)){await new Promise(resolve=>requestAnimationFrame(resolve));if(ticket!==generation||!dialog.open)return;try{stageCache.set(r.id,captureStage(index).toDataURL('image/png'))}catch{status.textContent='PREVIEW UNAVAILABLE';continue}}img.src=stageCache.get(r.id);img.hidden=false;status.hidden=true}}
 return {element:dialog,get isOpen(){return dialog.open},open(){if(dialog.open)return;opener=document.activeElement;onOpen?.();lastCommitted=normalizeSelection(getSelection());pending={...lastCommitted};yaw=.5;elevation=.72;sync();dialog.showModal();setModel();prepareStages(++generation);stages.querySelector('[aria-pressed="true"]').focus()},close};
}
