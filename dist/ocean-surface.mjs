import * as T from './vendor/three.module.min.js';
import {ATMOSPHERE,ATMOSPHERE_GLSL} from './atmosphere.mjs';
import {terrainHeight,WORLD_SIZE,WORLD_HALF,SEA_LEVEL,isOverWater,surfaceClearance} from './world.mjs';
// Sea surface after the Open Water study: a sum of dispersive exp-sine swells
// whose bands are dropped once a pixel's footprint cannot resolve them, so the
// loop ends early far away (and never aliases). Normals only: collision and
// ditching keep using the mean sea level.
export const OCEAN=Object.freeze({waves:16,coarseWaves:10,coast:{size:384,depth:8},ripple:{size:256,span:24,clearance:4,linger:3,step:1/60,gain:5.5}});
const SKY_HAZE='vec3(.7216,.7804,.7922)',SUN_HAZE='vec3(.854,.815,.735)';

// Water depth below mean sea level over the island chart, 0..8 m in R8.
// Bilinear sampling across the shoreline gives a continuous shallow band.
export function coastDepthTexture(size=OCEAN.coast.size){
 const data=new Uint8Array(size*size);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const x=-WORLD_HALF+(i+.5)*WORLD_SIZE/size,y=-WORLD_HALF+(j+.5)*WORLD_SIZE/size;
  data[j*size+i]=Math.round(Math.min(1,Math.max(0,(SEA_LEVEL-terrainHeight(x,y))/OCEAN.coast.depth))*255);
 }
 const texture=new T.DataTexture(data,size,size,T.RedFormat,T.UnsignedByteType);
 texture.magFilter=texture.minFilter=T.LinearFilter;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.needsUpdate=true;
 return texture;
}
const ripplePlaceholder=new T.DataTexture(new Uint16Array(4),1,1,T.RGBAFormat,T.HalfFloatType);ripplePlaceholder.needsUpdate=true;

