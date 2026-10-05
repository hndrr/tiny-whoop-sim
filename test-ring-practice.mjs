import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FlightState,GATES} from './dist/flight.mjs';
import {PrecisionMission} from './dist/precision-missions.mjs';
import {localizeFlight} from './dist/localize-flight.mjs';
import {i18n} from './dist/i18n.mjs';
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
for(const lang of ['en','ja']){i18n.setLanguage(lang);localizeFlight(all,true,root,true);assert.equal(nodes.get('distance').textContent,i18n.t('ringPassed'));all.ringFlash.fill(0);localizeFlight(all,true,root,true);assert.equal(nodes.get('distance').textContent,i18n.t('practiceHint'));all.ringFlash[0]=1}
i18n.setLanguage('en');
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8'),html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
assert(!html.includes('id="timer"'));assert(!html.includes('id="dots"'));assert(!main.includes('NEXT '));assert(!main.includes('FINISH '));assert(!main.includes('ctx.fillText(String(i+1)'));
assert(main.includes('s.crashed=true;s.updatePractice('),'building collision is checked before practice feedback');
assert(main.includes('g.group.visible=!precision?.mission.active'));assert(main.includes('s.ringFlash[i]>0?gateMint:gateIdle'));
console.log('PASS: any-order/both directions, swept fast passes, hover/jitter/cooldown, reentry, pause/crash/mission suppression, area/reset bookkeeping, untimed HUD and ring feedback');
