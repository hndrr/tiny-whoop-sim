import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FlightState,GATES} from './dist/flight.mjs';
import {PrecisionMission} from './dist/precision-missions.mjs';
import {localizeFlight} from './dist/localize-flight.mjs';
import {i18n,CATALOG} from './dist/i18n.mjs';
const fresh=()=>{const s=new FlightState();s.paused=false;return s};
const move=(s,a,b,dt=.02)=>{[s.x,s.y,s.z]=b;s.updatePractice(a,dt)};
const at=(i,d=0)=>GATES[i].map((v,j)=>v+(j===1?d:0));
for(const direction of [-1,1]){
 const s=fresh();move(s,at(12,-5*direction),at(12,5*direction));
 assert.equal(s.practiceCount,1);assert.equal(s.ringFlash[12],1.2);
 assert.equal(s.gate,0);assert.equal(s.complete,false);assert.equal(s.finishTime,null);
 move(s,at(3,-5*direction),at(3,5*direction));assert.equal(s.practiceCount,2);
}
const s=fresh();move(s,at(0,-4),at(0));
for(let i=0;i<500;i++)move(s,at(0),at(0),.02);
assert.equal(s.practiceCount,1,'hover cannot farm repeats');assert.equal(s.ringFlash[0],0);
for(let i=0;i<30;i++){move(s,at(0,1.59),at(0,1.7));move(s,at(0,1.7),at(0,1.59))}
assert.equal(s.practiceCount,1,'entry boundary jitter remains latched');
move(s,at(0),at(0,3));move(s,at(0,3),at(0));assert.equal(s.practiceCount,2,'exit and reverse reentry counts');
move(s,at(0),at(0,-3));move(s,at(0,-3),at(0));assert.equal(s.practiceCount,2,'rapid bounce suppressed');
for(let i=0;i<100;i++)move(s,at(0),at(0));assert.equal(s.practiceCount,2,'cooldown expiry inside does not count');
for(const field of ['paused','crashed']){const x=fresh();x[field]=true;move(x,at(0,-3),at(0,3));assert.equal(x.practiceCount,0)}
const mission=new PrecisionMission(),m=fresh();mission.start(m);m.paused=false;move(m,at(0,-3),at(0,3));assert.equal(m.practiceCount,0);assert(m.ringFlash.every(v=>v===0));
for(let i=0;i<8;i++){s.relocate(i);assert.equal(s.practiceCount,0);assert(s.practiceEnabled);assert(s.ringFlash.every(v=>v===0));assert(s.ringCooldown.every(v=>v===0));assert(s.ringLatched.every(v=>!v));assert.equal(s.gate,0)}
s.reset();assert.equal(s.practiceCount,0);assert(s.practiceEnabled);
const fast=fresh();[fast.x,fast.y,fast.z]=at(0,-4);fast.vy=300;fast.step(.03,new Set());assert.equal(fast.practiceCount,1,'actual high-speed physics step is swept');
const all=fresh();for(let i=GATES.length-1;i>=0;i--)move(all,at(i,-3),at(i,3));assert.equal(all.practiceCount,18);all.step(.03,new Set());assert(!all.complete);assert.equal(all.finishTime,null);assert(all.elapsed>0);
const nodes=new Map(),root={getElementById(id){if(!nodes.has(id))nodes.set(id,{setAttribute(){}});return nodes.get(id)}};
for(const lang of ['en','ja']){i18n.setLanguage(lang);localizeFlight(all,true,root,true);assert.equal(nodes.get('distance').textContent,i18n.t('ringPassed'));all.ringFlash.fill(0);localizeFlight(all,true,root,true);assert.equal(nodes.get('distance').textContent,'');all.ringFlash[0]=1}
i18n.setLanguage('en');
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8'),html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
assert(!html.includes('id="timer"'));assert(!html.includes('id="dots"'));assert(!main.includes('NEXT '));assert(!main.includes('FINISH '));assert(!main.includes('ctx.fillText(String(i+1)'));
assert(main.includes('s.crashed=true;s.updatePractice('),'building collision is checked before practice feedback');
assert(main.includes('g.group.visible=!precision?.mission.active'));assert(main.includes('s.ringFlash[i]>0?gateMint:gateIdle'));
console.log('PASS: any-order/both directions, swept fast passes, hover/jitter/cooldown, reentry, pause/crash/mission suppression, area/reset bookkeeping, untimed HUD and ring feedback');

