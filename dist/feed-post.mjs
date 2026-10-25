import * as T from './vendor/three.module.min.js';
import {ATMOSPHERE} from './atmosphere.mjs';
// The single video pass that turns the scene feed into a picture. Order stays:
// scene-linear optics (lens, taps, depth of field, motion blur, glow, sun
// flare, exposure) -> one display transfer -> display-space grading and the
// analog signal (vignette, grain, scanlines, breakup) -> brightness gain.
// FPV is the goggle feed; chase is a second analog camera at ~60% strength.
export const FEED=Object.freeze({
 fpv:{lens:.095,chroma:.0022,soft:.22,tap:.0018,vignette:.16,grain:.065,scan:.03},
 chase:{lens:.03,chroma:.0013,soft:.13,tap:.0011,vignette:.08,grain:.039,scan:.018},
 glow:{mask:2.,threshold:.78,mip:[3,4.5,6]},motion:{shutter:.3,minSpeed:4,maxLength:.025},dof:{maxLod:1.2},
 skyDepth:12000,jello:.0045
});
const mix=(a,b,k)=>`mix(${a.toFixed(4)},${b.toFixed(4)},${k})`;
const P=name=>mix(FEED.chase[name],FEED.fpv[name],'fpv');
export function feedFragmentShader({colorManaged=false}={}){return `uniform sampler2D feed;uniform sampler2D depthMap;uniform sampler2D exposureMap;
uniform float clock;uniform float fpv;uniform float chaseMotion;uniform float brightness;uniform vec2 resolution;
uniform float hasDepth;uniform vec2 clip;uniform float signal;uniform vec2 jello;uniform vec4 sun;uniform vec3 blur;uniform vec2 blurShift;uniform float blurTaps;uniform float focus;uniform float dofStrength;uniform float bloomStrength;uniform float flareStrength;
varying vec2 uvv;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float viewDepth(vec2 uv){float d=texture2D(depthMap,uv).r;return clip.x*clip.y/max(d*(clip.y-clip.x)+clip.x,1e-9);}
void main(){vec2 p=uvv*2.-1.;float r=dot(p,p);float t=fract(clock*chaseMotion);
// Rolling-shutter skew from angular rate and vibration, plus sync tearing on a weak link.
float row=floor(uvv.y*resolution.y*.5);
float weak=smoothstep(.3,1.,signal);float tear=weak*weak*.03*sin(row*.37+t*251.)*step(.82-.25*signal,hash(vec2(floor(t*61.),floor(uvv.y*9.))));
vec2 q=p*(1.+${P('lens')}*r)/(1.+(1.-fpv)*${(FEED.chase.lens*2).toFixed(4)});vec2 uv=q*.5+.5;uv.x+=jello.x*(uvv.y-.5)+jello.y*sin(uvv.y*9.+t*347.)+tear;
vec3 col=textureLod(feed,uv,0.).rgb;
float shift=${P('chroma')}*(1.+1.5*signal);vec2 tap=vec2(${P('tap')},0.);
col.r=textureLod(feed,uv+vec2(shift,0.),0.).r;col.b=textureLod(feed,uv-vec2(shift,0.),0.).b;
col=mix(col,(textureLod(feed,uv+tap,0.).rgb+textureLod(feed,uv-tap,0.).rgb)*.5,${P('soft')});
float depth=hasDepth>.5?viewDepth(uv):30.;
// Chase depth of field: the aircraft and nearby ground stay crisp; distant
// scenery softens from the feed's own mip chain (no extra pass).
if(dofStrength>0.&&hasDepth>.5){float lod=smoothstep(focus*6.,focus*70.,depth)*${FEED.dof.maxLod.toFixed(2)}*dofStrength;if(lod>.05){vec2 px=vec2(1.)/resolution*(.5+lod);vec3 soft=(textureLod(feed,uv+px,lod).rgb+textureLod(feed,uv-px,lod).rgb+textureLod(feed,uv+vec2(px.x,-px.y),lod).rgb+textureLod(feed,uv+vec2(-px.x,px.y),lod).rgb)*.25;col=mix(col,soft,smoothstep(.05,.8,lod));}}
// Depth-aware motion blur: radial from the heading's focus of expansion,
// scaled by distance travelled per exposure over depth, plus rotation.
if(blurTaps>.5){vec2 dir=(uv-blur.xy)*blur.z/max(depth,1.)+blurShift;float len=length(dir);if(len>.75/resolution.y){dir*=min(1.,${FEED.motion.maxLength.toFixed(3)}/len);vec3 acc=vec3(0.);float n=0.;for(int i=0;i<6;i++){if(float(i)>=blurTaps)break;acc+=textureLod(feed,uv+dir*((float(i)+.5)/blurTaps-.5),1.).rgb;n+=1.;}col=mix(col,acc/n,.85);}}
// Glow: emissive surfaces mark themselves in feed alpha (1 - glow); very
// bright pixels also bloom past a soft threshold. Coarse mips only.
vec4 g0=textureLod(feed,uv,${FEED.glow.mip[0].toFixed(1)}),g1=textureLod(feed,uv,${FEED.glow.mip[1].toFixed(1)}),g2=textureLod(feed,uv,${FEED.glow.mip[2].toFixed(1)});
vec3 glow=(g0.rgb*(1.-g0.a)*.5+g1.rgb*(1.-g1.a)*.35+g2.rgb*(1.-g2.a)*.25)*${FEED.glow.mask.toFixed(2)}+max(g1.rgb-${FEED.glow.threshold.toFixed(2)},0.)*1.1+max(g2.rgb-${(FEED.glow.threshold-.06).toFixed(2)},0.)*.9;
col+=glow*bloomStrength;
// Sun glare and lens ghosts; occlusion from depth (or brightness) at the sun.
if(sun.z>0.){float vis;if(hasDepth>.5){vis=0.;for(int i=0;i<5;i++){vec2 o=vec2(float(i-2)*.004,float((i*3)%5-2)*.004);vis+=step(${FEED.skyDepth.toFixed(1)},viewDepth(sun.xy+o));}vis*=.2;}else{vis=smoothstep(.7,.92,dot(textureLod(feed,sun.xy,2.).rgb,vec3(.33)));}
 vis*=sun.z*flareStrength;
 if(vis>0.){vec2 aspect=vec2(resolution.x/resolution.y,1.);float d=length((uv-sun.xy)*aspect);vec3 warm=vec3(1.,.86,.66);
  col+=warm*vis*(exp(-d*7.)*.55+exp(-d*2.2)*.12+.035*(1.-clamp(length(sun.xy-.5)*1.6,0.,1.)));
  col+=warm*vis*exp(-abs((uv.y-sun.y)*resolution.y)*.06)*exp(-abs(uv.x-sun.x)*3.)*.08*fpv;
  vec2 axis=vec2(.5)-sun.xy;for(int i=0;i<4;i++){float k=float(i)==0.?.45:float(i)==1.?.9:float(i)==2.?1.35:1.8;float size=float(i)==1.?.07:.035+.01*float(i);float gd=length((uv-(sun.xy+axis*k))*aspect);col+=mix(vec3(.4,.7,1.),vec3(1.,.6,.35),fract(k))*vis*.06*smoothstep(size,size*.55,gd);}}}
col*=texture2D(exposureMap,vec2(.5)).r;
gl_FragColor=vec4(col,1.);${colorManaged?'\n#include <tonemapping_fragment>\n':''}\n#include <colorspace_fragment>\ncol=clamp(gl_FragColor.rgb,0.,1.);float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
// Display-space grading: goggle punch for FPV, a softer filmic chase camera.
float luma=dot(col,vec3(.2126,.7152,.0722));
col=mix(vec3(luma),col,mix(1.05,1.14,fpv));
col=mix(col,col*col*(3.-2.*col),mix(.12,.22,fpv));
col+=mix(vec3(.012,.0,-.01),vec3(-.012,.0,.02),fpv)*(1.-luma)+mix(vec3(.01,.004,-.008),vec3(0.),fpv)*luma;
col*=vec3(1.+.012*fpv*sin(clock*chaseMotion*.7),1.,1.-.012*fpv*sin(clock*chaseMotion*.7+.6));
float vig=1.-${P('vignette')}*r;col*=vig;
float noise=(hash(uvv*resolution+t*333.)-.5)*${P('grain')}*(1.+3.*signal);col+=noise;
col*=1.+${P('scan')}*sin(uvv.y*resolution.y*mix(1.5707963,3.14159,fpv));
// Weak link: snow bands, colour loss and brief dropouts, rare at short range.
if(weak>0.){float band=step(1.-.3*weak,hash(vec2(floor(uvv.y*resolution.y/3.),floor(t*480.))));col=mix(col,vec3(hash(uvv*resolution+t*977.)),band*weak*.7);
 col=mix(col,vec3(dot(col,vec3(.299,.587,.114))),smoothstep(.6,1.,signal)*.8);
 col*=1.-.85*step(.9,signal)*step(.72,hash(vec2(floor(t*1200.),3.)));}
col*=inside;col*=brightness;gl_FragColor=vec4(col,1.);}`}

