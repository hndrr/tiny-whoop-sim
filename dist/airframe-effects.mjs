import * as T from './vendor/three.module.min.js';
import {terrainColor} from './terrain-visuals.mjs';
import {groundHeight,isOverWater} from './world.mjs';
// Ground interaction under the rotors: dust kicked up within ~1.2 m of land
// (the sea has its own ripples) and a soft contact shade right beneath a low
// hover. A fixed pool of points; nothing is allocated per frame.
export const AIRFRAME_FX=Object.freeze({dustHeight:1.2,maxDust:220,rate:210,life:[.8,1.6],shadeHeight:3,paving:[[-6.5,16.5,-37.5,87.5],[16.5,47.5,-12.5,62.5],[-69.5,-14.5,57,65],[-18,82,82,98],[45.5,100.5,-1,71]]});
let dot=null;
function softDot(){
 if(dot)return dot;const size=32,data=new Uint8Array(size*size*4);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){const r=Math.hypot((i+.5)/size*2-1,(j+.5)/size*2-1),a=Math.max(0,1-r),v=Math.round(a*a*(3-2*a)*255);const o=(j*size+i)*4;
  // Gradient in every channel: points read alpha, alphaMap reads green.
  data[o]=data[o+1]=data[o+2]=data[o+3]=v}
 dot=new T.DataTexture(data,size,size);dot.magFilter=T.LinearFilter;dot.minFilter=T.LinearMipmapLinearFilter;dot.generateMipmaps=true;dot.needsUpdate=true;return dot;
}
// Paved/indoor surfaces give grey dust; natural ground uses its terrain hue.
export function groundDustColor(x,y,z,target=new T.Color()){
 if(AIRFRAME_FX.paving.some(([x0,x1,y0,y1])=>x>=x0&&x<=x1&&y>=y0&&y<=y1))return target.setRGB(.62,.6,.56);
 return terrainColor(x,y,z,target).lerp(new T.Color(.62,.57,.48),.45);
}
export function createAirframeEffects(scene){
 const n=AIRFRAME_FX.maxDust,positions=new Float32Array(n*3),colors=new Float32Array(n*4),velocity=new Float32Array(n*3),age=new Float32Array(n).fill(Infinity),life=new Float32Array(n).fill(1);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('color',new T.BufferAttribute(colors,4).setUsage(T.DynamicDrawUsage));
 const dust=new T.Points(geometry,new T.PointsMaterial({size:.12,sizeAttenuation:true,alphaMap:softDot(),vertexColors:true,transparent:true,depthWrite:false}));
 dust.frustumCulled=false;dust.visible=false;dust.name='rotor-dust';scene.add(dust);
 const shade=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:0x000000,alphaMap:softDot(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 shade.name='contact-shade';shade.visible=false;scene.add(shade);
 const color=new T.Color();let spawn=0,cursor=0,alive=0,seed=7;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 return {dust,shade,get alive(){return alive},
  update(dt,state,{reducedMotion=false}={}){
   const step=Math.max(0,Math.min(dt,.05)),ground=groundHeight(state.x,state.y),clearance=state.z-ground,water=isOverWater(state.x,state.y),flying=!state.paused&&!state.crashed;
   // Contact shade: strongest at the pad, gone by 3 m.
   const shadeAmount=water||state.crashed?0:Math.max(0,1-clearance/AIRFRAME_FX.shadeHeight);
   shade.visible=shadeAmount>0;if(shade.visible){shade.position.set(state.x,state.y,ground+.004);const size=.11+clearance*.07;shade.scale.set(size,size,1);shade.material.opacity=.42*shadeAmount}
   if(flying&&!water&&!reducedMotion&&clearance<AIRFRAME_FX.dustHeight){
    const strength=1-clearance/AIRFRAME_FX.dustHeight;spawn+=step*AIRFRAME_FX.rate*strength*(.4+(state.throttle??.5));groundDustColor(state.x,state.y,ground,color);
    while(spawn>=1){spawn--;const i=cursor;cursor=(cursor+1)%n;const a=random()*Math.PI*2,r=.04+random()*.18,out=.6+random()*1.1*(.5+strength);
     positions.set([state.x+Math.cos(a)*r,state.y+Math.sin(a)*r,ground+.01],i*3);velocity.set([Math.cos(a)*out,Math.sin(a)*out,.15+random()*.45],i*3);
     age[i]=0;life[i]=AIRFRAME_FX.life[0]+random()*(AIRFRAME_FX.life[1]-AIRFRAME_FX.life[0]);const shadeColor=.85+random()*.3;colors.set([color.r*shadeColor,color.g*shadeColor,color.b*shadeColor,0],i*4)}
   }else spawn=0;
   alive=0;
   for(let i=0;i<n;i++){
    if(!(age[i]<life[i])){colors[i*4+3]=0;continue}
    age[i]+=step;const k=i*3,drag=Math.exp(-step*1.8);velocity[k]*=drag;velocity[k+1]*=drag;velocity[k+2]=velocity[k+2]*drag-.35*step;
    positions[k]+=velocity[k]*step;positions[k+1]+=velocity[k+1]*step;positions[k+2]=Math.max(positions[k+2]+velocity[k+2]*step,ground+.005);
    const f=age[i]/life[i];colors[i*4+3]=Math.min(1,f*6)*(1-f)*.75;alive++;
   }
   dust.visible=alive>0;if(dust.visible){geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true}
  }};
}
