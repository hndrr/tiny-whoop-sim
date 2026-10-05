import assert from 'node:assert/strict';
import {createFlightSelector,loadSelection} from './dist/flight-selector.mjs';
import {FlightState} from './dist/flight.mjs';
import {getFlightProfile,profileMetrics} from './dist/flight-profiles.mjs';
import {VEHICLES,getVehicle} from './dist/vehicle-catalog.mjs';
import {REGIONS} from './dist/world.mjs';

// Dependency-free DOM contract harness. These tests invoke the real selector's
// installed callbacks, models and FlightState; they do not replace browser QA.
// Escape models the user-agent cancel -> close sequence rather than pretending
// a synthetic keydown alone invokes a browser's native dialog default action.
class DOMEvent {
 constructor(type,values={}){Object.assign(this,{type,cancelable:false,bubbles:false,defaultPrevented:false,stopped:false},values)}
 preventDefault(){if(this.cancelable)this.defaultPrevented=true}
 stopPropagation(){this.stopped=true}
}
class Events {
 constructor(){this.listeners=new Map()}
 addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener)}
 dispatchEvent(event){
  event.target??=this;event.currentTarget=this;
  this[`on${event.type}`]?.(event);
  for(const listener of this.listeners.get(event.type)||[])listener.call(this,event);
  if(event.bubbles&&!event.stopped)this.parentNode?.dispatchEvent(event);
  return !event.defaultPrevented;
 }
 fire(type,values={}){const event=new DOMEvent(type,values);this.dispatchEvent(event);return event}
}
class TextNode {
 constructor(text){this.nodeType=3;this.textContent=text;this.parentNode=null}
}
class Element extends Events {
 constructor(tag,ownerDocument){
  super();this.tagName=tag.toLowerCase();this.nodeType=1;this.ownerDocument=ownerDocument;this.parentNode=null;
  this.childNodes=[];this.attributes=new Map();this.dataset={};this.open=false;this.hidden=false;this.captured=new Set();
  this.style={setProperty:(name,value)=>{this.style[name]=value}};
  this.context={draws:0,clears:0,drawImage(){this.draws++},clearRect(){this.clears++},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};
 }
 get children(){return this.childNodes.filter(node=>node.nodeType===1)}
 get id(){return this.getAttribute('id')||''}
 set id(value){this.setAttribute('id',value)}
 get className(){return this.getAttribute('class')||''}
 set className(value){this.setAttribute('class',value)}
 get textContent(){return this.childNodes.map(node=>node.textContent).join('')}
 set textContent(value){this.replaceChildren(new TextNode(String(value)))}
 get isConnected(){return this===this.ownerDocument.body||Boolean(this.parentNode?.isConnected)}
 setAttribute(name,value){this.attributes.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5)]=String(value);if(name==='hidden')this.hidden=true;if(name==='width'||name==='height')this[name]=Number(value)}
 getAttribute(name){return this.attributes.get(name)??null}
 append(...nodes){for(const node of nodes){node.parentNode=this;this.childNodes.push(node)}}
 replaceChildren(...nodes){for(const node of this.childNodes)node.parentNode=null;this.childNodes=[];this.append(...nodes)}
 matches(selector){
  if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));
  if(selector.startsWith('#'))return this.id===selector.slice(1);
  const attribute=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if(attribute)return attribute[1]==='hidden'?this.hidden:attribute[2]===undefined?this.attributes.has(attribute[1]):this.getAttribute(attribute[1])===attribute[2];
  return this.tagName===selector;
 }
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)])}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)||null}
 focus(){this.ownerDocument.activeElement=this}
 click(){return this.fire('click',{cancelable:true,bubbles:true})}
 getContext(type){assert.equal(type,'2d');return this.context}
 setPointerCapture(id){this.captured.add(id)}
 hasPointerCapture(id){return this.captured.has(id)}
 releasePointerCapture(id){this.captured.delete(id);this.fire('lostpointercapture',{pointerId:id})}
 showModal(){assert.equal(this.open,false);this.previousFocus=this.ownerDocument.activeElement;this.open=true}
 close(){
  if(!this.open)return;this.open=false;
  // Native modal dismissal restores focus before dispatching queued close.
  if(this.ownerDocument.activeElement.closest('dialog')===this)this.previousFocus?.focus();
  queueMicrotask(()=>this.fire('close'));
 }
 escape(){
  assert.equal(this.open,true);
  this.fire('keydown',{code:'Escape',key:'Escape',cancelable:true,bubbles:true});
  if(this.fire('cancel',{cancelable:true}).defaultPrevented===false)this.close();
 }
 requestSubmit(){assert.equal(this.tagName,'form');return this.fire('submit',{cancelable:true,bubbles:true})}
 set innerHTML(markup){
  this.replaceChildren();const stack=[this];
  for(const token of markup.match(/<[^>]+>|[^<]+/g)||[]){
   if(token.startsWith('</')){assert.ok(stack.length>1,'balanced template');stack.pop();continue}
   if(!token.startsWith('<')){stack.at(-1).append(new TextNode(token));continue}
   const tag=token.match(/^<([\w-]+)/)?.[1];assert.ok(tag,'supported template tag');
   const element=new Element(tag,this.ownerDocument),attributes=token.slice(tag.length+1,-1);
   for(const match of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g))element.setAttribute(match[1],match[2]??'');
   stack.at(-1).append(element);
   if(!['img','input','br','hr','meta','link'].includes(tag))stack.push(element);
  }
  assert.equal(stack.length,1,'balanced template');
 }
}
class Document extends Events {
 constructor(){super();this.hidden=false;this.body=new Element('body',this);this.activeElement=this.body}
 createElement(tag){return new Element(tag,this)}
 getElementById(id){return this.body.querySelector(`#${id}`)}
}

