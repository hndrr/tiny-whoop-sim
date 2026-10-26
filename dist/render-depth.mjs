import * as T from './vendor/three.module.min.js';
// Reversed float depth keeps hardware early-Z / hidden-surface removal, which
// logarithmic depth disables by writing gl_FragDepth in every shader. Browsers
// without EXT_clip_control keep the logarithmic path; ?depth=log forces it.
export function probeClipControl(doc=globalThis.document){
 try{
  const canvas=doc.createElement('canvas');canvas.width=canvas.height=1;
  const gl=canvas.getContext('webgl2');if(!gl)return false;
  const supported=Boolean(gl.getExtension('EXT_clip_control'));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return supported;
 }catch{return false}
}
export function chooseDepthMode({search=globalThis.location?.search??'',probe=probeClipControl}={}){
 if(new URLSearchParams(search).get('depth')==='log')return 'logarithmic';
 return probe()?'reversed':'logarithmic';
}
export function rendererDepthOptions(mode){return mode==='reversed'?{reversedDepthBuffer:true}:{logarithmicDepthBuffer:true}}
// A float depth attachment (DEPTH_COMPONENT32F) is what makes reversed depth
// precise; a 24-bit fixed-point buffer would gain little from the reversal.
export function attachFloatDepth(target){
 target.depthTexture=new T.DepthTexture(Math.max(1,target.width),Math.max(1,target.height),T.FloatType);
 return target;
}
