import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createMissionSetup} from './dist/mission-setup.mjs';
import {setupFlightSelection} from './dist/selection-integration.mjs';
import {loadSelection,saveSelection} from './dist/flight-selector.mjs';
import {FlightState} from './dist/flight.mjs';
import {PrecisionMission,PRECISION_OBJECTIVES} from './dist/precision-missions.mjs';
import {VEHICLES} from './dist/vehicle-catalog.mjs';
import {i18n} from './dist/i18n.mjs';

// Dependency-free DOM contract harness. Exercise installed UI callbacks and the
// real application controllers/models, without substituting a second launch flow.
// Native Escape is modeled as keydown -> cancel -> queued close. Browser layout,
// native focus trapping, touch targets and WebGL rendering still need browser QA.
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
 constructor(tag,ownerDocument){super();this.tagName=tag.toUpperCase();this.nodeType=1;this.ownerDocument=ownerDocument;this.parentNode=null;this.childNodes=[];this.attributes=new Map();this.dataset={};this.open=false;this.hidden=false;this.style={};this.focusCount=0;this.classList={add(){},remove(){},toggle(){}}}
 get children(){return this.childNodes.filter(node=>node.nodeType===1)}
 get firstChild(){return this.childNodes[0]||null}
 get id(){return this.getAttribute('id')||''}set id(value){this.setAttribute('id',value)}
 get className(){return this.getAttribute('class')||''}set className(value){this.setAttribute('class',value)}
 get textContent(){return this.childNodes.map(node=>node.textContent).join('')}set textContent(value){this.replaceChildren(new TextNode(String(value)))}
 get isConnected(){return this===this.ownerDocument.body||Boolean(this.parentNode?.isConnected)}
 setAttribute(name,value){this.attributes.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5)]=String(value);if(name==='hidden')this.hidden=true;if(name==='value')this.value=String(value)}
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
 click(){return this.fire('click',{cancelable:true,bubbles:true})}
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
 constructor(){super();this.body=new Element('body',this);this.body.parentNode=this;this.activeElement=this.body;this.documentElement={lang:'en'}}
 createElement(tag){return new Element(tag,this)}
 getElementById(id){return this.body.querySelector(`#${id}`)}
 querySelector(selector){return this.body.querySelector(selector)}
 querySelectorAll(selector){return this.body.querySelectorAll(selector)}
}
const globalNames=['document','localStorage','matchMedia'];
const originalGlobals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const originalLanguage=i18n.language;
const document=new Document(),windowEvents=new Events(),stored=new Map();document.parentNode=windowEvents;
let coarse=false,writes=0;
Object.assign(globalThis,{document,matchMedia:()=>({matches:coarse}),localStorage:{getItem:key=>stored.get(key)??null,setItem(key,value){writes++;stored.set(key,String(value))}}});
const flushClose=async()=>{await Promise.resolve();await Promise.resolve()};
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
function sourceBetween(start,end){const from=main.indexOf(start),to=main.indexOf(end,from);assert.ok(from>=0&&to>from,`actual main controller boundaries: ${start}`);return main.slice(from,to)}