// Free flight keeps its count, without framing it as practice or explaining ring rules.
for(const lang of ['en','ja']){
 i18n.setLanguage(lang);assert.equal(i18n.t('rings'),lang==='ja'?'リング':'RINGS');
 for(const text of Object.values(CATALOG[lang]))assert(!/RING PRACTICE|ANY ORDER|EITHER WAY|optional practice|リング練習|順番なし|好きなリング|練習できます/.test(text));
 const idle=new FlightState();localizeFlight(idle,true,root);assert.equal(nodes.get('subtitle').textContent,i18n.t('modeFree'));assert.equal(nodes.get('distance').textContent,'');
 idle.paused=false;move(idle,at(0,-3),at(0,3));localizeFlight(idle,true,root,true);assert.equal(idle.practiceCount,1);assert.equal(nodes.get('distance').textContent,i18n.t('ringPassed'));
 idle.reset();localizeFlight(idle,true,root);assert.equal(idle.practiceCount,0);assert.equal(nodes.get('distance').textContent,'');
}
i18n.setLanguage('en');
assert(html.includes('data-i18n="rings">RINGS</label><strong><span id="gate">0</span>'));
assert(main.includes("$('gate').textContent=s.practiceCount"),'live counter remains wired to passes');
assert(html.includes('<p id="distance" role="status"></p>'),'pass feedback is empty initially and accessible');
assert(!/RING PRACTICE|ANY ORDER|EITHER WAY|optional practice/.test(html));
assert(readFileSync(new URL('./dist/style.css',import.meta.url),'utf8').includes('#distance:empty{display:none}'),'idle feedback leaves no empty line');
console.log('PASS: neutral bilingual ring counter, no persistent practice instructions, temporary accessible pass feedback and reset');

// A live region must not receive redundant text writes on animation frames.
let statusText='',statusWrites=0;
const statusNode={get textContent(){return statusText},set textContent(value){statusWrites++;statusText=value}};
const statusRoot={getElementById(id){return id==='distance'?statusNode:null}};
const feedback=new FlightState();
const renderFrames=()=>{for(let frame=0;frame<120;frame++)localizeFlight(feedback,true,statusRoot,true)};
for(const lang of ['en','ja']){
 i18n.setLanguage(lang);
 let before=statusWrites;renderFrames();assert.equal(statusWrites,before,'idle frames do not mutate the empty status');
 feedback.ringFlash[0]=1.2;renderFrames();assert.equal(statusText,i18n.t('ringPassed'));assert.equal(statusWrites,before+1,'a pass writes its label exactly once');
 before=statusWrites;feedback.ringFlash[0]=.5;feedback.ringFlash[1]=1.2;renderFrames();assert.equal(statusWrites,before,'ongoing and overlapping flashes retain the same status without writes');
 const other=lang==='en'?'ja':'en';i18n.setLanguage(other);renderFrames();assert.equal(statusText,i18n.t('ringPassed'));assert.equal(statusWrites,before+1,'a language change updates active feedback once');
 before=statusWrites;feedback.ringFlash.fill(0);renderFrames();assert.equal(statusText,'');assert.equal(statusWrites,before+1,'flash expiry clears feedback exactly once');
 before=statusWrites;i18n.setLanguage(lang);renderFrames();assert.equal(statusWrites,before,'a language change while idle keeps feedback empty');
 feedback.ringFlash[0]=1.2;renderFrames();assert.equal(statusText,i18n.t('ringPassed'));assert.equal(statusWrites,before+1,'a later pass restores its localized label');
 before=statusWrites;feedback.reset();renderFrames();assert.equal(statusText,'');assert.equal(statusWrites,before+1,'reset clears active feedback exactly once');
}
i18n.setLanguage('en');
console.log('PASS: live-region writes occur only on pass, clear, reset or active locale changes, never unchanged frames');
