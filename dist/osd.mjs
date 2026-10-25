import * as T from './vendor/three.module.min.js';
// Goggle-style OSD on top of the existing telemetry: an artificial horizon and
// pitch ladder projected from the real camera (so it matches the picture), a
// sliding compass tape with a HOME marker, a rotating HOME arrow and a small
// vertical-speed gauge. Presentation only; style writes happen only when a
// rounded value changes, which keeps per-frame DOM work small on phones.
export const OSD=Object.freeze({compassSpan:100,ladder:[-20,-10,10,20],vsiRange:6,pixel:.5,angle:.1,ladderReach:100,markerEdge:.12});
export const wrap360=d=>((d%360)+360)%360;
// Compass heading as shown in HDG: flight heading is counter-clockwise radians.
export const headingDegrees=heading=>wrap360(-heading*180/Math.PI);
export function relativeBearing(bearing,heading){const d=wrap360(bearing-heading);return d>180?d-360:d}
// Static tape from -180 to 540 degrees so any heading has a full span either side.
export function compassTicks(from=-180,to=540,step=5){
 const ticks=[];
 for(let d=from;d<=to;d+=step){const w=wrap360(d);ticks.push({at:(d-from)/(to-from),deg:w,major:w%15===0,label:w%90===0?'NESW'[w/90]:w%30===0?String(w).padStart(3,'0'):''})}
 return ticks;
}
// translateX (percent of the 720-degree strip) that centres `hdg` in the window.
export function compassShift(hdg,span=OSD.compassSpan){return (span/2-(wrap360(hdg)+180))/720*100}
// HOME marker position in the compass window (0..1), pinned inside the faded
// edges when off-tape so it still points the way home.
export function compassMarker(relative,span=OSD.compassSpan){const edge=OSD.markerEdge;return {at:Math.min(1-edge,Math.max(edge,.5+relative/span)),off:Math.abs(relative)>span*(.5-edge)}}
export function vsiFill(vz,range=OSD.vsiRange){return Math.max(-1,Math.min(1,vz/range))}
const a=new T.Vector3(),b=new T.Vector3(),forward=new T.Vector3();
// Horizon (0 degrees) and ladder lines at true elevations, projected through
// the camera: screen centre point and angle of each line, or hidden when the
// camera looks straight up/down or the line is behind it.
export function horizonLines(camera,width,height,degrees=[0,...OSD.ladder]){
 camera.updateMatrixWorld();camera.getWorldDirection(forward);
 const length=Math.hypot(forward.x,forward.y),lines=[];
 for(const deg of degrees){
  if(length<1e-3){lines.push({deg,visible:false});continue}
  const ux=forward.x/length,uy=forward.y/length,k=deg*Math.PI/180,c=Math.cos(k);
  a.set(ux*c,uy*c,Math.sin(k)).multiplyScalar(OSD.ladderReach).add(camera.position);
  b.set(uy,-ux,0).multiplyScalar(OSD.ladderReach*.1).add(a);
  a.project(camera);b.project(camera);
  if(a.z>1||b.z>1||a.z<-1){lines.push({deg,visible:false});continue}
  const x=(a.x*.5+.5)*width,y=(.5-a.y*.5)*height,angle=Math.atan2((a.y-b.y)*height,(b.x-a.x)*width)*180/Math.PI;
  lines.push({deg,visible:true,x,y,angle:Math.abs(angle)>90?angle-Math.sign(angle)*180:angle});
 }
 return lines;
}
const round=(v,step)=>Math.round(v/step)*step;
export function createOsd(root=globalThis.document){
 const cache=new Map(),el=(tag,className,parent,text='')=>{const node=root.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;parent?.append(node);return node};
 // One cached write per element/property; unchanged values touch nothing.
 const set=(node,key,value)=>{let entry=cache.get(node);if(!entry){entry={};cache.set(node,entry)}if(entry[key]===value)return false;entry[key]=value;if(key==='text')node.textContent=value;else if(key==='hidden')node.hidden=value;else node.style[key]=value;return true};
 const ahi=el('div','',null);ahi.id='ahi';ahi.setAttribute?.('aria-hidden','true');
 const lines=[0,...OSD.ladder].map(deg=>{const line=el('div',`ahi-line ${deg===0?'horizon':deg>0?'climb':'dive'}`,ahi);if(deg){el('span','',line,String(Math.abs(deg)));el('span','',line,String(Math.abs(deg)))}return line});
 const compass=el('div','',null);compass.id='compass';compass.setAttribute?.('aria-hidden','true');
 const strip=el('div','compass-strip',compass);
 for(const tick of compassTicks()){const mark=el('i',tick.label?'label':tick.major?'major':'',strip,tick.label);mark.style.left=(tick.at*100).toFixed(4)+'%'}
 const home=el('b','compass-home',compass,'H'),caret=el('i','compass-caret',compass),readout=el('output','compass-heading',compass,'000');
 root.body?.append(ahi,compass);
 const arrow=root.getElementById?.('homeArrow'),vsi=root.getElementById?.('vsiFill');
 return {ahi,compass,
  update(state,{camera,fpv,bearing=0,width=globalThis.innerWidth??0,height=globalThis.innerHeight??0}){
   const hdg=headingDegrees(state.heading??0),relative=relativeBearing(bearing,hdg),marker=compassMarker(relative);
   set(strip,'transform',`translateX(${round(compassShift(hdg),.01).toFixed(2)}%)`);
   set(readout,'text',String(Math.round(hdg)%360).padStart(3,'0'));
   set(home,'left',(marker.at*100).toFixed(1)+'%');set(home,'opacity',marker.off?'.55':'1');
   if(arrow)set(arrow,'transform',`rotate(${Math.round(relative)}deg)`);
   if(vsi){const f=vsiFill(state.vz??0);set(vsi,'transform',`scaleY(${round(f,.02).toFixed(2)})`)}
   set(ahi,'hidden',!fpv);
   if(!fpv||!camera)return;
   horizonLines(camera,width,height).forEach((line,i)=>{
    set(lines[i],'visibility',line.visible?'visible':'hidden');
    if(line.visible)set(lines[i],'transform',`translate(${round(line.x,OSD.pixel)}px,${round(line.y,OSD.pixel)}px) translate(-50%,-50%) rotate(${round(line.angle,OSD.angle).toFixed(1)}deg)`);
   });
  }};
}