try {
 i18n.setLanguage('en');
 for(const id of ['help','helpPanel','precisionFlight','pause','areaSelect','relocate']){const element=document.createElement(id==='areaSelect'?'select':id==='helpPanel'?'section':'button');element.id=id;document.body.append(element)}
 const brand=document.createElement('div');brand.className='brand';brand.textContent='WHOOP 75';document.body.append(brand);
 const areaLabel=document.createElement('label');areaLabel.setAttribute('for','areaSelect');document.body.append(areaLabel);
 const $=id=>document.getElementById(id),state=new FlightState(),keys=new Set(),axes={pitch:0,roll:0,throttle:0,yaw:0};
 let meshVehicle,meshChanges=0,stickClears=0,hudUpdates=0,selectorCallbacks;
 saveSelection({vehicle:'scout85',region:'harbor'});writes=0;
 // Only unrelated rendering/selector construction is stubbed. These are the
 // unchanged main.mjs reset/toggle/help/start/launch/leave functions and the
 // actual createMissionSetup plus setupFlightSelection integration below them.
 const controller=runInNewContext(
  'let flightSelection,precision,flightStarted=false;'+
  sourceBetween('function reset(){','function switchCamera(){')+
  sourceBetween('function help(show){',"$('help').onclick=")+
  sourceBetween("addEventListener('keydown',e=>{","addEventListener('keyup',")+
  sourceBetween('precision=setupPrecision({','const osd=')+
  ';({startPrecision,launchPrecision,leavePrecision,reset,toggle,help,missionSetup,get selection(){return flightSelection},get mission(){return precision.mission},get flightStarted(){return flightStarted}})',
  {document,$,s:state,keys,axes,createMissionSetup,setupFlightSelection:options=>setupFlightSelection({...options,selectorFactory:callbacks=>{selectorCallbacks=callbacks;return {open(){},refreshLanguage(){}}}}),
   setupPrecision:()=>({mission:new PrecisionMission(),render(){}}),clearSticks(){stickClears++;for(const key of Object.keys(axes))axes[key]=0},updateHUD(){hudUpdates++},
   setVehicle(id){meshVehicle=id;meshChanges++},addEventListener:windowEvents.addEventListener.bind(windowEvents),sticks:{render(){}},switchCamera(){},
   renderer:{},scene:{},skyDome:{},sun:{},terrainChunks:[],regionGroups:[],airfieldGroup:{},drone:{},i18n}
 );
 const dialog=$('missionSetup'),form=dialog.querySelector('form'),aircraft=$('missionAircraft'),cancel=$('cancelMission'),start=$('launchMission');
 const liveSnapshot=()=>JSON.stringify({state,mission:controller.mission,selected:controller.selection.selected,meshVehicle,flightStarted:controller.flightStarted});
 const unpausedSnapshot=()=>JSON.stringify({state:{...state,paused:false},mission:controller.mission,selected:controller.selection.selected,meshVehicle,flightStarted:controller.flightStarted});
 const changeAircraft=id=>{aircraft.value=id;aircraft.fire('change',{bubbles:true})};
 const currentPersistence=()=>JSON.stringify([...stored]);
 function seed({paused,active=false,done=false}={paused:true}){
  Object.assign(state,{x:91,y:127,z:34,vx:1.1,vy:-.6,vz:.3,heading:.7,elapsed:23,gate:7,paused,crashed:false,region:1,complete:false,explore:true});
  Object.assign(controller.mission,{active,index:done?4:2,hold:.43,done});
  $('helpPanel').hidden=!paused;keys.add('KeyW');axes.throttle=1;$('precisionFlight').focus();
 }
 assert.equal(controller.missionSetup.isOpen,false,'setup exposes its open state without overwriting open()');
 assert.equal(dialog.getAttribute('aria-labelledby'),'missionSetupTitle');
 assert.equal(aircraft.children.length,VEHICLES.length);assert.deepEqual(aircraft.children.map(option=>option.value),VEHICLES.map(vehicle=>vehicle.id));
 assert.equal(cancel.getAttribute('type'),'button');assert.equal(start.getAttribute('type'),'submit');
 assert.equal(dialog.querySelector('label').getAttribute('for'),'missionAircraft');
 assert.equal(form.querySelectorAll('[type="submit"]').length,1,'one explicit Start commits and launches');
 console.log('PASS: actual mission preparation markup has a named dialog, associated aircraft select and one Start action');

 for(const paused of [true,false])for(const active of [false,true]){
  seed({paused,active});const before=liveSnapshot(),withoutPause=unpausedSnapshot(),saved=currentPersistence(),beforeMeshes=meshChanges,beforeWrites=writes,beforeClears=stickClears;
  controller.startPrecision();assert.equal(dialog.open,true);assert.equal(controller.missionSetup.isOpen,true);assert.equal(state.paused,true);assert.equal(aircraft.value,'scout85');
  assert.equal(unpausedSnapshot(),withoutPause,'preparation pauses without moving/resetting the current flight or mission');
  assert.equal(keys.size,0);assert.equal(axes.throttle,0);assert.equal(stickClears,beforeClears+1);
  controller.startPrecision();assert.equal(stickClears,beforeClears+1,'repeated open must not replace the original paused-state snapshot');
  for(const vehicle of VEHICLES){changeAircraft(vehicle.id);assert.equal(unpausedSnapshot(),withoutPause,'aircraft changes stay pending');assert.equal(meshChanges,beforeMeshes);assert.equal(writes,beforeWrites)}
  cancel.click();await flushClose();assert.equal(dialog.open,false);assert.equal(controller.missionSetup.isOpen,false);assert.equal(liveSnapshot(),before,'Cancel preserves the complete previous flight, mission, aircraft and paused state');assert.equal(currentPersistence(),saved);assert.equal($('helpPanel').hidden,!paused,'Cancel preserves the settings panel visibility');
  assert.equal(document.activeElement.id,paused?'precisionFlight':'pause','Cancel returns focus to a visible mission/flight control');
  const afterCancel=stickClears;cancel.click();controller.missionSetup.cancel();dialog.fire('close');await flushClose();assert.equal(stickClears,afterCancel,'duplicate cancellation/close is idempotent');
  assert.equal(liveSnapshot(),before);
 }
 console.log('PASS: actual main Cancel callback preserves paused/flying and free/active mission states; pending aircraft never changes live geometry, physics or storage');

 for(const paused of [true,false])for(const dismiss of ['escape','close']){
  seed({paused,active:true,done:true});const before=liveSnapshot();controller.startPrecision();changeAircraft('racer90');
  if(dismiss==='escape')assert.equal(dialog.escape().defaultPrevented,true,'Escape delegates cancellation to the reversible setup');else dialog.close();
  await flushClose();assert.equal(liveSnapshot(),before,`${dismiss} restores the original mission and paused state`);assert.equal(dialog.open,false);
 }
 for(let repeat=0;repeat<12;repeat++){
  seed({paused:repeat%2===0,active:true});const before=liveSnapshot();controller.startPrecision();changeAircraft('micro65');cancel.click();
  controller.startPrecision();changeAircraft('cine95');await flushClose();assert.equal(dialog.open,true,'an old queued close must not cancel a newly opened setup');assert.equal(aircraft.value,'cine95');
  dialog.escape();await flushClose();assert.equal(liveSnapshot(),before,'rapid repeated dismissal never loses the original live state');
 }
 console.log('PASS: native Escape, direct close, duplicate events and rapid reopen preserve current progress and discard only pending choices');

 seed({paused:true,active:true});controller.startPrecision();changeAircraft('racer90');const pendingSnapshot=liveSnapshot(),beforeKeys=keys.size;
 for(const code of ['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyP','KeyR','KeyC','Escape']){
  const target=code.startsWith('Arrow')?aircraft:start,event=target.fire('keydown',{code,key:code,cancelable:true,bubbles:true});
  assert.equal(event.stopped,true,`${code} does not reach flight shortcuts`);assert.equal(event.defaultPrevented,false,`${code} remains available to native form controls`);assert.equal(liveSnapshot(),pendingSnapshot);assert.equal(keys.size,beforeKeys);
 }
 for(const mobile of [false,true])for(const language of ['ja','en']){
  coarse=mobile;i18n.setLanguage(language);assert.equal(aircraft.value,'racer90','language changes preserve pending aircraft');assert.equal(liveSnapshot(),pendingSnapshot,'translation cannot apply or restart flight');
  assert.equal($('missionSetupTitle').textContent,i18n.t('missionSetupTitle'));assert.equal(start.textContent,language==='ja'?'この機体で開始':'START FLIGHT');assert.equal(cancel.textContent,language==='ja'?'キャンセル':'CANCEL');
  assert.equal(dialog.querySelector('h3').textContent,i18n.t('approachTitle'));assert.equal(dialog.querySelector('[data-i18n="approachHint"]').textContent,i18n.t('approachHint'));
  assert.equal($('missionAircraftTrait').textContent,i18n.t('vehicle.racer90.trait'));
  assert.equal($('missionInputTip').textContent,i18n.t(mobile?'missionTouchControls':'missionKeyboardControls'));
  assert.equal(dialog.querySelector('[data-i18n="missionStartNote"]').textContent,i18n.t('missionStartNote'));
 }
 cancel.click();await flushClose();coarse=false;
 console.log('PASS: EN/JA objective, aircraft traits, start/cancel labels and desktop/touch guidance update without committing; modal keys do not fly/reset behind native controls');

 for(const {id:vehicle} of VEHICLES){
  seed({paused:true,active:true});const beforeMeshes=meshChanges,beforeVehicle=controller.selection.selected.vehicle,beforeWrites=writes;
  controller.startPrecision();changeAircraft(vehicle);keys.add('KeyW');axes.throttle=1;
  assert.equal(form.requestSubmit().defaultPrevented,true);assert.equal(dialog.open,false);assert.equal(state.paused,false,'one Start begins flying without an extra ARM click');
  assert.equal(controller.flightStarted,true);assert.equal(controller.mission.active,true);assert.equal(controller.mission.index,0);assert.equal(controller.mission.done,false);assert.equal(controller.mission.hold,0);
  assert.deepEqual([state.x,state.y,state.z],[...PRECISION_OBJECTIVES[0].checkpoint]);assert.equal(state.region,0);assert.equal(state.aircraft,vehicle);assert.equal(meshVehicle,vehicle);
  assert.deepEqual(controller.selection.selected,{vehicle,region:'airfield'});assert.deepEqual(loadSelection(),{vehicle,region:'airfield'});assert.equal(writes,beforeWrites+1);
  assert.equal(meshChanges,beforeMeshes+(beforeVehicle===vehicle?0:1),'mesh changes only when the chosen aircraft differs');
  assert.equal(keys.size,0);assert.equal(axes.throttle,0);assert.equal($('helpPanel').hidden,true);assert.equal(document.activeElement.id,'pause');
  const started=liveSnapshot(),writeCount=writes,meshCount=meshChanges;
  form.requestSubmit();start.click();cancel.click();dialog.fire('close');await flushClose();assert.equal(liveSnapshot(),started,'stale submit/close/cancel never restarts or pauses the launched flight');assert.equal(writes,writeCount);assert.equal(meshChanges,meshCount);
  controller.startPrecision();changeAircraft(vehicle==='cine95'?'micro65':'cine95');await flushClose();assert.equal(dialog.open,true);cancel.click();await flushClose();assert.equal(liveSnapshot(),started,'canceling preparation after a launch preserves flightStarted and the running mission');
  const position=[state.x,state.y,state.z];controller.toggle();assert.equal(state.paused,true);controller.toggle();assert.equal(state.paused,false);assert.deepEqual([state.x,state.y,state.z],position,'pause/resume does not teleport');
  controller.mission.index=2;state.x=200;controller.reset();assert.equal(state.paused,true);assert.equal(controller.flightStarted,false);assert.equal(controller.mission.index,2);assert.deepEqual([state.x,state.y,state.z],[...PRECISION_OBJECTIVES[2].checkpoint]);assert.equal(state.aircraft,vehicle);
 }
 console.log('PASS: all five pending aircraft launch once through actual main + selection integration; one Start commits/persists/resets/flies, stale submits are ignored and pause/retry keep their semantics');
 assert.ok(hudUpdates>0);assert.ok(selectorCallbacks,'real selection integration initialized');
 console.log('Mission setup checks passed (Node DOM/controller contracts; browser/mobile layout QA remains separate)');
} finally {
 i18n.setLanguage(originalLanguage);
 for(const [name,descriptor] of originalGlobals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}
}
