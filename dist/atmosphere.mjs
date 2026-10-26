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
// One cloud layer for sky, terrain and sea. The sky samples it along the view
// ray (offset by the camera, so clouds stay put in the world as you fly) and
// the ground follows the sun up to the same layer for drifting cloud shadows.
export const CLOUDS=Object.freeze({height:1500,scale:.55,drift:[.004,.0015],cover:[.5,.76],shadow:.34});
export const CLOUD_GLSL=`
float cloudHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float cloudNoise(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.-2.*u);return mix(mix(cloudHash(i),cloudHash(i+vec2(1.,0.)),u.x),mix(cloudHash(i+vec2(0.,1.)),cloudHash(i+vec2(1.,1.)),u.x),u.y);}
float cloudDensity(vec2 cp){return cloudNoise(cp*1.3)*.55+cloudNoise(cp*2.9+3.1)*.3+cloudNoise(cp*6.3-1.7)*.15;}
vec2 cloudPlane(vec2 world,float clock){return world*${(CLOUDS.scale/CLOUDS.height).toFixed(7)}+vec2(clock*${CLOUDS.drift[0].toFixed(4)},clock*${CLOUDS.drift[1].toFixed(4)});}
float cloudShadow(vec3 p,float clock){
 vec2 xy=p.xy+${v3(ATMOSPHERE.sunDirection)}.xy/${ATMOSPHERE.sunDirection[2].toFixed(5)}*max(${CLOUDS.height.toFixed(1)}-p.z,0.);
 return smoothstep(${CLOUDS.cover[0].toFixed(2)},${CLOUDS.cover[1].toFixed(2)},cloudDensity(cloudPlane(xy,clock)))*${CLOUDS.shadow.toFixed(2)};
}`;
