import assert from 'node:assert/strict';
import {setupPrecision} from './dist/precision-ui.mjs';
import {FlightState} from './dist/flight.mjs';
import {i18n} from './dist/i18n.mjs';
const nodes=new Map();
class Node {constructor(){this.style={};this.attrs={};this.classList={toggle(){}};this.blurCount=0}set id(v){this._id=v;nodes.set(v,this)}get id(){return this._id}set innerHTML(html){this.html=html;for(const match of html.matchAll(/id="([^"]+)"/g)){const n=new Node();n.id=match[1]}}append(){}prepend(){}setAttribute(k,v){this.attrs[k]=v}blur(){this.blurCount++}}
const body=new Node(),help=new Node();help.id='helpPanel';globalThis.document={body,createElement:()=>new Node(),getElementById:id=>nodes.get(id)};
const state=new FlightState(),scene={add(v){this.marker=v}},actions=[];
const ui=setupPrecision({scene,state,start:()=>actions.push('start'),leave:()=>actions.push('leave'),retry:()=>actions.push('retry')});
ui.render();assert(nodes.get('dispatchPanel').hidden);assert(!scene.marker.visible);
nodes.get('precisionFlight').onclick({detail:1});assert.deepEqual(actions,['start']);assert.equal(nodes.get('precisionFlight').blurCount,1);
nodes.get('retryDispatch').onclick({detail:0});assert.equal(nodes.get('retryDispatch').blurCount,0);nodes.get('retryDispatch').onclick({detail:1});assert.equal(nodes.get('retryDispatch').blurCount,1);
ui.mission.start(state);ui.render();assert(!nodes.get('dispatchPanel').hidden);assert(scene.marker.visible);assert.equal(nodes.get('dispatchTitle').textContent,'APPROACH HANGAR');assert.deepEqual(scene.marker.position.toArray(),[-18,30,3]);
const snapshot=JSON.stringify({state,mission:ui.mission});i18n.setLanguage('ja');ui.render();assert.equal(nodes.get('dispatchTitle').textContent,'格納庫へ接近');assert.equal(JSON.stringify({state,mission:ui.mission}),snapshot);i18n.setLanguage('en');
ui.mission.done=true;ui.mission.index=4;ui.render();assert(!scene.marker.visible);assert.equal(nodes.get('dispatchTitle').textContent,'MISSION COMPLETE');assert.equal(nodes.get('retryDispatch').textContent,'REPLAY');
ui.mission.leave();ui.render();assert(nodes.get('dispatchPanel').hidden);assert(!scene.marker.visible);
delete globalThis.document;
console.log('PASS: dispatch HUD/marker lifecycle, live translation without state mutation, pointer blur and keyboard focus preservation');
