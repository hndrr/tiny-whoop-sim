import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeBrightness,loadBrightness,saveBrightness,bindBrightness} from './dist/brightness.mjs';
for(const invalid of [undefined,null,'180',NaN,Infinity,{},false])assert.equal(normalizeBrightness(invalid),100);
assert.equal(normalizeBrightness(-1),60);assert.equal(normalizeBrightness(999),180);assert.equal(normalizeBrightness(123.6),124);
let saved=null;const storage={getItem:()=>saved,setItem:(key,value)=>saved=value};
assert.equal(loadBrightness(storage),100);saveBrightness(storage,150);assert.equal(loadBrightness(storage),150);saved='{broken';assert.equal(loadBrightness(storage),100);saved='"180"';assert.equal(loadBrightness(storage),100);saved='999';assert.equal(loadBrightness(storage),180);
const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('quota')}};assert.equal(loadBrightness(blocked),100);assert.doesNotThrow(()=>saveBrightness(blocked,160));
class Element extends EventTarget {setAttribute(name,value){this[name]=value}blur(){this.blurred=(this.blurred||0)+1}}
const slider=new Element(),label=new Element(),reset=new Element(),uniform={value:1};
globalThis.localStorage=storage;saved='130';bindBrightness({getElementById:id=>({brightnessSlider:slider,brightnessValue:label,brightnessReset:reset})[id]},uniform);
assert.equal(uniform.value,1.3);assert.equal(slider.value,'130');assert.equal(label.textContent,'130%');assert.equal(slider['aria-valuetext'],'130 percent');
for(const amount of [60,180,120,100]){slider.value=String(amount);slider.dispatchEvent(new Event('input'));assert.equal(uniform.value,amount/100);assert.equal(loadBrightness(storage),amount)}
reset.dispatchEvent(new Event('click'));assert.equal(uniform.value,1);assert.equal(slider.value,'100');assert.equal(loadBrightness(storage),100);
// One shared postprocess shader applies gain after the FPV-only block: chase works too.
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
assert.ok(main.includes('brightness:{value:1}'));assert.ok(main.includes('uniform float brightness;'));assert.ok(main.includes('col*=inside;col*=brightness;gl_FragColor=vec4(col,1.);'));assert.ok(main.includes('bindBrightness(document,postMat.uniforms.brightness)'));
console.log('PASS: brightness range/default, invalid or blocked storage, repeated slider/reset, persistence and shared FPV/chase feed-only shader wiring');

assert.equal(slider.blurred,undefined,'keyboard brightness editing retains focus');slider.dispatchEvent(new Event('pointerup'));slider.dispatchEvent(new Event('pointercancel'));assert.equal(slider.blurred,2,'pointer finish restores flight keyboard control');
console.log('PASS: pointer brightness editing releases focus; keyboard range editing retains focus');
