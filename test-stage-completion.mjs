import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FlightState} from './dist/flight.mjs';
import {setupPrecision} from './dist/precision-ui.mjs';
import {MISSION_STAGES,objectiveFeedback} from './dist/precision-missions.mjs';
import {i18n} from './dist/i18n.mjs';

// Real mission/UI contracts with a small DOM model. Native browser geometry,
// top-layer focus trapping and rendered pixels still require browser validation.
const closeEvents=[];
function flushCloseEvents(){for(const dispatch of closeEvents.splice(0))dispatch()}
class Element {
 constructor(tag,document){this.tagName=tag.toUpperCase();this.document=document;this.children=[];this.parentNode=null;this.attrs={};this.style={};this.hidden=false;this.open=false;this.focusCount=0;this.classList={toggle(){}}}
 set id(value){this.attrs.id=value}get id(){return this.attrs.id}
 setAttribute(key,value){this.attrs[key]=String(value);if(key==='hidden')this.hidden=true}
 getAttribute(key){return this.attrs[key]??null}removeAttribute(key){delete this.attrs[key]}
 append(...children){for(const child of children){child.parentNode=this;this.children.push(child)}}
 prepend(...children){for(const child of children)child.parentNode=this;this.children.unshift(...children)}
 get isConnected(){return this===this.document.body||!!this.parentNode?.isConnected}
 matches(selector){return selector==='[hidden]'?this.hidden:selector.startsWith('#')?this.id===selector.slice(1):this.tagName===selector.toUpperCase()}
 closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)}
 contains(node){return this===node||this.children.some(child=>child.contains(node))}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)])}
 querySelector(selector){return this.querySelectorAll(selector)[0]}
 focus(){this.focusCount++;this.document.activeElement=this}
 blur(){if(this.document.activeElement===this)this.document.activeElement=this.document.body}
 showModal(){assert.equal(this.open,false);this.open=true;this.showCount=(this.showCount||0)+1;this.setAttribute('open','');this.previousFocus=this.document.activeElement;this.querySelectorAll('button').find(button=>!button.hidden)?.focus()}
 close(){if(!this.open)return;const focused=this.contains(this.document.activeElement);this.open=false;this.removeAttribute('open');if(focused)this.previousFocus?.focus();closeEvents.push(()=>this.fire('close',{bubbles:false}))}
 dispatch(event){event.target??=this;this[`on${event.type}`]?.(event);if(event.bubbles&&!event.stopped)this.parentNode?.dispatch(event);return event}
 fire(type,values={}){return this.dispatch({type,bubbles:true,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},...values})}
 click(){return this.fire('click',{detail:0})}
 set innerHTML(markup){
  this.children=[];const stack=[this];
  for(const token of markup.match(/<[^>]+>|[^<]+/g)||[]){
   if(token.startsWith('</')){stack.pop();continue}
   if(!token.startsWith('<')){stack.at(-1).textContent=(stack.at(-1).textContent||'')+token;continue}
   const tag=token.match(/^<([\w-]+)/)[1],node=new Element(tag,this.document);
   for(const match of token.slice(tag.length+1,-1).matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(match[1],match[2]??'');
   stack.at(-1).append(node);if(!['br','hr','input','img'].includes(tag))stack.push(node);
  }
  assert.equal(stack.length,1);
 }
}
const oldDocument=globalThis.document,language=i18n.language;
const document={createElement(tag){return new Element(tag,this)},getElementById(id){return this.body.querySelector(`#${id}`)}};
document.body=document.createElement('body');document.activeElement=document.body;globalThis.document=document;
const $=id=>document.getElementById(id);
for(const [tag,id] of [['aside','helpPanel'],['button','pause']]){const node=document.createElement(tag);node.id=id;document.body.append(node)}
let ui,clears=0,flightKeys=0;const actions=[],state=new FlightState(),scene={add(marker){this.marker=marker}};
document.body.onkeydown=()=>flightKeys++;
function clearInputs(){clears++}
try {
 i18n.setLanguage('en');
 ui=setupPrecision({scene,state,start:()=>actions.push('setup'),leave:()=>actions.push('setup-free'),retry:()=>{actions.push('retry');ui.mission.retry(state);ui.render()},
  next:()=>{actions.push('next');ui.mission.next(state);ui.render()},replay:()=>{actions.push('replay');ui.mission.start(state,ui.mission.stageIndex);ui.render()},
  completionLeave:()=>{actions.push('free');ui.mission.leave();ui.render()},clearInputs});
 const dialog=$('missionCompletion'),next=$('nextMissionStage'),replay=$('replayMissionStage'),free=$('leaveMissionCompletion');
 ui.render();assert(dialog.hidden);assert(!dialog.open);assert.equal(clears,0);
 assert.equal(dialog.tagName,'DIALOG');assert.equal(dialog.getAttribute('aria-modal'),'true');assert.equal(dialog.getAttribute('aria-labelledby'),'missionCongratulations');
 assert.equal($('missionCongratulations').textContent,'CONGRATULATIONS!');
 function finishStage(){
  state.paused=false;
  while(ui.mission.objective){
   const objective=ui.mission.objective;[state.x,state.y,state.z]=objective.target;state.vx=state.vy=state.vz=0;
   for(let tick=0;tick<30&&ui.mission.objective===objective;tick++)ui.mission.update(state,.05);
   assert.notEqual(ui.mission.objective,objective,'each objective can be held to completion');
  }
  assert(ui.mission.done);assert(state.paused);$('pause').focus();ui.render();
  assert(dialog.open);assert.equal(dialog.hidden,false);assert.equal(scene.marker.visible,false);
 }
 ui.mission.start(state);
 for(let stage=0;stage<MISSION_STAGES.length;stage++){
  assert.equal(ui.mission.stageIndex,stage);ui.render();assert(dialog.hidden);
  assert.equal($('dispatchCount').textContent,i18n.t('missionStageProgress',{stage:stage+1,current:1,total:ui.mission.objectives.length}));
  ui.mission.hold=ui.mission.holdSeconds/2;ui.render();assert.equal($('dispatchProgress').getAttribute('aria-valuenow'),'50');
  const objective=ui.mission.objective,feedback=objectiveFeedback(state,objective),corners=scene.marker.children[1];
  assert.equal(corners.scale.x,feedback.radius/4);assert.equal(corners.children[0].position.z,(feedback.minAltitude+feedback.maxAltitude)/2);assert.equal(corners.children[0].scale.z,(feedback.maxAltitude-feedback.minAltitude)/1.1);
  finishStage();
  assert.equal(next.hidden,stage===MISSION_STAGES.length-1);assert.equal(document.activeElement,stage===MISSION_STAGES.length-1?replay:next);
  const snapshot=JSON.stringify({state,mission:ui.mission}),calls=actions.length,opened=dialog.showCount,cleared=clears;
  replay.focus();const focused=replay.focusCount;
  for(let frame=0;frame<30;frame++)ui.render();
  assert.equal(dialog.showCount,opened,'animation renders do not reopen modal');assert.equal(replay.focusCount,focused,'animation renders preserve chosen focus');assert.equal(document.activeElement,replay);assert.equal(clears,cleared);assert.equal(actions.length,calls);assert.equal(JSON.stringify({state,mission:ui.mission}),snapshot);
  for(const code of ['KeyW','KeyS','KeyR','KeyP','KeyC','ArrowUp','Space','Enter','Escape'])for(const type of ['keydown','keyup']){
   const event=replay.fire(type,{code,key:code});assert(event.stopped,`${type} ${code} cannot reach flight`);assert.equal(event.defaultPrevented,false,'native button behavior survives');
  }
  assert.equal(flightKeys,0);assert.equal(actions.length,calls);
  const cancelled=dialog.fire('cancel');assert(cancelled.defaultPrevented);assert(cancelled.stopped);assert(dialog.open);assert.equal(actions.length,calls);
  for(const closeBeforeRender of [true,false,true,false]){
   dialog.close();dialog.close();assert(!dialog.open);assert(state.paused);assert.equal(actions.length,calls);
   if(closeBeforeRender)flushCloseEvents();
   ui.render();assert(dialog.open);assert(!dialog.hidden);assert.equal(document.activeElement,stage===MISSION_STAGES.length-1?replay:next);
   const reopened=dialog.showCount,recoveredClears=clears;
   flushCloseEvents();dialog.fire('close',{bubbles:false});ui.render();
   assert(dialog.open);assert(!dialog.hidden);assert.equal(dialog.showCount,reopened,'stale close events cannot invalidate a reopened modal');assert.equal(clears,recoveredClears);
   for(let repeat=0;repeat<3;repeat++){const cancel=dialog.fire('cancel');assert(cancel.defaultPrevented);ui.render()}
   assert.equal(dialog.showCount,reopened);assert.equal(JSON.stringify({state,mission:ui.mission}),snapshot,'native dismissal never resumes, restarts or advances');assert.equal(actions.length,calls);
  }
  replay.focus();
  dialog.click();assert.equal(actions.length,calls,'backdrop/surface click never advances');
  for(const locale of ['ja','en']){
   i18n.setLanguage(locale);ui.render();assert.equal(JSON.stringify({state,mission:ui.mission}),snapshot);
   assert.equal($('missionCompletionSubtitle').textContent,i18n.t(stage===MISSION_STAGES.length-1?'allStagesComplete':'stageComplete',{stage:stage+1,title:i18n.t(ui.mission.stage.title)}));
   assert.equal(next.textContent,i18n.t('nextStage'));assert.equal(replay.textContent,i18n.t('replayMission'));assert.equal(free.textContent,i18n.t('modeFree'));assert.equal(document.activeElement,replay);
  }
  if(stage<MISSION_STAGES.length-1){next.click();assert.equal(actions.at(-1),'next');assert.equal(ui.mission.stageIndex,stage+1);assert(dialog.hidden);assert(!dialog.open);assert.equal(document.activeElement,$('pause'));const count=actions.length;next.click();flushCloseEvents();ui.render();assert(dialog.hidden);assert(!dialog.open);assert.equal(actions.length,count,'double click and queued close do not advance again')}
 }
 const finalCalls=actions.length;next.click();assert.equal(actions.length,finalCalls);assert(dialog.open,'hidden final-stage Next is a no-op');
 replay.click();assert.equal(actions.at(-1),'replay');assert.equal(ui.mission.stageIndex,MISSION_STAGES.length-1);assert.equal(ui.mission.index,0);assert(!ui.mission.done);assert(dialog.hidden);assert.equal(document.activeElement,$('pause'));
 const replayCalls=actions.length;replay.click();flushCloseEvents();ui.render();assert.equal(actions.length,replayCalls);assert(dialog.hidden);assert(!dialog.open);
 finishStage();$('retryDispatch').click();assert.equal(actions.at(-1),'retry');assert(dialog.hidden);assert(!dialog.open);assert.equal(document.activeElement,$('pause'));
 finishStage();free.click();assert.equal(actions.at(-1),'free');assert(!ui.mission.active);assert(dialog.hidden);assert(!dialog.open);assert.equal(document.activeElement,$('pause'));
 const freeCalls=actions.length;free.click();flushCloseEvents();ui.render();assert.equal(actions.length,freeCalls);assert(dialog.hidden);assert(!dialog.open);
 ui.mission.start(state);finishStage();ui.mission.leave();ui.render();assert(dialog.hidden);assert(!dialog.open);assert.equal(document.activeElement,$('pause'));
 const css=readFileSync(new URL('./dist/style.css',import.meta.url),'utf8');
 assert.match(css,/#missionCompletion::backdrop/);assert.match(css,/#missionCongratulations\{font-size:clamp\(24px,6\.4vw,100px\)/);assert.match(css,/#nextMissionStage\[hidden\]\{display:none\}/);
 console.log('PASS: three-stage congratulations dialog, localized progress, final-stage actions, real completion pause, explicit callbacks, no repeated focus/input clearing, key isolation, replay/retry/free lifecycle, per-objective marker bounds');
} finally {i18n.setLanguage(language);if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument}
