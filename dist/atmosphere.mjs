import * as T from './vendor/three.module.min.js';
// One atmosphere for scenery, sea and sky. The existing FogExp2 colour and
// density are kept exactly at sea level; fog thins with height (an averaged
// exponential density along each ray) and warms toward the sun. Constants are
// baked into GLSL because the sun never moves, so no per-material uniforms.
const length=Math.hypot(-80,-95,140);
export const ATMOSPHERE=Object.freeze({fogColor:'#b8c7ca',density:.00019,scaleHeight:700,sunDirection:[-80/length,-95/length,140/length],sunFog:[.70,.63,.50],sunPower:8,sunMix:.55});
const v3=a=>`vec3(${a.map(n=>n.toFixed(5)).join(',')})`;
// Average of exp(-z/H) between the eye and the sample height, times density.
export const ATMOSPHERE_GLSL=`
float atmosphereDensity(float eyeZ,float pointZ){
 float h0=max(eyeZ,0.),h1=max(pointZ,0.),b=${(1/ATMOSPHERE.scaleHeight).toFixed(7)},dz=h1-h0;
 return abs(dz)>.5?(exp(-b*h0)-exp(-b*h1))/(b*dz):exp(-b*.5*(h0+h1));
}
vec3 atmosphereTint(vec3 baseColor,vec3 rayDirection){
 float toward=pow(max(dot(rayDirection,${v3(ATMOSPHERE.sunDirection)}),0.),${ATMOSPHERE.sunPower.toFixed(1)});
 return mix(baseColor,${v3(ATMOSPHERE.sunFog)},toward*${ATMOSPHERE.sunMix.toFixed(2)});
}
float atmosphereFactor(float density,float viewDepth,float eyeZ,float pointZ){
 float d=density*atmosphereDensity(eyeZ,pointZ)*viewDepth;return 1.-exp(-d*d);
}`;
const FOG_PARS_VERTEX=`#ifdef USE_FOG
varying float vFogDepth;
varying vec3 vFogWorld;
#endif`;
// World position from view space: R^T * view + camera position (no inverse).
const FOG_VERTEX=`#ifdef USE_FOG
vFogDepth=-mvPosition.z;
vFogWorld=cameraPosition+transpose(mat3(viewMatrix))*mvPosition.xyz;
#endif`;
const FOG_PARS_FRAGMENT=`#ifdef USE_FOG
uniform vec3 fogColor;
varying float vFogDepth;
varying vec3 vFogWorld;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear;
uniform float fogFar;
#endif
${ATMOSPHERE_GLSL}
#endif`;
const FOG_FRAGMENT=`#ifdef USE_FOG
#ifdef FOG_EXP2
float fogFactor=atmosphereFactor(fogDensity,vFogDepth,cameraPosition.z,vFogWorld.z);
#else
float fogFactor=smoothstep(fogNear,fogFar,vFogDepth);
#endif
gl_FragColor.rgb=mix(gl_FragColor.rgb,atmosphereTint(fogColor,normalize(vFogWorld-cameraPosition)),fogFactor);
#endif`;
// Replace the pinned r180 fog chunks before any program compiles.
export function installAtmosphere(chunks=T.ShaderChunk){
 chunks.fog_pars_vertex=FOG_PARS_VERTEX;chunks.fog_vertex=FOG_VERTEX;chunks.fog_pars_fragment=FOG_PARS_FRAGMENT;chunks.fog_fragment=FOG_FRAGMENT;
 return chunks;
}
export const ATMOSPHERE_CHUNKS=Object.freeze({fog_pars_vertex:FOG_PARS_VERTEX,fog_vertex:FOG_VERTEX,fog_pars_fragment:FOG_PARS_FRAGMENT,fog_fragment:FOG_FRAGMENT});
