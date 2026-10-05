import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as world from './dist/world.mjs';
import {GATES} from './dist/flight.mjs';
import {localizeFlight} from './dist/localize-flight.mjs';
import {setupPrecision} from './dist/precision-ui.mjs';
import {FlightState} from './dist/flight.mjs';
import {i18n} from './dist/i18n.mjs';
const nodes=new Map();
// Minimal DOM contract harness: parse the real settings markup and apply real i18n.
// This checks rendered text/accessibility, not WebGL or browser layout.
class Node {
 constructor(){this.style={};this.attrs={};this.children=[];this.classList={toggle(){}};this.blurCount=0}
 set id(v){this._id=v;nodes.set(v,this)}get id(){return this._id}
 set innerHTML(html){this.html=html;this.children=[];for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)){const n=new Node();for(const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g))n.setAttribute(a[1],a[2]);this.children.push(n)}}
 append(...children){this.children.push(...children)}prepend(...children){this.children.unshift(...children)}
 setAttribute(k,v){this.attrs[k]=v;if(k==='id')this.id=v}getAttribute(k){return this.attrs[k]}hasAttribute(k){return Object.hasOwn(this.attrs,k)}
 blur(){this.blurCount++}
}
const body=new Node(),help=new Node();help.id='helpPanel';globalThis.document={body,documentElement:{lang:'en'},createElement:()=>new Node(),getElementById:id=>nodes.get(id),querySelectorAll(selector){const attr=selector.slice(1,-1);return [...nodes.values()].filter(n=>n.hasAttribute(attr))}};
const state=new FlightState(),scene={add(v){this.marker=v}},actions=[];
const ui=setupPrecision({scene,state,start:()=>actions.push('start'),leave:()=>actions.push('leave'),retry:()=>actions.push('retry')});
ui.render();assert(nodes.get('dispatchPanel').hidden);assert(!scene.marker.visible);
nodes.get('precisionFlight').onclick({detail:1});assert.deepEqual(actions,['start']);assert.equal(nodes.get('precisionFlight').blurCount,1);
nodes.get('retryDispatch').onclick({detail:0});assert.equal(nodes.get('retryDispatch').blurCount,0);nodes.get('retryDispatch').onclick({detail:1});assert.equal(nodes.get('retryDispatch').blurCount,1);
ui.mission.start(state);ui.render();assert(!nodes.get('dispatchPanel').hidden);assert(scene.marker.visible);assert.equal(nodes.get('dispatchTitle').textContent,'APPROACH HANGAR');assert.deepEqual(scene.marker.position.toArray(),[-18,30,0]);
assert.equal(nodes.get('dispatchStatus').textContent,'Press ARM / P / Space to fly');
state.paused=false;ui.render();assert.match(nodes.get('dispatchStatus').textContent,/Move/);
[state.x,state.y,state.z]=[-18,30,3];ui.render();assert.match(nodes.get('dispatchStatus').textContent,/Hold here/);assert.equal(nodes.get('dispatchProgress').attrs['aria-valuenow'],'0');
assert(scene.marker.children.every(child=>child.geometry?.type!=='TorusGeometry'));
const snapshot=JSON.stringify({state,mission:ui.mission});i18n.setLanguage('ja');ui.render();assert.equal(nodes.get('dispatchTitle').textContent,'格納庫へ接近');assert.equal(JSON.stringify({state,mission:ui.mission}),snapshot);i18n.setLanguage('en');
ui.mission.done=true;ui.mission.index=4;ui.render();assert(!scene.marker.visible);assert.equal(nodes.get('dispatchTitle').textContent,'MISSION COMPLETE');assert.equal(nodes.get('retryDispatch').textContent,'REPLAY');
ui.mission.leave();ui.render();assert(nodes.get('dispatchPanel').hidden);assert(!scene.marker.visible);
// Execute the application's actual HUD function without creating a WebGL context.
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
const hudSource=main.slice(main.indexOf('function updateHUD(){'),main.indexOf('const aim='));
const $=id=>{if(!nodes.has(id)){const n=new Node();n.id=id}return nodes.get(id)};
const updateHUD=runInNewContext(hudSource+';updateHUD',{
 document,$,s:state,precision:ui,i18n,localizeFlight,fpv:true,GATES,...world,
 flightStarted:false,gates:[],gateIdle:null,gateMint:null,gateDark:null,
});
const unsubscribe=i18n.subscribe(()=>{i18n.apply();updateHUD()});
ui.mission.start(state);state.paused=false;
for(const language of ['ja','en','ja','en']){
 i18n.setLanguage(language);i18n.apply();updateHUD();
 const label=language==='ja'?'ミッション':'PRECISION';
 const description=language==='ja'?'指令に沿って飛ぶ・時間制限なし':'Follow flight instructions · No time limit';
 assert.equal(nodes.get('precisionFlight').textContent,label);
 assert.equal(nodes.get('precisionDescription').textContent,description);
 assert.equal(nodes.get('precisionFlight').attrs['aria-describedby'],'precisionDescription');
 assert(help.children.includes(nodes.get('precisionDescription')),'description is in settings');
 assert.equal(nodes.get('title').textContent,label);
 assert.equal(nodes.get('flightMode').textContent,label);
 const before=JSON.stringify({state,mission:ui.mission});updateHUD();assert.equal(JSON.stringify({state,mission:ui.mission}),before);
 state.crashed=true;updateHUD();assert.equal(nodes.get('title').textContent,'CRASHED');state.crashed=false;
 ui.mission.leave();updateHUD();assert.equal(nodes.get('precisionFlight').attrs['aria-pressed'],'false');
 assert.equal(nodes.get('precisionFlight').textContent,label);assert.equal(nodes.get('precisionDescription').textContent,description);
 ui.mission.start(state);state.paused=false;
}
unsubscribe();
console.log('PASS: actual settings markup, accessible mission explanation, repeated EN/JA switching, main HUD mode label, CRASHED preservation and free-flight exit');
delete globalThis.document;
console.log('PASS: dispatch HUD/marker lifecycle, live translation without state mutation, pointer blur and keyboard focus preservation');