// Colours are display-authored like the sky dome and decoded once at the end.
export function createOceanMaterial({coast,waveCount=OCEAN.waves}){
 return new T.ShaderMaterial({
  uniforms:{clock:{value:0},waveCount:{value:waveCount},pixelAngle:{value:.003},coast:{value:coast},ripple:{value:ripplePlaceholder},rippleFrame:{value:new T.Vector4(0,0,OCEAN.ripple.span,0)},sunDir:{value:new T.Vector3(...ATMOSPHERE.sunDirection)}},
  vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;varying float vViewDepth;
void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vec4 view=viewMatrix*world;vViewDepth=-view.z;gl_Position=projectionMatrix*view;
#include <logdepthbuf_vertex>
}`,
  fragmentShader:`#include <logdepthbuf_pars_fragment>
varying vec3 vWorld;varying float vViewDepth;
uniform float clock;uniform int waveCount;uniform float pixelAngle;uniform sampler2D coast;uniform sampler2D ripple;uniform vec4 rippleFrame;uniform vec3 sunDir;
${ATMOSPHERE_GLSL}
float oceanHash(float n){return fract(sin(n*12.9898)*43758.5453);}
float oceanNoise(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.-2.*u);float a=oceanHash(i.x+i.y*57.),b=oceanHash(i.x+1.+i.y*57.),c=oceanHash(i.x+(i.y+1.)*57.),d=oceanHash(i.x+1.+(i.y+1.)*57.);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
// Rounded troughs and slightly pinched crests; each band fades once
// k * footprint makes it sub-pixel, and the loop stops there.
void swell(vec2 p,float t,float foot,out vec2 slope,out float height){
 slope=vec2(0.);height=0.;float k=.32,a=.22;
 for(int i=0;i<${OCEAN.waves};i++){
  if(i>=waveCount)break;float fade=clamp(1.8-k*foot*1.6,0.,1.);if(fade<=0.)break;
  float fi=float(i),th=1.2+(oceanHash(fi*1.73)-.5)*(1.6+1.6*min(fi/6.,1.));vec2 dir=vec2(cos(th),sin(th));
  float ph=dot(dir,p)*k-sqrt(9.81*k)*t+oceanHash(fi+3.1)*6.2831,e=exp(.55*(sin(ph)-1.)),aa=a*fade;
  height+=aa*e;slope+=aa*.55*e*cos(ph)*k*dir;k*=1.18;a*=i<10?.83:.7;
 }
}
vec3 skyReflection(vec3 r){float h=max(r.z,0.),sd=max(dot(r,sunDir),0.);vec3 c=mix(vec3(.74,.79,.78),vec3(.17,.38,.59),pow(h,.5))+vec3(1.,.75,.4)*pow(sd,18.)*.21;return mix(mix(${SKY_HAZE},${SUN_HAZE},pow(sd,8.)*.55),c,smoothstep(-.01,.14,r.z));}
void main(){
#include <logdepthbuf_fragment>
vec3 toEye=cameraPosition-vWorld;float dist=length(toEye);vec3 V=toEye/dist;
float foot=dist*pixelAngle/max(V.z,.06);
float depth=texture2D(coast,(vWorld.xy+${WORLD_HALF.toFixed(1)})/${WORLD_SIZE.toFixed(1)}).r*${OCEAN.coast.depth.toFixed(1)};
vec2 slope;float height;swell(vWorld.xy,clock,foot,slope,height);slope*=.35+.65*smoothstep(0.,2.5,depth);
if(rippleFrame.w>0.){vec2 su=(vWorld.xy-rippleFrame.xy)/rippleFrame.z+.5;if(su.x>0.&&su.y>0.&&su.x<1.&&su.y<1.){
 // Two-texel central differences hide the bilinear texel grid; the slope is
 // capped so a single steep cell cannot become a hard sun glint.
 float tx=${(2/OCEAN.ripple.size).toFixed(6)},hx=texture2D(ripple,su+vec2(tx,0.)).r-texture2D(ripple,su-vec2(tx,0.)).r,hy=texture2D(ripple,su+vec2(0.,tx)).r-texture2D(ripple,su-vec2(0.,tx)).r;
 vec2 edge=min(su,1.-su),wash=vec2(hx,hy)/(2.*tx*rippleFrame.z)*smoothstep(0.,.12,min(edge.x,edge.y))*clamp(1.5-foot*6.,0.,1.)*rippleFrame.w*${OCEAN.ripple.gain.toFixed(2)};
 float washSlope=length(wash);slope+=washSlope>.5?wash*(.5/washSlope):wash;}}
vec3 n=normalize(vec3(-slope,1.)),r=reflect(-V,n);r.z=abs(r.z);
float fresnel=.02+.98*pow(1.-max(dot(n,V),0.),5.),crest=clamp(height/.5,0.,1.);
vec3 body=mix(vec3(.17,.43,.41),vec3(.035,.2,.24),smoothstep(.4,5.5,depth))*(.82+.36*crest);
vec3 color=mix(body,skyReflection(r),clamp(fresnel*.92+.04,0.,1.));
float sun=max(dot(r,sunDir),0.),soft=smoothstep(.05,3.,foot);color+=vec3(1.,.86,.62)*(pow(sun,mix(900.,90.,soft))*mix(5.,1.2,soft)+pow(sun,40.)*.06);
float surf=(1.-smoothstep(.05,1.4,depth))*(.55+.45*sin(clock*1.3-depth*5.+oceanNoise(vWorld.xy*.15)*4.));color=mix(color,vec3(.9,.93,.92),smoothstep(.45,.9,surf*(.6+.6*oceanNoise(vWorld.xy*.9+clock*.2)))*.75);
color=mix(color,mix(${SKY_HAZE},${SUN_HAZE},pow(max(dot(-V,sunDir),0.),8.)*.55),atmosphereFactor(${ATMOSPHERE.density.toFixed(6)},vViewDepth,cameraPosition.z,vWorld.z));
gl_FragColor=sRGBTransferEOTF(vec4(clamp(color,0.,1.),1.));}`
 });
}

// Rotor downwash on the water: a drone-centred height field (Open Water's
// ripple solver) that scrolls by whole texels and only runs while the
// aircraft is low over water, plus a short linger while rings fade out.
export function createPropWash(renderer,oceanMaterial){
 const {size,span,clearance,linger,step}=OCEAN.ripple;
 const supported=Boolean(renderer.extensions?.has?.('EXT_color_buffer_float')||renderer.extensions?.has?.('EXT_color_buffer_half_float'));
 const state={supported,active:false,steps:0,idleFor:Infinity,center:[0,0]};
 if(!supported)return {update(){},state};
 const targets=[0,1].map(()=>{const t=new T.WebGLRenderTarget(size,size,{type:T.HalfFloatType,format:T.RGBAFormat,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,generateMipmaps:false});t.texture.colorSpace=T.NoColorSpace;return t});
 const drops=Array.from({length:4},()=>new T.Vector4());
 const simMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{field:{value:null},delta:{value:new T.Vector2(1/size,1/size)},shift:{value:new T.Vector2()},count:{value:0},drops:{value:drops}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`uniform sampler2D field;uniform vec2 delta,shift;uniform int count;uniform vec4 drops[4];varying vec2 vUv;
float sampleHeight(vec2 u){vec2 s=u+shift;return (s.x<0.||s.y<0.||s.x>1.||s.y>1.)?0.:texture2D(field,s).r;}
void main(){vec2 s=vUv+shift;vec4 info=(s.x<0.||s.y<0.||s.x>1.||s.y>1.)?vec4(0.):texture2D(field,s);
float average=(sampleHeight(vUv-vec2(delta.x,0.))+sampleHeight(vUv+vec2(delta.x,0.))+sampleHeight(vUv-vec2(0.,delta.y))+sampleHeight(vUv+vec2(0.,delta.y)))*.25;
info.g+=(average-info.r)*.45;info.g*=.985;info.r+=info.g;info.r*=.995;
for(int i=0;i<4;i++){if(i>=count)break;vec4 d=drops[i];float l=length(vUv-d.xy)/d.z;if(l<1.)info.r-=(.5+.5*cos(l*3.14159265))*d.w;}
vec2 e=min(vUv,1.-vUv);info.rg*=mix(.86,1.,smoothstep(0.,.05,min(e.x,e.y)));gl_FragColor=info;}`});
 const simScene=new T.Scene(),simCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);simScene.add(new T.Mesh(new T.PlaneGeometry(2,2),simMaterial));
 // Compile against the half-float target it renders into, so the first low
 // pass over water does not stall on a program build.
 {const previous=renderer.getRenderTarget?.()??null;try{renderer.setRenderTarget?.(targets[0]);renderer.compile?.(simScene,simCamera)}catch{}finally{renderer.setRenderTarget?.(previous)}}
 let current=0,accumulator=0,wasDitched=false,seed=1;const uniforms=oceanMaterial.uniforms;
 // Downwash is turbulent: small impulses of either sign scattered under the
 // rotors radiate rings, where a steady source would only hold a dimple.
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 function clear(){const previous=renderer.getRenderTarget();for(const t of targets){renderer.setRenderTarget(t);renderer.clear(true,false,false)}renderer.setRenderTarget(previous)}
 function simulate(shiftX,shiftY,list){
  simMaterial.uniforms.field.value=targets[current].texture;simMaterial.uniforms.shift.value.set(shiftX,shiftY);
  list.forEach((d,i)=>drops[i].copy(d));simMaterial.uniforms.count.value=list.length;
  renderer.setRenderTarget(targets[1-current]);renderer.render(simScene,simCamera);current=1-current;state.steps++;
 }
 return {state,
  update(dt,flight){
   const water=isOverWater(flight.x,flight.y),height=surfaceClearance(flight.x,flight.y,flight.z),low=water&&height<clearance&&!flight.crashed;
   const splash=flight.ditched&&!wasDitched;wasDitched=flight.ditched;
   state.idleFor=low||splash?0:state.idleFor+dt;
   const run=state.idleFor<linger;
   if(!run){if(state.active){state.active=false;uniforms.rippleFrame.value.w=0}return}
   const previous=renderer.getRenderTarget();
   if(!state.active){state.active=true;clear();accumulator=0;state.center=[flight.x,flight.y]}
   // Scroll the domain under the aircraft in whole texels.
   const texel=span/size,sx=Math.round((flight.x-state.center[0])/texel),sy=Math.round((flight.y-state.center[1])/texel);
   let shiftX=0,shiftY=0;if(Math.abs(sx)>=4||Math.abs(sy)>=4){state.center[0]+=sx*texel;state.center[1]+=sy*texel;shiftX=sx/size;shiftY=sy/size}
   accumulator=Math.min(accumulator+dt,step*2);
   const u=.5+(flight.x-state.center[0])/span,v=.5+(flight.y-state.center[1])/span,near=low?1-height/clearance:0,thrust=.4+(flight.throttle??.5);
   while(accumulator>=step){
    const list=[];
    if(low)for(let i=0;i<3;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*(.25+.3*height)/span;list.push(new T.Vector4(u+Math.cos(a)*r,v+Math.sin(a)*r,.16/span,(random()-.35)*.09*thrust*near*near))}
    if(splash){list.length=Math.min(list.length,3);list.push(new T.Vector4(u,v,.8/span,.35))}
    simulate(shiftX,shiftY,list);shiftX=shiftY=0;accumulator-=step;
   }
   renderer.setRenderTarget(previous);
   uniforms.ripple.value=targets[current].texture;uniforms.rippleFrame.value.set(state.center[0],state.center[1],span,Math.min(1,(linger-state.idleFor)/1));
  },
  dispose(){targets.forEach(t=>t.dispose());simMaterial.dispose()}
 };
}

// Per-frame ocean state: pixel footprint scale for the wave cut-off and the
// downwash solver. One call from the frame loop.
export function createOceanSurface(renderer,material){
 const wash=createPropWash(renderer,material);
 return {wash,
  update(dt,flight,camera,feedHeight){material.uniforms.pixelAngle.value=2*Math.tan(camera.fov*Math.PI/360)/Math.max(1,feedHeight);wash.update(dt,flight)},
  setWaveCount(count){material.uniforms.waveCount.value=count}};
}
