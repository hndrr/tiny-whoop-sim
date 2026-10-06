import * as T from './vendor/three.module.min.js';
// Shared aircraft catalog for the inspector and the in-flight airframes.
export const VEHICLES=Object.freeze([
 {id:'whoop75',name:'WHOOP 75',tag:'CLASSIC DUCTED',description:'Four open ducts, a coral canopy and three-blade props.',color:'#ed5a48',span:.027,radius:.022,blades:3,guards:true,camera:[0,.029,.031]},
 {id:'micro65',name:'MICRO 65',tag:'COMPACT DUCTED',description:'A smaller mint frame, low canopy and two-blade props.',color:'#75dfbd',span:.023,radius:.019,blades:2,guards:true,camera:[0,.027,.024]},
 {id:'scout85',name:'SCOUT 85',tag:'OPEN-PROP SCOUT',description:'Exposed carbon arms, amber four-blade props and a raised FPV camera.',color:'#e7b75d',span:.032,radius:.024,blades:4,guards:false,camera:[0,.032,.037]},
 {id:'racer90',name:'RACER 90',tag:'STRETCHED RACE FRAME',description:'A slim open-prop racer with twin carbon decks, two-blade props and a tall tail fin.',color:'#b49aff',span:.033,radius:.025,blades:2,guards:false,camera:[0,.048,.032]},
 {id:'cine95',name:'CINE 95',tag:'DUCTED CAMERA PLATFORM',description:'A broad smooth canopy, deep ducts, a protected camera and twin landing skids.',color:'#8ccfe0',span:.035,radius:.026,blades:3,guards:true,camera:[0,.051,.039]}
]);
export const getVehicle=id=>VEHICLES.find(v=>v.id===id)||VEHICLES[0];
export function createVehicle(id){
 const preset=getVehicle(id),group=new T.Group(),propellers=[];
 group.name=preset.id;group.userData.vehicleId=preset.id;
 const material=(color,metalness=0)=>new T.MeshStandardMaterial({color,roughness:.5,metalness});
 const carbon=material('#182326',.3),shell=material(preset.color),duct=material('#e9e9d9'),metal=material('#93a9b5',.7),lens=material('#081720',.7);
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
 const {span,radius}=preset;
 const spanX=racer?span*.90:span,spanY=racer?span*1.30:span;
 for(const x of [-spanX,spanX])for(const y of [-spanY,spanY]){
  const arm=box([x/2,y/2,.004],[Math.hypot(x,y),.005,.004],carbon);arm.rotation.z=Math.atan2(y,x);
  if(preset.guards){const guard=add(new T.CylinderGeometry(radius,radius,cine?.022:.014,32,1,true),duct,[x,y,cine?.015:.011]);guard.rotation.x=Math.PI/2;for(const z of cine?[.004,.026]:[.004,.018])add(new T.TorusGeometry(radius,cine?.0022:.0018,6,32),duct,[x,y,z]);}
  const motor=add(new T.CylinderGeometry(.004,.004,.013,12),metal,[x,y,.009]);motor.rotation.x=Math.PI/2;
  const prop=new T.Group();prop.position.set(x,y,.02);
  for(let i=0;i<preset.blades;i++){const a=i*Math.PI*2/preset.blades,b=new T.Mesh(new T.SphereGeometry(1,12,6),shell);b.scale.set(.0034,radius*.48,.0008);b.rotation.z=a;b.position.set(-Math.sin(a)*radius*.43,Math.cos(a)*radius*.43,0);prop.add(b)}
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
