import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {OSD,wrap360,headingDegrees,relativeBearing,compassTicks,compassShift,compassMarker,vsiFill,horizonLines,createOsd} from './dist/osd.mjs';
const close=(a,b,e=1e-6,m)=>assert(Math.abs(a-b)<=e,m??`${a} != ${b}`);
// Compass: same convention as HDG, cardinal labels, wrap-around and HOME.
close(headingDegrees(0),0);close(headingDegrees(-Math.PI/2),90);close(headingDegrees(Math.PI/2),270);assert.equal(wrap360(-5),355);
assert.equal(relativeBearing(10,350),20);assert.equal(relativeBearing(350,10),-20);assert.equal(relativeBearing(180,0),180);
const ticks=compassTicks(),labels=Object.fromEntries(ticks.filter(t=>/^[NESW]$/.test(t.label)).map(t=>[t.label,t.deg]));
assert.deepEqual(labels,{N:0,E:90,S:180,W:270});assert(ticks.every(t=>t.at>=0&&t.at<=1));assert.equal(ticks.find(t=>t.deg===30).label,'030');
// The heading's tick sits at the window centre for any heading, including 0/360.
for(const hdg of [0,1,90,179.5,270,359.9]){const window=OSD.compassSpan/720,tick=(wrap360(hdg)+180)/720;close(tick+compassShift(hdg)/100,window/2,1e-9,`centred ${hdg}`)}
assert.deepEqual(compassMarker(0),{at:.5,off:false});assert.equal(compassMarker(170).at,1-OSD.markerEdge);assert(compassMarker(170).off&&compassMarker(-170).at===OSD.markerEdge);
assert.equal(vsiFill(OSD.vsiRange*3),1);assert.equal(vsiFill(-OSD.vsiRange*3),-1);assert.equal(vsiFill(0),0);close(vsiFill(OSD.vsiRange/4),.5);close(vsiFill(-OSD.vsiRange/4),-.5);assert(vsiFill(1)>vsiFill(.5)&&vsiFill(8)<1,'readable from a slow hover drift to the low-air limit');
// Horizon projected from the real camera: centred when level, below the centre
// when the lens tilts up, rotated against the bank, ladder above for climb.
const camera=new T.PerspectiveCamera(105,16/9,.025,1000),W=1600,H=900,f=H/2/Math.tan(105*Math.PI/360);
const aim=(pitch,bank=0)=>{camera.position.set(0,0,1);camera.up.set(0,-Math.sin(pitch),Math.cos(pitch)).applyAxisAngle(new T.Vector3(Math.cos(pitch)*0,Math.cos(pitch),Math.sin(pitch)),bank);camera.lookAt(0,Math.cos(pitch)*10,1+Math.sin(pitch)*10)};
aim(0);let lines=horizonLines(camera,W,H);close(lines[0].x,W/2,1e-6);close(lines[0].y,H/2,1e-6);close(lines[0].angle,0,1e-6);
const ten=lines.find(l=>l.deg===10),dive=lines.find(l=>l.deg===-10);close(ten.y,H/2-f*Math.tan(10*Math.PI/180),1e-6,'ladder spacing follows the lens');assert(dive.y>H/2);
aim(.2);lines=horizonLines(camera,W,H);close(lines[0].y,H/2+f*Math.tan(.2),1e-6,'FPV up-tilt puts the horizon below centre');
aim(0,.3);lines=horizonLines(camera,W,H);close(Math.abs(lines[0].angle),.3*180/Math.PI,1e-6);
// Banking right (camera right side down) tilts the world the other way: right end of the horizon rises.
{const right=new T.PerspectiveCamera(105,16/9,.025,1000);right.position.set(0,0,1);right.up.set(Math.sin(.3),0,Math.cos(.3));right.lookAt(0,10,1);assert(horizonLines(right,W,H)[0].angle<0,'right bank raises the right end')}
{const down=new T.PerspectiveCamera(105,1,.025,1000);down.position.set(0,0,10);down.up.set(0,1,0);down.lookAt(0,0,0);assert(horizonLines(down,W,H).every(l=>!l.visible),'no horizon when looking straight down')}
// DOM: built once, hidden outside FPV, and unchanged values write nothing.
class Node{constructor(){this.children=[];this.attributes={};this.hidden=false;let writes=0;this.style=new Proxy({},{set:(o,k,v)=>{o[k]=v;writes++;return true}});Object.defineProperty(this,'writes',{get:()=>writes})}append(...n){this.children.push(...n)}setAttribute(k,v){this.attributes[k]=v}}
const nodes=new Map([['homeArrow',new Node()],['vsiFill',new Node()]]),body=new Node(),doc={body,createElement:()=>new Node(),getElementById:id=>nodes.get(id)};
const osd=createOsd(doc);assert.equal(body.children.length,2);assert.equal(osd.ahi.children.length,1+OSD.ladder.length);
const state={heading:0,vz:1};aim(0);osd.update(state,{camera,fpv:true,bearing:90,width:W,height:H});assert.equal(osd.ahi.hidden,false);
const count=()=>[...nodes.values(),...osd.ahi.children,...osd.compass.children].reduce((n,node)=>n+node.writes,0),before=count();
osd.update(state,{camera,fpv:true,bearing:90,width:W,height:H});assert.equal(count(),before,'no style writes for an unchanged frame');
assert.equal(nodes.get('homeArrow').style.transform,'rotate(90deg)');assert.equal(nodes.get('vsiFill').style.transform,`scaleY(${(Math.round(Math.sqrt(1/OSD.vsiRange)/.02)*.02).toFixed(2)})`);
osd.update(state,{camera,fpv:false,bearing:90,width:W,height:H});assert.equal(osd.ahi.hidden,true,'horizon is FPV only');
// Wiring: one shared HUD update, existing telemetry ids kept, no race timer.
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8'),html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
assert(main.includes("hudOsd.update(s,{camera,fpv:fpv&&!s.crashed,bearing:home.bearing});"));for(const id of ['speed','alt','throttle','bar','heading','vertical','homeNav','homeText','homeArrow','vsiFill','gate'])assert(html.includes(`id="${id}"`),id);
assert(!html.includes('id="timer"'));
console.log('PASS: compass tape convention/wrap/HOME marker, camera-projected horizon and ladder, cached OSD writes, FPV-only horizon, HUD wiring');
console.log('CPU checks only; OSD legibility over the video needs browser/device verification.');
