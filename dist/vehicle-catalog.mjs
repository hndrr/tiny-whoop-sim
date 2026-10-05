import * as T from './vendor/three.module.min.js';
// Original visual presets. All use the simulator's same stabilized flight model.
export const VEHICLES=Object.freeze([
 {id:'whoop75',name:'WHOOP 75',tag:'CLASSIC DUCTED',description:'Four open ducts, a coral canopy and three-blade props.',color:'#ed5a48',span:.027,radius:.022,blades:3,guards:true,camera:[0,.029,.031]},
 {id:'micro65',name:'MICRO 65',tag:'COMPACT DUCTED',description:'A smaller mint frame, low canopy and two-blade props.',color:'#75dfbd',span:.023,radius:.019,blades:2,guards:true,camera:[0,.027,.024]},
 {id:'scout85',name:'SCOUT 85',tag:'OPEN-PROP SCOUT',description:'Exposed carbon arms, amber four-blade props and a raised FPV camera.',color:'#e7b75d',span:.032,radius:.024,blades:4,guards:false,camera:[0,.032,.037]}
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
 box([0,0,.007],[.030,.045,.004],carbon);box([0,-.003,-.003],[.021,.036,.013],metal);box([0,-.003,-.004],[.023,.009,.015],carbon);
 const {span,radius}=preset;
 for(const x of [-span,span])for(const y of [-span,span]){
  const arm=box([x/2,y/2,.004],[Math.hypot(x,y),.005,.004],carbon);arm.rotation.z=Math.atan2(y,x);
  if(preset.guards){const guard=add(new T.CylinderGeometry(radius,radius,.014,32,1,true),duct,[x,y,.011]);guard.rotation.x=Math.PI/2;for(const z of [.004,.018])add(new T.TorusGeometry(radius,.0018,6,32),duct,[x,y,z]);}
  const motor=add(new T.CylinderGeometry(.004,.004,.013,12),metal,[x,y,.009]);motor.rotation.x=Math.PI/2;
  const prop=new T.Group();prop.position.set(x,y,.02);
  for(let i=0;i<preset.blades;i++){const a=i*Math.PI*2/preset.blades,b=new T.Mesh(new T.SphereGeometry(1,12,6),shell);b.scale.set(.0034,radius*.48,.0008);b.rotation.z=a;b.position.set(-Math.sin(a)*radius*.43,Math.cos(a)*radius*.43,0);prop.add(b)}
  group.add(prop);propellers.push(prop);
 }
 const h=preset.id==='micro65'?.021:preset.id==='scout85'?.030:.027;
 if(preset.guards)ball([0,.006,h],[.013,.018,preset.id==='micro65'?.008:.012],shell);
 else{box([0,.003,.025],[.022,.034,.009],carbon);box([0,.014,.033],[.018,.013,.014],shell);box([0,-.018,.017],[.020,.025,.013],metal)}
 const camera=add(new T.CylinderGeometry(.006,.006,.008,20),carbon,[0,preset.camera[1]-.005,preset.camera[2]- .002]);camera.rotation.x=Math.PI/2;
 ball([0,preset.camera[1],preset.camera[2]],[.0045,.001,.0045],lens);
 box([0,-.020,h],[.002,.020,.002],carbon);ball([0,-.030,h],[.003,.004,.003],shell);
 return {group,propellers,preset};
}
export function disposeVehicle(group){const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
