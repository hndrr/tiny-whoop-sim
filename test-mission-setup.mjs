import {finishObjective} from './test-mission-path-helper.mjs';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as T from './dist/vendor/three.module.min.js';
import {setupFlightSelection} from './dist/selection-integration.mjs';
import {loadSelection,saveSelection} from './dist/flight-selector.mjs';
import {FlightState,GATES} from './dist/flight.mjs';
import {setupPrecision} from './dist/precision-ui.mjs';
import {PRECISION_OBJECTIVES,MISSION_STAGES} from './dist/precision-missions.mjs';
import {VEHICLES,createVehicle,disposeVehicle,getVehicle} from './dist/vehicle-catalog.mjs';
import {REGIONS} from './dist/world.mjs';
import {i18n} from './dist/i18n.mjs';

// Dependency-free DOM contract harness. The real unified selector, selection
// integration, precision UI and extracted main controllers install all callbacks.
// Only browser rendering/event scheduling and unrelated HUD elements are modeled.
// Native Escape follows keydown -> cancel -> queued close; layout, focus trapping,
// mobile touch geometry and real WebGL pixels still require browser QA.
class DOMEvent {
 constructor(type,values={}){Object.assign(this,{type,cancelable:false,bubbles:false,defaultPrevented:false,stopped:false},values)}
 preventDefault(){if(this.cancelable)this.defaultPrevented=true}
 stopPropagation(){this.stopped=true}
}
class Events {
 constructor(){this.listeners=new Map()}
 addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener)}
 dispatchEvent(event){event.target??=this;event.currentTarget=this;this[`on${event.type}`]?.(event);for(const listener of this.listeners.get(event.type)||[])listener.call(this,event);if(event.bubbles&&!event.stopped)this.parentNode?.dispatchEvent(event);return !event.defaultPrevented}
 fire(type,values={}){const event=new DOMEvent(type,values);this.dispatchEvent(event);return event}
}
class TextNode {constructor(text){this.nodeType=3;this.textContent=text;this.parentNode=null}}
class Element extends Events {
 constructor(tag,ownerDocument){
  super();this.tagName=tag.toUpperCase();this.nodeType=1;this.ownerDocument=ownerDocument;this.parentNode=null;this.childNodes=[];this.attributes=new Map();this.dataset={};this.open=false;this.hidden=false;this.focusCount=0;this.captured=new Set();
  this.style={setProperty:(name,value)=>{this.style[name]=value}};this.classList={add(){},remove(){},toggle(){}};
  this.context={draws:0,clears:0,drawImage(){this.draws++},clearRect(){this.clears++},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};
 }
 get children(){return this.childNodes.filter(node=>node.nodeType===1)}
 get firstChild(){return this.childNodes[0]||null}
 get id(){return this.getAttribute('id')||''}set id(value){this.setAttribute('id',value)}
 get className(){return this.getAttribute('class')||''}set className(value){this.setAttribute('class',value)}
 get textContent(){return this.childNodes.map(node=>node.textContent).join('')}set textContent(value){this.replaceChildren(new TextNode(String(value)))}
 get isConnected(){return this===this.ownerDocument.body||Boolean(this.parentNode?.isConnected)}
 setAttribute(name,value){this.attributes.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5)]=String(value);if(name==='hidden')this.hidden=true;if(name==='value')this.value=String(value);if(name==='width'||name==='height')this[name]=Number(value)}
 getAttribute(name){return this.attributes.get(name)??null}hasAttribute(name){return this.attributes.has(name)}
 append(...nodes){for(const node of nodes){node.parentNode=this;this.childNodes.push(node)}}
 prepend(...nodes){for(const node of nodes)node.parentNode=this;this.childNodes.unshift(...nodes)}
 before(...nodes){assert.ok(this.parentNode);for(const node of nodes)node.parentNode=this.parentNode;this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),0,...nodes)}
 replaceChildren(...nodes){for(const node of this.childNodes)node.parentNode=null;this.childNodes=[];this.append(...nodes)}
 matches(selector){
  if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));
  if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));
  if(selector.startsWith('#'))return this.id===selector.slice(1);
  const attribute=selector.match(/^([\w-]*)\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if(attribute){if(attribute[1]&&this.tagName!==attribute[1].toUpperCase())return false;return attribute[2]==='open'?this.open:attribute[2]==='hidden'?this.hidden:attribute[3]===undefined?this.hasAttribute(attribute[2]):this.getAttribute(attribute[2])===attribute[3]}
  return this.tagName===selector.toUpperCase();
 }
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)])}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 closest(selector){return this.matches(selector)?this:this.parentNode?.closest?.(selector)||null}
 focus(){this.focusCount++;this.ownerDocument.activeElement=this}
 blur(){if(this.ownerDocument.activeElement===this)this.ownerDocument.activeElement=this.ownerDocument.body}
 click(){return this.fire('click',{cancelable:true,bubbles:true,detail:0})}
 getContext(type){assert.equal(type,'2d');return this.context}
 toDataURL(){return 'data:image/png;test,preview'}
 setPointerCapture(id){this.captured.add(id)}
 hasPointerCapture(id){return this.captured.has(id)}
 releasePointerCapture(id){this.captured.delete(id);this.fire('lostpointercapture',{pointerId:id})}
 showModal(){assert.equal(this.open,false,'showModal must not be called twice');this.previousFocus=this.ownerDocument.activeElement;this.open=true;this.querySelector('select,input,button')?.focus()}
 close(){if(!this.open)return;this.open=false;if(this.ownerDocument.activeElement.closest('dialog')===this)this.previousFocus?.focus();queueMicrotask(()=>this.fire('close'))}
 escape(){assert.equal(this.open,true);this.fire('keydown',{code:'Escape',key:'Escape',cancelable:true,bubbles:true});const event=this.fire('cancel',{cancelable:true});if(!event.defaultPrevented)this.close();return event}
 requestSubmit(){assert.equal(this.tagName,'FORM');return this.fire('submit',{cancelable:true,bubbles:true})}
 set innerHTML(markup){
  this.replaceChildren();const stack=[this];
  for(const token of markup.match(/<[^>]+>|[^<]+/g)||[]){
   if(token.startsWith('</')){assert.ok(stack.length>1,'balanced template');stack.pop();continue}
   if(!token.startsWith('<')){stack.at(-1).append(new TextNode(token));continue}
   const tag=token.match(/^<([\w-]+)/)?.[1];assert.ok(tag,'supported template tag');const element=new Element(tag,this.ownerDocument);
   for(const match of token.slice(tag.length+1,-1).matchAll(/([\w-]+)(?:="([^"]*)")?/g))element.setAttribute(match[1],match[2]??'');
   stack.at(-1).append(element);if(!['img','input','br','hr','meta','link'].includes(tag))stack.push(element);
  }
  assert.equal(stack.length,1,'balanced template');
 }
}
class Document extends Events {
 constructor(){super();this.hidden=false;this.body=new Element('body',this);this.body.parentNode=this;this.activeElement=this.body;this.documentElement={lang:'en'}}
 createElement(tag){return new Element(tag,this)}
 getElementById(id){return this.body.querySelector(`#${id}`)}
 querySelector(selector){return this.body.querySelector(selector)}
 querySelectorAll(selector){return this.body.querySelectorAll(selector)}
}
const globalNames=['document','localStorage','matchMedia','addEventListener','requestAnimationFrame','cancelAnimationFrame'];
const originalGlobals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const originalLanguage=i18n.language;
const document=new Document(),windowEvents=new Events(),stored=new Map(),frames=new Map();document.parentNode=windowEvents;
let coarse=false,writes=0,frameId=0;
Object.assign(globalThis,{document,matchMedia:query=>({matches:query.includes('prefers-reduced-motion')||coarse}),addEventListener:windowEvents.addEventListener.bind(windowEvents),localStorage:{getItem:key=>stored.get(key)??null,setItem(key,value){writes++;stored.set(key,String(value))}},requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId},cancelAnimationFrame:id=>frames.delete(id)});
async function flushFrames(){
 for(let turn=0;turn<40;turn++){
  await Promise.resolve();if(!frames.size){await Promise.resolve();if(!frames.size)return}
  const batch=[...frames.values()];frames.clear();for(const callback of batch)callback(turn*16);
 }
 assert.fail('selector scheduled an unexpected permanent animation loop');
}
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
function sourceBetween(start,end){const from=main.indexOf(start),to=main.indexOf(end,from);assert.ok(from>=0&&to>from,`actual main controller boundaries: ${start}`);return main.slice(from,to)}

