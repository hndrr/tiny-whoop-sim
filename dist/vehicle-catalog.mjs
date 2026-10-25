import * as T from './vendor/three.module.min.js';
import {createStaticBatcher} from './static-batch.mjs';
import {markGlow} from './feed-post.mjs';
// Shared aircraft catalog for the inspector and the in-flight airframes.
export const VEHICLES=Object.freeze([
 {id:'whoop75',name:'WHOOP 75',tag:'CLASSIC DUCTED',description:'Four open ducts, a coral canopy and three-blade props.',color:'#ed5a48',span:.027,radius:.022,blades:3,guards:true,camera:[0,.029,.031]},
 {id:'micro65',name:'MICRO 65',tag:'COMPACT DUCTED',description:'A smaller mint frame, low canopy and two-blade props.',color:'#75dfbd',span:.023,radius:.019,blades:2,guards:true,camera:[0,.027,.024]},
 {id:'scout85',name:'SCOUT 85',tag:'OPEN-PROP SCOUT',description:'Exposed carbon arms, amber four-blade props and a raised FPV camera.',color:'#e7b75d',span:.032,radius:.024,blades:4,guards:false,camera:[0,.032,.037]},
 {id:'racer90',name:'RACER 90',tag:'STRETCHED RACE FRAME',description:'A slim open-prop racer with twin carbon decks, two-blade props and a tall tail fin.',color:'#b49aff',span:.033,radius:.025,blades:2,guards:false,camera:[0,.048,.032]},
 {id:'cine95',name:'CINE 95',tag:'DUCTED CAMERA PLATFORM',description:'A broad smooth canopy, deep ducts, a protected camera and twin landing skids.',color:'#8ccfe0',span:.035,radius:.026,blades:3,guards:true,camera:[0,.051,.039]}
]);
export const getVehicle=id=>VEHICLES.find(v=>v.id===id)||VEHICLES[0];
// Ducts are one lathe each: a thin wall with rounded bead lips at both ends,
// on the same radius and z span as the former cylinder plus two torus rims.
export function ductGeometry(radius,height,lip){
 const points=[],arc=(cz,from,to)=>{for(let i=0;i<=6;i++){const a=from+(to-from)*i/6;points.push(new T.Vector2(radius+Math.cos(a)*lip,cz+Math.sin(a)*lip))}};
 const bottom=-height/2,top=height/2;
 arc(bottom,Math.PI,Math.PI*2);points.push(new T.Vector2(radius+lip*.55,bottom+lip),new T.Vector2(radius+lip*.55,top-lip));arc(top,0,Math.PI);
 points.push(new T.Vector2(radius,top-lip),new T.Vector2(radius,bottom+lip),points[0].clone());
 return new T.LatheGeometry(points,32).rotateX(Math.PI/2);
}
export function createVehicle(id,{envMap=null}={}){
 const preset=getVehicle(id),group=new T.Group(),propellers=[];
 group.name=preset.id;group.userData.vehicleId=preset.id;
 // Resin-coated carbon and painted shells carry a clear coat; motors and the
 // lens reflect the shared sky environment when one is supplied.
 const material=parameters=>{const m=new T.MeshPhysicalMaterial(parameters);if(envMap){m.envMap=envMap;m.envMapRotation.x=Math.PI/2}return m};
 const carbon=material({color:'#182326',roughness:.5,metalness:.3,clearcoat:.6,clearcoatRoughness:.28,envMapIntensity:.5}),shell=material({color:preset.color,roughness:.36,metalness:0,clearcoat:.85,clearcoatRoughness:.16,envMapIntensity:.6}),duct=material({color:'#e9e9d9',roughness:.44,metalness:0,clearcoat:.35,clearcoatRoughness:.35,envMapIntensity:.4}),metal=material({color:'#93a9b5',roughness:.3,metalness:.85,envMapIntensity:.9}),lens=material({color:'#081720',roughness:.06,metalness:.2,clearcoat:1,clearcoatRoughness:.04,envMapIntensity:1});
 function add(geo,mat,position){const m=new T.Mesh(geo,mat);m.position.set(...position);m.castShadow=m.receiveShadow=true;group.add(m);return m}
 const box=(position,size,mat)=>add(new T.BoxGeometry(...size),mat,position);
 const ball=(position,size,mat)=>{const m=add(new T.SphereGeometry(1,20,12),mat,position);m.scale.set(...size);return m};
 const strut=(start,end,radius,mat)=>{const a=new T.Vector3(...start),b=new T.Vector3(...end),delta=b.clone().sub(a),m=add(new T.CylinderGeometry(radius,radius,delta.length(),8),mat,a.add(b).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m};
 const racer=preset.id==='racer90',cine=preset.id==='cine95';
 if(racer){
  box([0,-.005,.006],[.019,.077,.003],carbon).name='race-bottom-deck';
  box([0,-.003,.019],[.016,.060,.003],carbon).name='race-top-deck';
  for(const x of [-.0065,.0065])for(const y of [-.023,.018])strut([x,y,.007],[x,y,.018],.0016,metal);
  box([0,-.007,.012],[.012,.038,.008],metal);
  box([0,-.009,.023],[.018,.007,.003],shell);
 }else if(cine){
  ball([0,0,.009],[.026,.039,.010],duct).name='cine-lower-shell';
  box([0,-.007,-.001],[.025,.043,.013],metal);
  box([0,-.007,-.003],[.028,.009,.014],carbon);
 }else{
  box([0,0,.007],[.030,.045,.004],carbon);box([0,-.003,-.003],[.021,.036,.013],metal);box([0,-.003,-.004],[.023,.009,.015],carbon);
 }
 const {span,radius}=preset,ductShape=preset.guards?ductGeometry(radius,cine?.022:.014,cine?.0022:.0018):null;
 const spanX=racer?span*.90:span,spanY=racer?span*1.30:span;
 for(const x of [-spanX,spanX])for(const y of [-spanY,spanY]){
  const arm=box([x/2,y/2,.004],[Math.hypot(x,y),.005,.004],carbon);arm.rotation.z=Math.atan2(y,x);
  if(preset.guards)add(ductShape,duct,[x,y,cine?.015:.011]).name='duct';
  const motor=add(new T.CylinderGeometry(.004,.004,.013,12),metal,[x,y,.009]);motor.rotation.x=Math.PI/2;
  const prop=new T.Group();prop.position.set(x,y,.02);
  for(let i=0;i<preset.blades;i++){const a=i*Math.PI*2/preset.blades,b=new T.Mesh(new T.SphereGeometry(1,12,6),shell);b.name='prop-blade';b.scale.set(.0034,radius*.48,.0008);b.rotation.z=a;b.position.set(-Math.sin(a)*radius*.43,Math.cos(a)*radius*.43,0);prop.add(b)}
  group.add(prop);propellers.push(prop);
 }
 const h=preset.id==='micro65'?.021:preset.id==='scout85'?.030:.027;
 if(racer){
  const canopy=new T.Shape();canopy.moveTo(-.009,-.017);canopy.lineTo(.009,-.017);canopy.lineTo(.007,.023);canopy.lineTo(0,.037);canopy.lineTo(-.007,.023);canopy.closePath();
  add(new T.ExtrudeGeometry(canopy,{depth:.007,bevelEnabled:false,steps:1}),shell,[0,0,.023]).name='race-pointed-canopy';
  const fin=new T.Shape();fin.moveTo(-.045,.016);fin.lineTo(-.062,.016);fin.lineTo(-.057,.050);fin.lineTo(-.044,.031);fin.closePath();
  const finGeometry=new T.ExtrudeGeometry(fin,{depth:.0024,bevelEnabled:false,steps:1});finGeometry.rotateX(Math.PI/2);finGeometry.rotateZ(Math.PI/2);
  add(finGeometry,shell,[-.0012,0,0]).name='race-tail-fin';
  box([0,.037,.027],[.018,.014,.012],carbon);
 }else if(cine){
  ball([0,-.003,.031],[.023,.033,.014],shell).name='cine-canopy';
  box([0,.039,.033],[.016,.016,.014],carbon).name='cine-camera-mount';
  for(const x of [-.013,.013]){
   strut([x*.8,.020,.030],[x,.045,.050],.0018,metal).name='cine-camera-cage';
   strut([x,.045,.050],[x,.055,.029],.0018,metal).name='cine-camera-cage';
  }
  strut([-.013,.045,.050],[.013,.045,.050],.0018,metal).name='cine-camera-cage';
  for(const x of [-.018,.018]){
   strut([x,-.046,-.015],[x,.041,-.015],.0022,carbon).name='cine-landing-skid';
   strut([x,.041,-.015],[x,.050,-.009],.0022,carbon).name='cine-landing-skid';
   for(const y of [-.026,.023])strut([x,y,-.015],[x,y,.003],.0018,metal).name='cine-skid-support';
  }
 }else if(preset.guards)ball([0,.006,h],[.013,.018,preset.id==='micro65'?.008:.012],shell);
 else{box([0,.003,.025],[.022,.034,.009],carbon);box([0,.014,.033],[.018,.013,.014],shell);box([0,-.018,.017],[.020,.025,.013],metal)}
 const camera=add(new T.CylinderGeometry(.006,.006,.008,20),carbon,[0,preset.camera[1]-.005,preset.camera[2]- .002]);camera.rotation.x=racer||cine?0:Math.PI/2;
 ball([0,preset.camera[1],preset.camera[2]],[.0045,.001,.0045],lens);
 if(!racer){box([0,cine?-.034:-.020,h],[.002,.020,.002],carbon);ball([0,cine?-.044:-.030,h],[.003,.004,.003],shell);}
 return {group,propellers,preset};
}
export function disposeVehicle(group){const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
// Radial alpha for a spinning-prop disc: clear hub, faint blade ghosts, soft rim.
let blurAlpha=null;
function propBlurAlpha(){
 if(blurAlpha)return blurAlpha;
 const size=64,data=new Uint8Array(size*size*4);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){const x=(i+.5)/size*2-1,y=(j+.5)/size*2-1,r=Math.hypot(x,y),a=Math.atan2(y,x),o=(j*size+i)*4;
  const alpha=r>1?0:Math.min(1,Math.max(0,(r-.18)/.17))*(1-Math.pow(r,6))*(.42+.12*Math.cos(a*3));data[o]=data[o+1]=data[o+2]=Math.round(alpha*255);data[o+3]=255}
 blurAlpha=new T.DataTexture(data,size,size);blurAlpha.magFilter=T.LinearFilter;blurAlpha.minFilter=T.LinearMipmapLinearFilter;blurAlpha.generateMipmaps=true;blurAlpha.needsUpdate=true;
 return blurAlpha;
}
// Flight copy of an airframe: static parts merged per material (a handful of
// draws instead of ~40, also in the shadow pass) and each prop's blades merged.
// Armed props show a translucent blur disc instead of individual blades.
export function bakeVehicle(model){
 const {group,propellers,preset}=model,batcher=createStaticBatcher({contact:false,cell:Infinity});
 // Ducts stay a separate batch: the FPV camera sees them (and the props) at
 // the bottom of the picture, as on a real whoop.
 for(const part of group.children)if(part.name==='duct')part.userData.batchTag='fpv';
 batcher.batch(group);
 const blurMaterial=new T.MeshLambertMaterial({color:preset.color,alphaMap:propBlurAlpha(),transparent:true,depthWrite:false,side:T.DoubleSide});
 const blurGeometry=new T.CircleGeometry(preset.radius*.91,24);
 for(const prop of propellers){
  batcher.batch(prop);
  const blur=new T.Mesh(blurGeometry,blurMaterial);blur.name='prop-blur';blur.visible=false;blur.userData.dynamic=true;prop.add(blur);
  prop.userData.blur=amount=>{for(const child of prop.children)child.visible=child===blur?amount>.5:amount<=.5};
 }
 group.traverse(o=>{if(o.isMesh&&o.name!=='prop-blur')o.castShadow=o.receiveShadow=true});
 // Underglow strip in the frame colour; it blooms through the video pass glow.
 const body=new T.Box3();for(const part of group.children)if(part.isMesh&&part.userData.batchTag!=='fpv')body.expandByObject(part,true);
 const led=new T.Mesh(new T.BoxGeometry(preset.span*.62,preset.span*.95,.0016),markGlow(new T.MeshBasicMaterial({color:preset.color}),1));
 led.name='underglow';led.position.set(0,-.002,body.min.z+.001);led.castShadow=led.receiveShadow=false;group.add(led);
 group.userData.fpvParts=group.children.some(c=>c.userData.batchTag==='fpv')||propellers.length>0;
 group.userData.setView=fpv=>{for(const part of group.children)part.visible=!fpv||part.userData.batchTag==='fpv'||propellers.includes(part)};
 return model;
}