const ids=['whoop75','micro65','scout85','racer90','cine95'];
assert.deepEqual(VEHICLES.map(vehicle=>vehicle.id),ids,'every aircraft has an actual selector option');
const globalNames=['document','localStorage','addEventListener','requestAnimationFrame','cancelAnimationFrame','matchMedia'];
const originalGlobals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const document=new Document(),windowEvents=new Events(),frames=new Map(),stored=new Map();
let frameId=0,writes=0;const motionPreference=new Events();motionPreference.matches=true;
Object.assign(globalThis,{
 document,matchMedia:()=>motionPreference,addEventListener:windowEvents.addEventListener.bind(windowEvents),
 localStorage:{getItem:key=>stored.get(key)??null,setItem(key,value){writes++;stored.set(key,String(value))}},
 requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId},
 cancelAnimationFrame:id=>frames.delete(id),
});
async function flushFrames(){
 for(let turn=0;turn<40;turn++){
  await Promise.resolve();
  if(!frames.size){await Promise.resolve();if(!frames.size)return}
  const batch=[...frames.values()];frames.clear();for(const callback of batch)callback(turn*16);
 }
 assert.fail('selector scheduled an unexpected permanent animation loop');
}

try {
 const opener=document.createElement('button');opener.id='help';document.body.append(opener);opener.focus();
 const state=new FlightState();Object.assign(state,{x:12,y:17,z:30,elapsed:9,gate:2});
 let selected={vehicle:'whoop75',region:'airfield'},openCalls=0,closeCalls=0,applies=[];
 const baselinePosition=[state.x,state.y,state.z,state.elapsed,state.gate];
 const targets=new Set(),captures=[],renderer={target:null,fail:true,allocated:0,disposed:0,
  getRenderTarget(){return this.target},
  setRenderTarget(target){this.target=target;if(target&&!targets.has(target)){targets.add(target);this.allocated++;target.addEventListener('dispose',()=>this.disposed++)}},
  render(scene,camera){this.scene=scene;this.camera=camera;if(this.fail)throw Error('simulated preview renderer unavailable')},
  readRenderTargetPixels(_target,_x,_y,_w,_h,pixels){pixels.fill(0)},
 };
 const selector=createFlightSelector({renderer,
  captureStage(index){captures.push(index);return {toDataURL:()=>`data:image/png;test,region-${index}`}},
  getSelection:()=>selected,
  onOpen(){openCalls++;state.paused=true},
  onApply(next,changes){
   applies.push({next:{...next},changes:{...changes}});
   if(changes.vehicleChanged)state.setAircraft(next.vehicle);
   if(changes.areaChanged)state.relocate(REGIONS.findIndex(region=>region.id===next.region));
   selected={...next};
  },
  onClose(){closeCalls++;state.paused=true},
 });
 const dialog=selector.element,form=dialog.querySelector('form'),canvas=dialog.querySelector('.aircraft-preview');
 const options=dialog.querySelector('.vehicle-options'),stages=dialog.querySelector('.stage-grid');
 const vehicleButton=id=>options.children.find(button=>button.dataset.vehicle===id);
 const regionButton=id=>stages.children.find(button=>button.dataset.region===id);
 const cancelButtons=dialog.querySelectorAll('[data-action="cancel"]');
 const pressed=(container,key)=>container.children.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset[key]);
 function assertPending(vehicle,region=selected.region){
  assert.deepEqual(pressed(options,'vehicle'),[vehicle]);assert.deepEqual(pressed(stages,'region'),[region]);
  assert.equal(dialog.querySelector('.selection-summary').textContent,`FREE FLIGHT / ${getVehicle(vehicle).name} / ${REGIONS.find(item=>item.id===region).label}`);
  assert.match(canvas.getAttribute('aria-label'),new RegExp(getVehicle(vehicle).name));
 }
 function assertLive(expected,applyCount=applies.length,writeCount=writes){
  assert.deepEqual(selected,expected);assert.equal(state.aircraft,expected.vehicle);
  assert.equal(state.profile,getFlightProfile(expected.vehicle));assert.equal(applies.length,applyCount);assert.equal(writes,writeCount);
 }
 async function closeWith(action){const beforeClose=closeCalls;action();await flushFrames();assert.equal(closeCalls,beforeClose+1,'one close callback per dismissal');assert.equal(selector.isOpen,false);assert.equal(renderer.target,null);assert.equal(renderer.allocated,renderer.disposed);assert.ok(document.activeElement===opener,'dismissal restores opener focus')}

 assert.equal(selector.isOpen,false);assert.equal(cancelButtons.length,2);
 assert.equal(stages.children.length,REGIONS.length);assert.equal(options.children.length,5);
 for(const id of ids){
  const option=vehicleButton(id);assert.ok(option,id);
  assert.equal(option.querySelector('.vehicle-trait').textContent,getFlightProfile(id).description);
  assert.equal(option.querySelector('.vehicle-metrics').textContent,profileMetrics(id));
  assert.match(option.querySelector('.vehicle-metrics').textContent,/Acceleration \d+ · Turn \d+ · Top speed \d+/);
 }
 assert.equal(new Set(ids.map(profileMetrics)).size,5,'all five profiles display distinct metric combinations');
 assert.match(dialog.querySelector('.physics-note').textContent,/WHOOP 75 = 100/);
 assert.match(dialog.querySelector('.physics-note').textContent,/not real-world specifications/);
 console.log('PASS: actual selector creates all five aircraft with descriptions, distinct ratings and arcade/baseline disclosure');

 selector.open();assert.equal(selector.isOpen,true);assert.equal(openCalls,1);assertPending('whoop75');
 assert.ok(document.activeElement===document.getElementById('selectorFree'),'opening focuses mode without scrolling');assertLive({vehicle:'whoop75',region:'airfield'},0,0);
 selector.open();assert.equal(openCalls,1,'repeated open is idempotent');
 await flushFrames();
 assert.equal(dialog.querySelector('.preview-status').hidden,false,'preview failure leaves selection usable');
 assert.match(dialog.querySelector('.preview-status').textContent,/unavailable/);
 assert.deepEqual(captures,REGIONS.map((_region,index)=>index),'all actual stage callbacks were reached');
 assert.equal(renderer.target,null);assert.equal(renderer.allocated,renderer.disposed);
 for(const id of ids){vehicleButton(id).click();assertPending(id);assertLive({vehicle:'whoop75',region:'airfield'},0,0)}
 regionButton('harbor').click();assertPending('cine95','harbor');assertLive({vehicle:'whoop75',region:'airfield'},0,0);
 await closeWith(()=>cancelButtons[1].click());assert.equal(closeCalls,1);
 assert.deepEqual([state.x,state.y,state.z,state.elapsed,state.gate],baselinePosition);
 assert.equal(writes,0,'cancel does not persist a pending choice');
 selector.close();await flushFrames();assert.equal(closeCalls,1,'closing an already closed selector is harmless');
 console.log('PASS: real option callbacks change pending UI only; cancel discards pending aircraft/area without changing live physics or persistence');

 // Each aircraft must survive apply/reopen, and reject both button cancellation
 // and the modeled native Escape close flow for subsequent pending changes.
 renderer.fail=false;
 for(const [index,id] of ids.entries()){
  const before={...selected},beforeApplies=applies.length,beforeWrites=writes;
  selector.open();assertPending(before.vehicle);vehicleButton(id).click();assertPending(id);
  assertLive(before,beforeApplies,beforeWrites);
  await flushFrames();assert.equal(dialog.querySelector('.preview-status').hidden,true);
  const submission=form.requestSubmit();assert.equal(submission.defaultPrevented,true,'selector owns the submit commit');
  await flushFrames();assert.equal(selector.isOpen,false);
  assert.deepEqual(applies.at(-1),{next:{vehicle:id,region:'airfield'},changes:{areaChanged:false,vehicleChanged:id!==before.vehicle,mode:'free'}});
  assertLive({vehicle:id,region:'airfield'},beforeApplies+1,beforeWrites+1);
  assert.deepEqual(loadSelection(),selected,'submit persists the applied aircraft');
  assert.deepEqual([state.x,state.y,state.z,state.elapsed,state.gate],baselinePosition,'aircraft-only apply preserves flight progress');
  const alternative=ids[(index+1)%ids.length],applied={...selected},savedBefore=JSON.stringify([...stored]);
  for(const dismiss of [()=>cancelButtons[0].click(),()=>dialog.escape()]){
   selector.open();assertPending(id);vehicleButton(alternative).click();regionButton('offshore').click();assertPending(alternative,'offshore');
   assertLive(applied,beforeApplies+1,beforeWrites+1);
   await closeWith(dismiss);assertLive(applied,beforeApplies+1,beforeWrites+1);
   assert.equal(JSON.stringify([...stored]),savedBefore,'dismissal leaves durable selection untouched');
   selector.open();assertPending(id,'airfield');await closeWith(()=>selector.close());
  }
 }
 assert.equal(captures.length,REGIONS.length,'reopening reuses completed stage previews');
 console.log('PASS: all five aircraft apply via real form submit, persist, restore on reopen, and discard Cancel/Escape edits with no live-profile mutation');

 selector.open();vehicleButton('racer90').click();regionButton('harbor').click();form.requestSubmit();await flushFrames();
 assert.deepEqual(applies.at(-1),{next:{vehicle:'racer90',region:'harbor'},changes:{areaChanged:true,vehicleChanged:true,mode:'free'}});
 assert.equal(state.region,REGIONS.findIndex(region=>region.id==='harbor'));assert.deepEqual(loadSelection(),selected);
 selector.open();assertPending('racer90','harbor');form.requestSubmit();await flushFrames();
 assert.deepEqual(applies.at(-1).changes,{areaChanged:false,vehicleChanged:false,mode:'free'},'unchanged apply compares with latest committed selection');

 const applied={...selected},appliedCount=applies.length,writeCount=writes;
 for(let repeat=0;repeat<12;repeat++){
  selector.open();selector.open();assertPending(applied.vehicle,applied.region);
  vehicleButton(ids[repeat%ids.length]).click();
  canvas.fire('pointerdown',{cancelable:true,pointerId:repeat+1,clientX:20,clientY:30});
  assert.equal(canvas.hasPointerCapture(repeat+1),true);
  await closeWith(repeat%2?()=>dialog.escape():()=>cancelButtons[1].click());
  assert.equal(canvas.captured.size,0,'close releases preview drag capture');
  canvas.fire('pointermove',{pointerId:repeat+1,clientX:80,clientY:90});
  assertLive(applied,appliedCount,writeCount);assert.equal(frames.size,0,'closed selector has no persistent render loop');
 }
 // Real dialog close events are queued: a rapid reopen can happen before the
 // previous close listener runs. The old listener must not close the new modal.
 selector.open();vehicleButton('micro65').click();selector.close();selector.open();
 await flushFrames();assert.equal(selector.isOpen,true);assertPending(applied.vehicle,applied.region);
 assertLive(applied,appliedCount,writeCount);await closeWith(()=>selector.close());
 assert.equal(renderer.allocated,renderer.disposed);assert.equal(renderer.target,null);
 assert.ok(canvas.context.draws>0,'successful render callback copied a preview to the inspector');
 assert.ok(canvas.context.clears>0,'failed preview callback exercised fallback');
 console.log('PASS: area commits, unchanged apply, repeated/rapid open-close, drag cleanup, preview fallback/recovery and render-target disposal');
 // Animated mode uses the same actual models and callbacks with a deterministic RAF clock.
 motionPreference.matches=false;
 let now=1000;
 async function tick(ms=40){now+=ms;await Promise.resolve();const batch=[...frames.values()];frames.clear();for(const callback of batch)callback(now);await Promise.resolve()}
 const position=()=>renderer.camera.position.toArray();
 for(const id of ids){
  selector.open();vehicleButton(id).click();await tick();
  const group=renderer.scene.children.find(child=>child.name===id),props=group.children.filter(child=>child.type==='Group');
  assert.equal(props.length,4);const angle=props[0].rotation.z,start=position(),allocated=renderer.allocated;
  await tick();assert.notEqual(props[0].rotation.z,angle);assert.notDeepEqual(position(),start);
  assert.equal(renderer.allocated,allocated,'frames reuse one target');
  const backdrop=renderer.scene.children.find(child=>child.name==='inspector-backdrop');assert.equal(backdrop.children.length,2,'real gradient and contact shadow are rendered');
  canvas.fire('pointerdown',{cancelable:true,pointerId:100,clientX:20,clientY:20});
  const held=position();await tick();assert.deepEqual(position(),held,'drag pauses turntable');
  canvas.fire('pointermove',{pointerId:100,clientX:45,clientY:35});await tick();assert.notDeepEqual(position(),held);
  canvas.fire('pointerup',{pointerId:100});const released=position();for(let i=0;i<25;i++)await tick();assert.deepEqual(position(),released,'release grace preserves manual view');
  for(let i=0;i<10;i++)await tick();assert.notDeepEqual(position(),released,'turntable resumes from manual view');
  document.hidden=true;document.fire('visibilitychange');assert.equal(frames.size,0,'hidden tab cancels animated RAF');const hiddenAngle=props[0].rotation.z;
  now+=100000;document.hidden=false;document.fire('visibilitychange');await tick();assert.equal(props[0].rotation.z,hiddenAngle,'resume discards hidden time');
  const oldModel=group;vehicleButton(ids[(ids.indexOf(id)+1)%ids.length]).click();await tick();assert.ok(!renderer.scene.children.includes(oldModel));
  selector.close();await Promise.resolve();assert.equal(frames.size,0);assert.equal(renderer.allocated,renderer.disposed,'close releases reusable target');
  assertLive(applied,appliedCount,writeCount);
 }
 selector.open();await tick();motionPreference.matches=true;motionPreference.fire('change');await tick();assert.equal(frames.size,0,'reduced motion renders once without automatic movement');
 const reducedView=position();canvas.fire('keydown',{code:'ArrowRight',cancelable:true});await tick();assert.notDeepEqual(position(),reducedView,'reduced motion retains manual inspection');assert.equal(frames.size,0);
 selector.close();await Promise.resolve();assert.equal(renderer.allocated,renderer.disposed);
 console.log('PASS: all five real previews animate, pause for drag, resume without snapping, reuse targets, stop while hidden/closed, respect reduced motion and never mutate live flight');
 console.log('Selector lifecycle checks passed (Node DOM contract harness; browser/WebGL interaction QA remains separate)');
} finally {
 for(const [name,descriptor] of originalGlobals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}
}
