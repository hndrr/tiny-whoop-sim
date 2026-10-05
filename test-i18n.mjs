import assert from 'node:assert/strict';
import {CATALOG,createI18n,LANGUAGE_STORAGE_KEY} from './dist/i18n.mjs';
assert.deepEqual(Object.keys(CATALOG.en),Object.keys(CATALOG.ja));
for(const key of Object.keys(CATALOG.en)){
 assert.ok(CATALOG.ja[key].trim(),key);
 assert.deepEqual([...CATALOG.en[key].matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),[...CATALOG.ja[key].matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),`interpolation parity: ${key}`);
}
let saved=null;const writes=[];const storage={getItem:key=>{assert.equal(key,LANGUAGE_STORAGE_KEY);return saved},setItem:(key,value)=>{writes.push([key,value]);saved=value}};
const i=createI18n({storage});assert.equal(i.language,'en');let changes=0;const off=i.subscribe(()=>changes++);
assert.equal(i.setLanguage('ja'),true);assert.equal(changes,1);assert.equal(saved,'ja');assert.equal(createI18n({storage}).language,'ja');
assert.equal(i.t('dispatch',{current:2,total:4}),'ミッション 2 / 4');assert.equal(i.t('not-known'),'not-known');assert.equal(i.t('nextDistance'),'次まで {distance}m');
assert.equal(i.setLanguage('ja'),false);assert.equal(i.setLanguage('fr'),false);assert.equal(changes,1);off();i.setLanguage('en');assert.equal(changes,1);
for(const invalid of [null,'JA','fr','"ja"','{}']){saved=invalid;assert.equal(createI18n({storage}).language,'en')}
const blocked=createI18n({storage:{getItem(){throw Error('denied')},setItem(){throw Error('quota')}}});assert.equal(blocked.language,'en');assert.doesNotThrow(()=>blocked.setLanguage('ja'));assert.equal(blocked.language,'ja');
const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{get(){throw Error('blocked property')},configurable:true});assert.doesNotThrow(()=>createI18n());if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;
const node={textContent:'old',attributes:{'data-i18n':'setup','data-i18n-title':'resetTitle'},getAttribute(k){return this.attributes[k]},setAttribute(k,v){this.attributes[k]=v},hasAttribute(k){return Object.hasOwn(this.attributes,k)},querySelectorAll(){return []}};
i.setLanguage('ja');i.apply(node);assert.equal(node.textContent,'設定');assert.equal(node.attributes.title,'飛行をリセット (R)');
const root={documentElement:{lang:'en'},querySelectorAll:()=>[]};i.apply(root);assert.equal(root.documentElement.lang,'ja');assert.doesNotThrow(()=>i.apply(null));
for(const name of ['FPV','ANGLE','WHOOP 75'])assert.ok(Object.values(CATALOG.ja).some(v=>v.includes(name)));
console.log(`PASS: ${Object.keys(CATALOG.en).length} bilingual strings, interpolation parity, English default, persisted choice, blocked storage, subscriber lifecycle, live text/accessibility labels`);
const {i18n}=await import('./dist/i18n.mjs');
const {localizeFlight}=await import('./dist/localize-flight.mjs');
const {FlightState}=await import('./dist/flight.mjs');
const state=new FlightState(),nodes=new Map();const hud={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)}};
state.elapsed=2;state.paused=true;const before=JSON.stringify(state);i18n.setLanguage('ja');localizeFlight(state,false,hud);
assert.equal(JSON.stringify(state),before,'language rendering must not change flight state');assert.equal(nodes.get('subtitle').textContent,'一時停止中');assert.equal(nodes.get('camera').textContent,'CAM: 追尾');assert.equal(nodes.get('start').innerHTML,'再開 <kbd>P</kbd>');
i18n.setLanguage('en');localizeFlight(state,true,hud);assert.equal(nodes.get('subtitle').textContent,'FLIGHT PAUSED');assert.equal(nodes.get('camera').textContent,'CAM: FPV');assert.equal(JSON.stringify(state),before);
state.crashed=true;state.ditched=true;i18n.setLanguage('ja');localizeFlight(state,true,hud);assert.equal(nodes.get('title').textContent,'着水');assert.equal(nodes.get('start').innerHTML,'やり直す');
i18n.setLanguage('en');
console.log('PASS: live EN/JA HUD, keyboard markup, water/crash copy, and flight-state nonmutation');