export function createFeedPost({target,colorManaged=false}){
 const neutral=new T.DataTexture(new Float32Array([1,1,1,1]),1,1,T.RGBAFormat,T.FloatType);neutral.needsUpdate=true;
 const material=new T.ShaderMaterial({uniforms:{feed:{value:target.texture},depthMap:{value:target.depthTexture??neutral},exposureMap:{value:neutral},clock:{value:0},fpv:{value:1},chaseMotion:{value:1},brightness:{value:1},resolution:{value:new T.Vector2()},
  hasDepth:{value:target.depthTexture?1:0},clip:{value:new T.Vector2(.025,20000)},signal:{value:0},jello:{value:new T.Vector2()},sun:{value:new T.Vector4()},blur:{value:new T.Vector3()},blurShift:{value:new T.Vector2()},blurTaps:{value:0},focus:{value:.9},dofStrength:{value:0},bloomStrength:{value:1},flareStrength:{value:1}},
  vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:feedFragmentShader({colorManaged})});
 const postScene=new T.Scene(),postCam=new T.OrthographicCamera(-1,1,1,-1,0,1);postScene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
 const u=material.uniforms,sunDir=new T.Vector3(...ATMOSPHERE.sunDirection),v=new T.Vector3(),forward=new T.Vector3(),probe=new T.Vector3();
 return {material,postScene,postCam,
  // Per-frame optics: sun position, heading focus of expansion, rotation
  // smear, rolling-shutter skew, chase focus distance and the link state.
  update(dt,{camera,state,fpv,motion={yawRate:0,pitchRate:0,shake:0},signal=0,drone=null,reducedMotion=false,level={}}){
   u.clip.value.set(camera.near,camera.far);camera.getWorldDirection(forward);
   const facing=forward.dot(sunDir);probe.copy(camera.position).addScaledVector(sunDir,1e4).project(camera);
   u.sun.value.set(probe.x*.5+.5,probe.y*.5+.5,facing>0?Math.min(1,facing*3):0,0);
   u.signal.value=signal;u.bloomStrength.value=level.bloom??1;u.flareStrength.value=level.flare??1;
   const step=Math.max(1/240,Math.min(dt,.05)),hfov=2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect);
   v.set(state.vx??0,state.vy??0,state.vz??0);const speed=v.length(),taps=reducedMotion?0:level.motionTaps??6;
   if(taps>0&&speed>FEED.motion.minSpeed&&!state.paused){probe.copy(camera.position).addScaledVector(v,1e3/speed).project(camera);const ahead=v.dot(forward)>0;
    u.blur.value.set(probe.x*.5+.5,probe.y*.5+.5,(ahead?1:-1)*speed*step*FEED.motion.shutter);
    u.blurShift.value.set(-(motion.yawRate||0)*step*FEED.motion.shutter/hfov,(motion.pitchRate||0)*step*FEED.motion.shutter/(camera.fov*Math.PI/180));u.blurTaps.value=taps;}
   else{u.blurTaps.value=0;u.blur.value.set(.5,.5,0);u.blurShift.value.set(0,0)}
   // The scanline wobble only suits the soft-mounted chase camera; on the
   // hard-mounted FPV lens it read as a sideways jitter every frame.
   u.jello.value.set(reducedMotion?0:Math.max(-1,Math.min(1,(motion.yawRate||0)*.25))*FEED.jello*(fpv?1:.6),reducedMotion||fpv?0:(motion.shake||0)*.35);
   u.dofStrength.value=!fpv&&drone?level.dof??1:0;if(drone)u.focus.value=Math.max(.2,camera.position.distanceTo(drone.position));
  }};
}
// Emissive surfaces write (1 - glow) into feed alpha; the video pass blooms
// them even though the default feed is 8-bit. Composes with existing hooks.
export function markGlow(material,amount=1){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>\ngl_FragColor.a=${(1-amount).toFixed(3)};`)};
 material.customProgramCacheKey=()=>`${key()}|glow${amount}`;material.userData.glow=amount;
 return material;
}
