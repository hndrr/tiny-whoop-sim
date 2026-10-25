import * as T from './vendor/three.module.min.js';
// Eye/camera adaptation in one pixel: the feed's last mip is its mean colour,
// so a 1x1 pass reads it, eases toward a partial correction and keeps the
// result for the next frame. The authored look stays the reference: a
// typical daylight frame lands at gain 1 and the correction is only partial.
export const EXPOSURE=Object.freeze({key:.155,strength:.35,min:.78,max:1.32,fpvSeconds:.45,chaseSeconds:1.1});
export function exposureTarget(meanLuminance,{key=EXPOSURE.key,strength=EXPOSURE.strength}={}){
 return Math.min(EXPOSURE.max,Math.max(EXPOSURE.min,Math.pow(key/Math.max(meanLuminance,1e-4),strength)));
}
export function createExposure(renderer,feed){
 const supported=Boolean(renderer.extensions?.has?.('EXT_color_buffer_float')||renderer.extensions?.has?.('EXT_color_buffer_half_float'));
 const neutral=new T.DataTexture(new Float32Array([1,1,1,1]),1,1,T.RGBAFormat,T.FloatType);neutral.needsUpdate=true;
 if(!supported)return {supported,texture:neutral,update(){},reset(){}};
 const targets=[0,1].map(()=>{const t=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false,generateMipmaps:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter});t.texture.colorSpace=T.NoColorSpace;return t});
 const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{feed:{value:feed},previous:{value:neutral},lod:{value:10},rate:{value:1},fresh:{value:1}},
  vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`uniform sampler2D feed;uniform sampler2D previous;uniform float lod,rate,fresh;
void main(){vec3 mean=textureLod(feed,vec2(.5),lod).rgb;float l=dot(mean,vec3(.2126,.7152,.0722));
float target=clamp(pow(${EXPOSURE.key.toFixed(3)}/max(l,1e-4),${EXPOSURE.strength.toFixed(3)}),${EXPOSURE.min.toFixed(3)},${EXPOSURE.max.toFixed(3)});
float last=texture2D(previous,vec2(.5)).r;gl_FragColor=vec4(fresh>.5?target:mix(last,target,rate),0.,0.,1.);}`});
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1),quad=new T.Mesh(new T.PlaneGeometry(2,2),material);quad.frustumCulled=false;scene.add(quad);
 let current=0,fresh=true;
 // Compile against the half-float target it renders into.
 {const previous=renderer.getRenderTarget?.()??null;try{renderer.setRenderTarget(targets[0]);renderer.compile?.(scene,camera)}catch{}finally{renderer.setRenderTarget(previous)}}
 return {supported,get texture(){return targets[current].texture},
  update(dt,{fpv,width,height}){
   const seconds=fpv?EXPOSURE.fpvSeconds:EXPOSURE.chaseSeconds;
   material.uniforms.lod.value=Math.ceil(Math.log2(Math.max(1,width,height)));material.uniforms.rate.value=1-Math.exp(-Math.max(0,dt)/seconds);
   material.uniforms.previous.value=targets[current].texture;material.uniforms.fresh.value=fresh?1:0;fresh=false;
   const previous=renderer.getRenderTarget();renderer.setRenderTarget(targets[1-current]);renderer.render(scene,camera);renderer.setRenderTarget(previous);current=1-current;
  },
  // A cut (camera switch, relocation) adapts immediately instead of easing.
  reset(){fresh=true}};
}
