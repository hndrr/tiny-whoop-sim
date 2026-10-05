import assert from 'node:assert/strict';
import {controlInput} from './dist/controls.mjs';
import {FlightState} from './dist/flight.mjs';
const read = (codes=[], axes) => controlInput(new Set(codes), axes);
assert.deepEqual(read(), {pitch:0,roll:0,yaw:0,throttle:0});
for (const [code,axis,value] of [['ArrowUp','pitch',1],['ArrowDown','pitch',-1],['ArrowLeft','roll',-1],['ArrowRight','roll',1],['KeyW','throttle',1],['KeyS','throttle',-1],['KeyA','yaw',1],['KeyQ','yaw',1],['KeyD','yaw',-1],['KeyE','yaw',-1]]) assert.equal(read([code])[axis],value,code);
assert.deepEqual(read(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyQ','KeyE']),read());
assert.equal(read(['KeyA','KeyQ']).yaw,1,'yaw aliases saturate');
assert.equal(read(['ArrowUp'],{pitch:-.4}).pitch,.6,'mouse + keyboard mix');
assert.equal(read(['ArrowUp'],{pitch:1}).pitch,1,'mixed inputs saturate');
assert.deepEqual(read(['ArrowUp','ArrowRight','KeyW','KeyA']),{pitch:1,roll:1,throttle:1,yaw:1},'simultaneous dual-stick keyboard inputs');
const a=new FlightState(),b=new FlightState();a.paused=b.paused=false;
a.step(.02,new Set(['ArrowUp','ArrowRight','KeyW','KeyQ']));b.step(.02,new Set(),{pitch:1,roll:1,throttle:1,yaw:1});
assert.deepEqual(a,b,'physics uses the same normalized input as the indicators');
console.log('Control input regression checks passed');

// Exercise the real pointer lifecycle without a browser dependency.
const {bindSticks}=await import('./dist/controls.mjs');
class Element extends EventTarget {
 constructor(){super();this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};this.knob={style:{}};this.captured=new Set()}
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100}}
 querySelector(){return this.knob}
 setPointerCapture(id){this.captured.add(id)}
 hasPointerCapture(id){return this.captured.has(id)}
 releasePointerCapture(id){this.captured.delete(id);this.fire('lostpointercapture',id)}
 fire(type,id=1,x=50,y=50,button=0){const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:id,clientX:x,clientY:y,button,pointerType:'mouse'});this.dispatchEvent(event)}
}
const left=new Element(),right=new Element(),keys=new Set(),axes={};
const sticks=bindSticks({getElementById:id=>id==='leftStick'?left:right,querySelectorAll:()=>[]},keys,axes);
for(let repeat=0;repeat<3;repeat++){
 left.fire('pointerdown',1,83,17);assert.ok(axes.yaw<0 && axes.throttle>0);assert.ok(Math.abs(Math.hypot(axes.yaw,axes.throttle)-1)<1e-12);
 left.fire('pointerup');assert.equal(axes.yaw,0);assert.equal(left.captured.size,0);
}
left.fire('pointerdown',1,83,50);right.fire('pointerdown',2,50,17);assert.equal(axes.yaw,-1);assert.equal(axes.pitch,1);
left.fire('pointercancel');assert.equal(axes.yaw,0);assert.equal(axes.pitch,1,'one cancelled touch leaves the other active');
keys.add('ArrowUp');sticks.render();assert.equal(right.knob.style.transform,'translate(0px, -33px)');
keys.clear();sticks.clear();assert.equal(axes.pitch,0);assert.equal(right.captured.size,0);
right.fire('pointermove',2,83,50);assert.equal(axes.roll,0,'stale move after clear ignored');
right.fire('pointerdown',3,83,50);assert.equal(axes.roll,1,'fresh drag works after interruption');
right.fire('lostpointercapture',3);assert.equal(axes.roll,0);
left.fire('pointerdown',4,83,50,2);assert.equal(axes.yaw,0,'secondary mouse button ignored');
keys.add('ArrowRight');right.fire('pointerdown',5,17,50);assert.equal(right.classes.has('active'),false,'opposed mouse/key inputs cancel in display');
right.fire('pointerup',5);assert.equal(right.classes.has('active'),true,'release preserves held keyboard input');
keys.clear();sticks.clear();assert.equal(right.classes.has('active'),false);
console.log('Pointer lifecycle regression checks passed');

// Visible labels and their feedback must match the physical left/right key clusters.
const {readFileSync}=await import('node:fs');
const markup=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
const leftMarkup=markup.split('id="leftStick"')[1].split('id="rightStick"')[0];
const rightMarkup=markup.split('id="rightStick"')[1].split('id="keyLegend"')[0];
for(const [source,expected] of [[leftMarkup,[['KeyW','W'],['KeyS','S'],['KeyA KeyQ','A'],['KeyD KeyE','D']]],[rightMarkup,[['ArrowUp','↑'],['ArrowDown','↓'],['ArrowLeft','←'],['ArrowRight','→']]]]){
 for(const [codes,label] of expected) assert.ok(source.includes(`data-keys="${codes}">${label}</kbd>`),`visible key ${label}`);
}
const labels=[...markup.matchAll(/data-keys="([^"]+)"/g)].map(([,codes])=>{const el=new Element();el.dataset={keys:codes};return el});
const visualKeys=new Set(),visualAxes={},visualLeft=new Element(),visualRight=new Element();
const visual=bindSticks({getElementById:id=>id==='leftStick'?visualLeft:visualRight,querySelectorAll:()=>labels},visualKeys,visualAxes);
for(const [code,side,x,y] of [['KeyW',visualLeft,0,-33],['KeyS',visualLeft,0,33],['KeyA',visualLeft,-33,0],['KeyD',visualLeft,33,0],['ArrowUp',visualRight,0,-33],['ArrowDown',visualRight,0,33],['ArrowLeft',visualRight,-33,0],['ArrowRight',visualRight,33,0]]){
 visualKeys.add(code);visual.render();assert.equal(side.knob.style.transform,`translate(${x}px, ${y}px)`);assert.equal(labels.filter(label=>label.classes.has('pressed')).length,1);assert.equal(labels.find(label=>label.dataset.keys.split(' ').includes(code)).classes.has('pressed'),true);
 visualKeys.clear();visual.clear();assert.equal(visualLeft.classes.has('active'),false);assert.equal(visualRight.classes.has('active'),false);assert.equal(labels.some(label=>label.classes.has('pressed')),false);
}
console.log('PASS: physical WASD-left/arrows-right labels, all movement directions, pressed feedback and clear/reset neutralization');