try {
 i18n.setLanguage('en');
 const css=readFileSync(new URL('./dist/flight-selector.css',import.meta.url),'utf8');
 assert.match(css,/position:fixed;inset:0;width:min\(1180px,calc\(100vw - 48px\)\)/,'large desktop settings surface');
 assert.match(css,/height:90dvh;max-height:calc\(100dvh - 48px\);margin:auto/,'centered with a mode-independent viewport-bounded height');
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,'desktop area grid uses available width');
 assert.match(css,/grid-template-columns:minmax\(0,1\.1fr\) minmax\(0,1fr\)/,'large preview beside aircraft choices');
 assert.match(css,/height:auto;aspect-ratio:5 \/ 3;object-fit:contain/,'large preview preserves its render-buffer aspect ratio');
 assert.match(css,/@media\(max-width:700px\)/,'narrow-screen layout is explicit');
 assert.match(css,/width:calc\(100vw - 24px\);max-width:calc\(100vw - 24px\);height:calc\(100dvh - 24px\)/,'mobile viewport margins');
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'mobile choices remain a wrapping grid');
 assert.match(css,/\.vehicle-options\{max-height:none;overflow:visible\}/,'mobile uses body scrolling instead of nested aircraft scroll');
 assert.match(css,/min-height:0;overflow:auto;overflow-x:hidden;flex:1/,'body can shrink and scroll without pushing footer out');
 assert.match(css,/background:#102227;flex:none/,'footer remains outside the shrinking body');
 assert.match(css,/height:calc\(100dvh - 16px\);max-height:calc\(100dvh - 16px\)/,'short viewports retain safe margins');
 assert.doesNotMatch(css,/selectorMissionBrief|inset:auto var\(--edge\)|width:min\(350px/,'no wizard or old compact side anchor');
 // These check CSS sizing contracts, not browser rendering or WebGL pixels.
 for(const [width,height] of [[1440,900],[1280,720],[768,1024],[390,844],[320,568],[844,390]]){
  const mobile=width<=700,dialogWidth=mobile?width-24:Math.min(1180,width-48);
  const dialogHeight=height<=520?height-16:mobile?height-24:Math.min(height*.9,height-48);
  const left=(width-dialogWidth)/2,top=(height-dialogHeight)/2;
  assert.ok(left>=12&&top>=8,`viewport margins at ${width}×${height}`);
  assert.equal(left+dialogWidth/2,width/2);assert.equal(top+dialogHeight/2,height/2);
 }
 assert.equal(i18n.t('stageTitle'),'STARTING AREA');assert.equal(i18n.t('aircraftTitle'),'AIRCRAFT');
 assert.doesNotMatch(main,/createMissionSetup|applyMissionSelection|missionSetup\.open/,'main has one aircraft/mode/stage preparation flow');
 assert.equal(existsSync(new URL('./dist/mission-setup.mjs',import.meta.url)),false,'retired separate mission dialog module is removed');
 for(const id of ['help','closeHelp','helpPanel','pause','areaSelect','relocate']){const element=document.createElement(id==='areaSelect'?'select':id==='helpPanel'?'section':'button');element.id=id;document.body.append(element)}
 const brand=document.createElement('div');brand.className='brand';brand.textContent='WHOOP 75';document.body.append(brand);
 const areaLabel=document.createElement('label');areaLabel.setAttribute('for','areaSelect');document.body.append(areaLabel);
 const $=id=>document.getElementById(id),state=new FlightState(),keys=new Set(),axes={pitch:0,roll:0,throttle:0,yaw:0};
 const scene=new T.Scene(),skyDome=new T.Group(),sun=new T.DirectionalLight(),terrainChunks=[],regionGroups=REGIONS.map(()=>new T.Group()),airfieldGroup=new T.Group();
 const renderer={target:null,fail:false,allocated:0,disposed:0,getRenderTarget(){return this.target},setRenderTarget(target){this.target=target;if(target){this.allocated++;target.addEventListener('dispose',()=>this.disposed++)}},render(){if(this.fail)throw Error('simulated preview failure')},readRenderTargetPixels(_target,_x,_y,_w,_h,pixels){pixels.fill(0)}};
 let drone=new T.Group(),meshChanges=0,stickClears=0,hudUpdates=0,cameraChanges=0,controller;
 saveSelection({vehicle:'scout85',region:'harbor'});writes=0;
 controller=runInNewContext(
  'let flightSelection,precision,flightStarted=false;'+
  sourceBetween('function reset(){','function switchCamera(){')+
  sourceBetween('function help(show){',"$('help').onclick=")+
  sourceBetween("addEventListener('keydown',e=>{",'function suspendInput(){')+
  sourceBetween('precision=setupPrecision({','const osd=')+
  main.slice(main.indexOf('const language=document.createElement'))+
  ';({startPrecision,leavePrecision,reset,toggle,help,get selection(){return flightSelection},get precision(){return precision},get mission(){return precision.mission},get flightStarted(){return flightStarted}})',
  {document,$,s:state,keys,axes,setupFlightSelection,setupPrecision,
   clearSticks(){stickClears++;for(const key of Object.keys(axes))axes[key]=0},updateHUD(){hudUpdates++;controller?.precision.render(controller.flightStarted)},
   setVehicle(id){disposeVehicle(drone);drone=createVehicle(id).group;meshChanges++},addEventListener:windowEvents.addEventListener.bind(windowEvents),sticks:{render(){}},switchCamera(){cameraChanges++},
   renderer,scene,skyDome,sun,terrainChunks,regionGroups,airfieldGroup,get drone(){return drone},i18n}
 );
 const selector=controller.selection.selector,dialog=selector.element,form=dialog.querySelector('form'),canvas=dialog.querySelector('.aircraft-preview'),aircraft=dialog.querySelector('.vehicle-options'),stages=dialog.querySelector('.stage-grid');
 const cancel=dialog.querySelectorAll('[data-action="cancel"]').at(-1),start=dialog.querySelector('[type="submit"]');
 const vehicleButton=id=>aircraft.children.find(button=>button.dataset.vehicle===id),regionButton=id=>stages.children.find(button=>button.dataset.region===id);
 const currentPersistence=()=>JSON.stringify([...stored]);
 const liveSnapshot=()=>JSON.stringify({state,mission:controller.mission,selected:controller.selection.selected,meshVehicle:drone.userData.vehicleId,flightStarted:controller.flightStarted});
 const unpausedSnapshot=()=>JSON.stringify({state:{...state,paused:false},mission:controller.mission,selected:controller.selection.selected,meshVehicle:drone.userData.vehicleId,flightStarted:controller.flightStarted});
 const progress=()=>[state.x,state.y,state.z,state.vx,state.vy,state.vz,state.heading,state.elapsed,state.gate];
 let starts=0,leaves=0,resets=0,relocations=0;
 const realStart=controller.mission.start,realLeave=controller.mission.leave,realReset=state.reset,realRelocate=state.relocate;
 controller.mission.start=function(...args){starts++;return realStart.apply(this,args)};
 controller.mission.leave=function(...args){leaves++;return realLeave.apply(this,args)};
 state.reset=function(...args){resets++;return realReset.apply(this,args)};
 state.relocate=function(...args){relocations++;return realRelocate.apply(this,args)};
 function seed({paused=true,active=false,done=false}={}){
  Object.assign(state,{x:91,y:127,z:34,vx:1.1,vy:-.6,vz:.3,heading:.7,elapsed:23,gate:7,paused,crashed:false,region:REGIONS.findIndex(region=>region.id===controller.selection.selected.region),complete:false,explore:true});
  Object.assign(controller.mission,{active,index:done?4:2,hold:.43,done});
  $('helpPanel').hidden=!paused;keys.add('KeyW');axes.throttle=1;$('help').focus();controller.precision.render(controller.flightStarted);
 }
 function assertPending(mode,vehicle,region){
  assert.equal($('selectorMission').getAttribute('aria-pressed'),String(mode==='mission'));
  assert.equal($('selectorFree').getAttribute('aria-pressed'),String(mode==='free'));
  assert.equal($('selectorStages').hidden,false);assert.equal($('selectorAreaHint').textContent,i18n.t(mode==='mission'?'missionAreaHint':'freeAreaHint'));
  assert.deepEqual(aircraft.children.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.vehicle),[vehicle]);
  assert.match(canvas.getAttribute('aria-label'),new RegExp(getVehicle(vehicle).name));
  if(mode==='mission'||region)assert.deepEqual(stages.children.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.region),[mode==='mission'?'airfield':region]);
  for(const button of stages.children){
   assert.equal(button.disabled,mode==='mission');assert.equal(button.tabIndex,mode==='mission'?-1:0);
   assert.equal(button.hidden,mode==='mission'&&button.dataset.region!=='airfield');
   assert.equal(typeof button.onclick,mode==='mission'?'object':'function');
  }
  if(mode==='mission')assert.equal(regionButton('airfield').querySelector('strong').textContent,i18n.t('missionFixedArea'));
 }
 function counts(){return {starts,leaves,resets,relocations,meshChanges,writes}}
 function assertClosed(){assert.equal(selector.isOpen,false);assert.equal(renderer.target,null);assert.equal(renderer.allocated,renderer.disposed);assert.equal(frames.size,0);assert.equal(canvas.captured.size,0)}

 assert.equal(document.querySelectorAll('.flight-selector').length,1,'free and mission modes share exactly one setup dialog');assert.equal(document.querySelectorAll('dialog').length,2,'completion celebration is separate from setup');
 assert.equal(dialog.id,'flightSelector');assert.equal(dialog.getAttribute('aria-labelledby'),'selectorTitle');
 assert.equal(document.getElementById('missionSetup'),null);assert.equal(aircraft.children.length,VEHICLES.length);assert.equal(stages.children.length,REGIONS.length);
 assert.equal(form.querySelectorAll('[type="submit"]').length,1,'one explicit Start commits all setup choices');
 assert.equal($('selectorFree').getAttribute('type'),'button');assert.equal($('selectorMission').getAttribute('type'),'button');
 for(const vehicle of VEHICLES){assert.ok(vehicleButton(vehicle.id));assert.equal(vehicleButton(vehicle.id).querySelector('.vehicle-trait').textContent,i18n.t(`vehicle.${vehicle.id}.trait`))}
 console.log('PASS: one real named selector contains mode buttons, all five aircraft, shared 3D preview, stage choices, constant-height area guidance and one submit');

 assert.equal($('languageSelect').closest('.selector-heading'),dialog.querySelector('.selector-heading'),'language remains in the same compact settings panel');
 dialog.querySelector('.selector-body').scrollTop=999;$('help').click();assert.equal(dialog.querySelector('.selector-body').scrollTop,0,'reopen shows choices and preview instead of old help scroll');assert.equal(dialog.open,true);assert.equal($('helpPanel').hidden,true,'SETUP skips the old intermediate menu');assert.equal($('help').getAttribute('aria-expanded'),'true');
 const languageControl=$('languageSelect');languageControl.focus();languageControl.value='ja';languageControl.fire('change');assert.equal(i18n.getLanguage(),'ja');assert.equal(document.activeElement,languageControl,'keyboard language change retains focus');languageControl.fire('pointerdown');languageControl.value='en';languageControl.fire('change');assert.equal(document.activeElement,languageControl,'pointer language change keeps focus inside settings');languageControl.value='ja';languageControl.fire('change');const beforeShortcut=liveSnapshot();document.body.fire('keydown',{code:'KeyP',bubbles:true});assert.equal(liveSnapshot(),beforeShortcut,'even a body-targeted shortcut cannot fly behind settings');
 cancel.click();await flushFrames();assert.equal($('help').getAttribute('aria-expanded'),'false');assert.equal(i18n.getLanguage(),'ja','Cancel affects flight choices, not the existing immediate language setting');i18n.setLanguage('en');
 // No ordering contract: all six permutations can be edited in either mode,
 // canceled without effects, then committed through the same single submit.
 const orders=[['mode','area','aircraft'],['mode','aircraft','area'],['area','mode','aircraft'],['area','aircraft','mode'],['aircraft','mode','area'],['aircraft','area','mode']];
 for(const mode of ['free','mission'])for(const order of orders){
  seed({paused:false,active:false});const before=liveSnapshot(),saved=currentPersistence();
  $('chooseFlight').click();const focused=document.activeElement;
  const edit={mode:()=>$(mode==='mission'?'selectorMission':'selectorFree').click(),area:()=>regionButton('offshore').click(),aircraft:()=>vehicleButton('racer90').click()};
  for(const key of order){edit[key]();assert.equal(document.activeElement,focused,'choice handlers never steal focus');assert.equal($('selectorStages').hidden,false,'areas stay in the same view');assert.equal(canvas.closest('[hidden]'),null,'preview stays in the same view')}
  assertPending(mode,'racer90',mode==='free'?'offshore':undefined);cancel.click();await flushFrames();assert.equal(liveSnapshot(),before);assert.equal(currentPersistence(),saved);
  $('chooseFlight').click();for(const key of order)edit[key]();form.requestSubmit();await flushFrames();assertClosed();assert.equal(state.paused,false);assert.deepEqual(controller.selection.selected,{vehicle:'racer90',region:mode==='mission'?'airfield':'offshore'});assert.equal(controller.mission.active,mode==='mission');
 }
 console.log('PASS: all six mode/area/aircraft edit orders in both modes remain pending, cancel cleanly, start once, retain the preview and never move focus');

 // Mission area controls have neither pointer handlers nor keyboard tab stops.
 // Switching modes restores every pending free area without touching the flight.
 for(const region of REGIONS){
  seed({paused:false,active:false});const before=liveSnapshot(),saved=currentPersistence(),beforeCounts=counts();
  controller.leavePrecision();regionButton(region.id).click();assertPending('free',controller.selection.selected.vehicle,region.id);
  for(let repeat=0;repeat<3;repeat++){
   $('selectorMission').click();assertPending('mission',controller.selection.selected.vehicle);
   for(const button of stages.children){
    assert.equal(button.onclick,null);button.click();button.fire('click',{bubbles:true});
    for(const code of ['Enter','Space'])button.fire('keydown',{code,bubbles:true,cancelable:true});
   }
   assertPending('mission',controller.selection.selected.vehicle);
   assert.match(dialog.querySelector('.selection-summary').textContent,new RegExp(i18n.t('missionFixedArea').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   $('selectorFree').click();assertPending('free',controller.selection.selected.vehicle,region.id);
   assert.equal(regionButton('airfield').querySelector('strong').textContent,i18n.t('region.airfield'));
   assert.deepEqual(counts(),beforeCounts);assert.equal(currentPersistence(),saved);
  }
  cancel.click();await flushFrames();assert.equal(liveSnapshot(),before);assert.equal(currentPersistence(),saved);
  controller.leavePrecision();assertPending('free',controller.selection.selected.vehicle,controller.selection.selected.region);cancel.click();await flushFrames();
 }
 console.log('PASS: mission areas have no click handlers or tab stops; only fixed airfield is visible; every free-area choice survives repeated mode switches and Cancel/reopen');

 // Open through the real precision UI buttons and main callbacks. Neither mode
 // button may mutate mission progress until the shared form is submitted.
 for(const paused of [true,false])for(const active of [false,true])for(const entry of ['help','precisionFlight','freeFlight','chooseFlight']){
  seed({paused,active});const before=liveSnapshot(),withoutPause=unpausedSnapshot(),saved=currentPersistence(),beforeCounts=counts(),beforeClears=stickClears;
  $(entry).click();assert.equal(dialog.open,true);assert.equal(state.paused,true);assertPending(entry==='precisionFlight'?'mission':entry==='freeFlight'?'free':active?'mission':'free',controller.selection.selected.vehicle);
  assert.equal(unpausedSnapshot(),withoutPause,'opening only pauses the current flight');assert.equal(keys.size,0);assert.equal(axes.throttle,0);assert.equal(stickClears,beforeClears+1);
  for(const vehicle of VEHICLES){vehicleButton(vehicle.id).click();$('selectorMission').click();assertPending('mission',vehicle.id);$('selectorFree').click();regionButton('offshore').click();assertPending('free',vehicle.id,'offshore');assert.equal(unpausedSnapshot(),withoutPause);assert.deepEqual(counts(),beforeCounts,'aircraft, stage and mode stay pending')}
  controller.startPrecision();controller.leavePrecision();selector.open();assert.equal(stickClears,beforeClears+1,'repeated open preserves original snapshot and pending choices');assertPending('free','cine95','offshore');
  cancel.click();await flushFrames();assertClosed();assert.equal(liveSnapshot(),before,'Cancel restores paused/flying and active/inactive mission state');assert.equal(currentPersistence(),saved);assert.deepEqual(counts(),beforeCounts);
  const afterCancel=stickClears;cancel.click();selector.close();dialog.fire('close');await flushFrames();assert.equal(stickClears,afterCancel,'duplicate cancel/close is idempotent');assert.equal(liveSnapshot(),before);
 }
 console.log('PASS: every entry point shares pending mode/aircraft/stage state; cancellation restores paused and flying sessions without moving, persisting or changing missions');

 for(const paused of [true,false])for(const dismiss of ['escape','close']){
  seed({paused,active:true,done:true});const before=liveSnapshot(),beforeCounts=counts();$('leaveDispatch').click();assertPending('free',controller.selection.selected.vehicle);vehicleButton('racer90').click();regionButton('offshore').click();
  if(dismiss==='escape')dialog.escape();else dialog.close();await flushFrames();assertClosed();assert.equal(liveSnapshot(),before,`${dismiss} restores completed mission progress and pause`);assert.deepEqual(counts(),beforeCounts);
 }
 for(let repeat=0;repeat<12;repeat++){
  seed({paused:repeat%2===0,active:true});const before=liveSnapshot();controller.startPrecision();vehicleButton('micro65').click();
  canvas.fire('pointerdown',{cancelable:true,pointerId:repeat+1,clientX:20,clientY:30});assert.equal(canvas.hasPointerCapture(repeat+1),true);if(repeat%3===0)dialog.close();else if(repeat%3===1)cancel.click();else dialog.escape();
  controller.leavePrecision();vehicleButton('cine95').click();regionButton('offshore').click();await flushFrames();assert.equal(dialog.open,true,'an old queued close must not cancel a reopened setup');assertPending('free','cine95','offshore');
  dialog.escape();await flushFrames();assertClosed();assert.equal(liveSnapshot(),before,'rapid reopening never replaces the original live state');
 }
 console.log('PASS: native Escape, direct close, duplicate events, drag cleanup and repeated/rapid reopen preserve running and completed mission progress');

 seed({paused:false,active:true});controller.startPrecision();vehicleButton('racer90').click();const pendingSnapshot=liveSnapshot(),beforeCounts=counts(),beforeCameras=cameraChanges;
 for(const code of ['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyP','KeyR','KeyC','Escape']){
  const event=start.fire('keydown',{code,key:code,cancelable:true,bubbles:true});assert.equal(event.stopped,true,`${code} stays in the modal`);assert.equal(event.defaultPrevented,false,`${code} retains native control behavior`);assert.equal(liveSnapshot(),pendingSnapshot);assert.equal(keys.size,0);
  start.fire('keyup',{code,key:code,bubbles:true});assert.equal(keys.size,0);
 }
 canvas.fire('keydown',{code:'ArrowLeft',cancelable:true,bubbles:true});assert.equal(cameraChanges,beforeCameras);assert.deepEqual(counts(),beforeCounts);
 for(const mobile of [false,true])for(const language of ['ja','en']){
  coarse=mobile;i18n.setLanguage(language);assertPending('mission','racer90');assert.equal(liveSnapshot(),pendingSnapshot,'translation does not commit or restart');assert.deepEqual(counts(),beforeCounts);
  assert.equal($('selectorTitle').textContent,i18n.t('flightSetup'));assert.equal($('selectorFree').textContent,i18n.t('modeFree'));assert.equal($('selectorMission').textContent,i18n.t('modePrecision'));assert.equal(cancel.textContent,i18n.t('cancel'));assert.equal(start.textContent,i18n.t('startMissionFlight'));
  assert.equal($('selectorAreaHint').textContent,i18n.t('missionAreaHint')); 
  assert.equal(vehicleButton('racer90').querySelector('.vehicle-trait').textContent,i18n.t('vehicle.racer90.trait'));
 }
 $('selectorFree').click();regionButton('offshore').click();i18n.setLanguage('ja');assertPending('free','racer90','offshore');i18n.setLanguage('en');assertPending('free','racer90','offshore');cancel.click();await flushFrames();coarse=false;
 console.log('PASS: modal keyboard/reset shortcuts never fly behind controls; EN/JA refresh preserves pending mode, aircraft and area plus localized mission guidance');

 // Every aircraft starts the same mission via the real shared form. The selected
 // free-flight area deliberately differs, ensuring mission commits airfield.
 for(const {id:vehicle} of VEHICLES){
  seed({paused:true,active:false});const beforeMeshes=meshChanges,beforeVehicle=controller.selection.selected.vehicle,beforeWrites=writes,beforeStarts=starts;
  controller.leavePrecision();regionButton('offshore').click();vehicleButton(vehicle).click();$('selectorMission').click();assertPending('mission',vehicle);
  keys.add('KeyW');axes.throttle=1;assert.equal(form.requestSubmit().defaultPrevented,true);assert.equal(dialog.open,false);assert.equal(state.paused,false,'one Start begins flight without ARM');
  assert.equal(controller.flightStarted,true);assert.equal(starts,beforeStarts+1);assert.equal(controller.mission.active,true);assert.equal(controller.mission.index,0);assert.equal(controller.mission.done,false);assert.equal(controller.mission.hold,0);
  assert.deepEqual([state.x,state.y,state.z],[...PRECISION_OBJECTIVES[0].checkpoint]);assert.equal(state.region,0);assert.equal(state.aircraft,vehicle);assert.equal(drone.userData.vehicleId,vehicle);
  assert.deepEqual(controller.selection.selected,{vehicle,region:'airfield'});assert.deepEqual(loadSelection(),{vehicle,region:'airfield'});assert.equal(writes,beforeWrites+1);assert.equal(meshChanges,beforeMeshes+(beforeVehicle===vehicle?0:1));
  assert.equal(keys.size,0);assert.equal(axes.throttle,0);assert.equal($('helpPanel').hidden,true);
  const started=liveSnapshot(),afterCounts=counts();form.requestSubmit();start.click();cancel.click();dialog.fire('close');await flushFrames();assertClosed();assert.equal(liveSnapshot(),started,'stale submit/close/cancel does not pause or restart flight');assert.deepEqual(counts(),afterCounts);assert.ok(document.activeElement&&!document.activeElement.closest('[hidden]'),'focus returns to a visible flight control');
  controller.startPrecision();vehicleButton(vehicle==='cine95'?'micro65':'cine95').click();await flushFrames();assert.equal(dialog.open,true);cancel.click();await flushFrames();assert.equal(liveSnapshot(),started,'cancel after launch preserves started/running mission');
  const position=[state.x,state.y,state.z];controller.toggle();assert.equal(state.paused,true);controller.toggle();assert.equal(state.paused,false);assert.deepEqual([state.x,state.y,state.z],position,'pause/resume does not teleport');
  controller.mission.index=2;state.x=200;controller.reset();assert.equal(state.paused,true);assert.equal(controller.flightStarted,false);assert.equal(controller.mission.index,2);assert.deepEqual([state.x,state.y,state.z],[...PRECISION_OBJECTIVES[2].checkpoint]);assert.equal(state.aircraft,vehicle);
 }
 console.log('PASS: all five aircraft commit/persist/launch one mission at the explicit airfield checkpoint; no extra ARM, stale submit or queued close can restart/pause it; retry keeps the aircraft');

 // Aircraft-only apply within an active mission must continue the same objective,
 // while a crashed mission retries its current checkpoint with the chosen craft.
 seed({paused:false,active:true});const ongoing=progress(),ongoingMission=JSON.stringify(controller.mission),ongoingStarts=starts,ongoingResets=resets,ongoingLeaves=leaves;
 controller.startPrecision();vehicleButton('racer90').click();form.requestSubmit();await flushFrames();assertClosed();assert.deepEqual(progress(),ongoing);assert.equal(JSON.stringify(controller.mission),ongoingMission);assert.equal(starts,ongoingStarts);assert.equal(resets,ongoingResets);assert.equal(leaves,ongoingLeaves);assert.equal(state.paused,false);assert.equal(state.aircraft,'racer90');
 state.crashed=true;controller.startPrecision();vehicleButton('micro65').click();form.requestSubmit();await flushFrames();assertClosed();assert.equal(starts,ongoingStarts);assert.equal(controller.mission.index,2);assert.equal(controller.mission.hold,0);assert.equal(state.crashed,false);assert.equal(state.paused,false);assert.deepEqual([state.x,state.y,state.z],[...PRECISION_OBJECTIVES[2].checkpoint]);assert.equal(state.aircraft,'micro65');
 console.log('PASS: applying aircraft within an active mission continues its objective; crashed mission retries the checkpoint and flies with the chosen aircraft');

 // Same-area mission exit must restore practice without teleporting the drone.
 controller.startPrecision();form.requestSubmit();await flushFrames();
 assert.equal(state.practiceEnabled,false);const missionPosition=[state.x,state.y,state.z];
 controller.leavePrecision();form.requestSubmit();await flushFrames();
 assert.equal(controller.mission.active,false);assert.equal(state.practiceEnabled,true);
 assert.deepEqual([state.x,state.y,state.z],missionPosition);
 const beforePractice=state.practiceCount;state.updatePractice([state.x,state.y,state.z],.02);
 assert.equal(state.practiceCount,beforePractice);
 [state.x,state.y,state.z]=GATES[0];state.updatePractice([0,8,2.4],.02);assert.equal(state.practiceCount,beforePractice+1);
 // Leaving a mission is equally reversible until submit, then the selected free
 // stage is applied and flying begins immediately through the same controller.
 seed({paused:false,active:true});const beforeLeave=leaves,beforeStarts=starts;controller.leavePrecision();assert.equal(controller.mission.active,true);assertPending('free',controller.selection.selected.vehicle);regionButton('harbor').click();vehicleButton('scout85').click();form.requestSubmit();await flushFrames();
 assertClosed();assert.equal(controller.mission.active,false);assert.equal(leaves,beforeLeave+1);assert.equal(starts,beforeStarts);assert.equal(state.paused,false);assert.equal(controller.flightStarted,true);assert.equal(state.region,1);assert.equal(state.aircraft,'scout85');assert.deepEqual(loadSelection(),{vehicle:'scout85',region:'harbor'});
 for(const {id:vehicle} of VEHICLES){
  seed({paused:false,active:false});const before=progress(),beforeResets=resets,beforeRelocations=relocations,beforeStarts=starts;
  $('chooseFlight').click();assertPending('free',controller.selection.selected.vehicle,'harbor');vehicleButton(vehicle).click();form.requestSubmit();await flushFrames();assertClosed();assert.deepEqual(progress(),before,'free-flight aircraft-only change retains full position and progress');assert.equal(resets,beforeResets);assert.equal(relocations,beforeRelocations);assert.equal(starts,beforeStarts);assert.equal(state.paused,false);assert.equal(controller.mission.active,false);assert.equal(state.aircraft,vehicle);assert.deepEqual(loadSelection(),{vehicle,region:'harbor'});
 }
 controller.leavePrecision();regionButton('offshore').click();form.requestSubmit();await flushFrames();assert.equal(state.region,REGIONS.findIndex(region=>region.id==='offshore'));assert.equal(state.paused,false);assert.equal(controller.mission.active,false);
 console.log('PASS: committed free mode leaves mission exactly once, starts selected stage immediately and preserves flight position/progress for same-area aircraft-only changes');

 renderer.fail=true;controller.startPrecision();vehicleButton('micro65').click();await flushFrames();assert.equal(dialog.querySelector('.preview-status').hidden,false);const beforeFailureStarts=starts;form.requestSubmit();await flushFrames();assert.equal(starts,beforeFailureStarts+1);assert.equal(state.paused,false);assert.equal(state.aircraft,'micro65');assertClosed();
 renderer.fail=false;controller.startPrecision();await flushFrames();assert.equal(dialog.querySelector('.preview-status').hidden,true);cancel.click();await flushFrames();assertClosed();assert.ok(canvas.context.draws>0);assert.ok(canvas.context.clears>0);assert.ok(hudUpdates>0);
 console.log('PASS: shared preview fallback/recovery keeps both modes usable and disposes GPU targets without a permanent render loop');
 // Stage choices use the same pending transaction as mode and aircraft.
 const missionChoices=dialog.querySelector('.mission-stage-grid');assert.equal(missionChoices.children.length,MISSION_STAGES.length);
 for(const stageIndex of [1,2,3,4,5,6,0]){
  controller.startPrecision();const before=liveSnapshot(),saved=currentPersistence();missionChoices.children[stageIndex].click();vehicleButton('cine95').click();
  for(const language of ['ja','en']){i18n.setLanguage(language);assert.equal(missionChoices.children[stageIndex].getAttribute('aria-pressed'),'true');assert.equal(missionChoices.children[stageIndex].querySelector('strong').textContent,i18n.t(MISSION_STAGES[stageIndex].title))}
  const expectedRegion=MISSION_STAGES[stageIndex].region;
  await flushFrames();const visibleCards=stages.children.filter(button=>!button.hidden);
  assert.equal(visibleCards.length,1);assert.equal(visibleCards[0].dataset.region,expectedRegion);assert(visibleCards[0].disabled);
  assert.equal(visibleCards[0].querySelector('img').alt,i18n.t('sceneAlt',{name:i18n.t(`region.${expectedRegion}`)}));
  assert.equal(visibleCards[0].querySelector('img').hidden,false,'actual region preview is prepared');
  assert.match(dialog.querySelector('.selection-summary').textContent,new RegExp(i18n.t(`region.${expectedRegion}`)));
  const previousFree=controller.selection.selected.region;$('selectorFree').click();regionButton('offshore').click();$('selectorMission').click();assert.equal(stages.children.find(button=>!button.hidden).dataset.region,expectedRegion);$('selectorFree').click();assert.equal(regionButton('offshore').getAttribute('aria-pressed'),'true');$('selectorMission').click();
  cancel.click();await flushFrames();assert.equal(unpausedSnapshot(),JSON.stringify({...JSON.parse(before),state:{...JSON.parse(before).state,paused:false}}));assert.equal(currentPersistence(),saved);
  controller.startPrecision();missionChoices.children[stageIndex].click();vehicleButton('cine95').click();form.requestSubmit();await flushFrames();
  assert.equal(controller.mission.stageIndex,stageIndex);assert.equal(controller.mission.index,0);assert.equal(state.aircraft,'cine95');assert.equal(state.region,REGIONS.findIndex(region=>region.id===MISSION_STAGES[stageIndex].region));assert.equal(state.paused,false);
  assert.deepEqual([state.x,state.y,state.z],[...MISSION_STAGES[stageIndex].objectives[0].checkpoint]);
 }
 function completeStage(){
  while(!controller.mission.done)finishObjective(controller.mission,state)
  controller.precision.render(true);assert.equal(state.paused,true);assert.equal($('missionCompletion').open,true);assert.equal(keys.size,0);assert.deepEqual(axes,{pitch:0,roll:0,throttle:0,yaw:0});
 }
 completeStage();const completePosition=[state.x,state.y,state.z];controller.toggle();assert.equal(state.paused,true);assert.deepEqual([state.x,state.y,state.z],completePosition);
 const completion=$('missionCompletion'),completedSnapshot=liveSnapshot();
 for(const deliverBeforeRender of [false,true,false,true]){
  completion.close();completion.close();if(deliverBeforeRender)await flushFrames();
  keys.add('KeyW');axes.throttle=1;controller.precision.render(true);await flushFrames();
  assert(completion.open);assert(!completion.hidden);assert.equal(document.activeElement,$('nextMissionStage'));assert.equal(keys.size,0);assert.equal(axes.throttle,0);
  completion.fire('close');controller.toggle();controller.precision.render(true);
  assert(completion.open);assert.equal(liveSnapshot(),completedSnapshot,'external completion close preserves real controller and paused mission state');
  for(let repeat=0;repeat<3;repeat++){completion.escape();assert(completion.open);assert.equal(liveSnapshot(),completedSnapshot)}
 }
 $('nextMissionStage').click();await flushFrames();assert.equal(controller.mission.stageIndex,1);assert.equal(controller.mission.done,false);assert.equal(state.paused,false);assert.equal(state.aircraft,'cine95');
 completeStage();$('replayMissionStage').click();await flushFrames();assert.equal(controller.mission.stageIndex,1);assert.equal(controller.mission.index,0);assert.equal(state.paused,false);
 completeStage();$('nextMissionStage').click();await flushFrames();assert.equal(controller.mission.stageIndex,2);assert.equal(state.paused,false);
 for(const stageIndex of [3,4,5,6]){completeStage();assert.equal($('nextMissionStage').hidden,false);$('nextMissionStage').click();await flushFrames();assert.equal(controller.mission.stageIndex,stageIndex);assert.equal(controller.selection.selected.region,MISSION_STAGES[stageIndex].region);assert.equal(state.region,REGIONS.findIndex(region=>region.id===MISSION_STAGES[stageIndex].region));}
 completeStage();assert.equal($('nextMissionStage').hidden,true);assert.equal($('missionCompletionSubtitle').textContent,i18n.t('allStagesComplete',{stage:7,title:i18n.t(MISSION_STAGES[6].title)}));
 const finalPosition=[state.x,state.y,state.z];$('leaveMissionCompletion').click();await flushFrames();assert.equal(controller.mission.active,false);assert.equal(state.paused,false);assert.equal(state.practiceEnabled,true);assert.deepEqual([state.x,state.y,state.z],finalPosition);assert.equal($('missionCompletion').open,false);
 console.log('PASS: stage choices cancel atomically, EN/JA pending stage survives, explicit Next/Replay/final Free Flight launch safely with selected aircraft and no completion teleport');
 console.log('Unified flight setup checks passed (actual Node DOM/controller contracts; browser/mobile layout QA remains separate)');
} finally {
 i18n.setLanguage(originalLanguage);
 for(const [name,descriptor] of originalGlobals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}
}
