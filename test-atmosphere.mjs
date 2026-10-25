import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {ATMOSPHERE,ATMOSPHERE_CHUNKS,CLOUDS,CLOUD_GLSL,installAtmosphere} from './dist/atmosphere.mjs';
import {createOceanMaterial} from './dist/ocean-surface.mjs';
import {applyTerrainShading} from './dist/terrain-visuals.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
// Installation replaces exactly the four fog chunks and keeps their contracts:
// vFogDepth, fogColor/fogDensity uniforms and a final mix into gl_FragColor.
const chunks={...T.ShaderChunk};installAtmosphere(chunks);
for(const [name,source] of Object.entries(ATMOSPHERE_CHUNKS))assert.equal(chunks[name],source);
assert(chunks.fog_vertex.includes('vFogDepth=-mvPosition.z;'));assert(chunks.fog_pars_fragment.includes('uniform vec3 fogColor;')&&chunks.fog_pars_fragment.includes('uniform float fogDensity;'));
assert(chunks.fog_fragment.includes('gl_FragColor.rgb=mix(gl_FragColor.rgb,atmosphereTint(fogColor'));
for(const name of ['meshphysical','meshlambert','meshbasic']){const frag=T.ShaderLib[name==='meshphysical'?'standard':name==='meshlambert'?'lambert':'basic'];assert(frag.vertexShader.includes('#include <fog_vertex>')&&frag.fragmentShader.includes('#include <fog_fragment>'));assert(frag.vertexShader.indexOf('#include <project_vertex>')<frag.vertexShader.indexOf('#include <fog_vertex>'),'mvPosition exists before fog_vertex')}
// Numeric model of the shader: identical to FogExp2 at sea level, thinner aloft.
const b=1/ATMOSPHERE.scaleHeight,density=(eye,point)=>{const h0=Math.max(eye,0),h1=Math.max(point,0),dz=h1-h0;return Math.abs(dz)>.5?(Math.exp(-b*h0)-Math.exp(-b*h1))/(b*dz):Math.exp(-b*.5*(h0+h1))};
const factor=(depth,eye,point)=>{const d=ATMOSPHERE.density*density(eye,point)*depth;return 1-Math.exp(-d*d)};
const exp2=depth=>1-Math.exp(-((ATMOSPHERE.density*depth)**2));
for(const depth of [50,500,2000,6000])assert(Math.abs(factor(depth,0,0)-exp2(depth))<1e-12,'sea-level parity with FogExp2');
for(const depth of [200,1000,4000])assert(Math.abs(factor(depth,1.2,0)-exp2(depth))<2e-3*exp2(depth)+1e-9,'drone-height views keep the old fog');
assert(factor(4000,600,0)<exp2(4000)*.8,'fog thins when looking down from altitude');assert(factor(4000,900,900)<factor(4000,0,0)*.4,'high horizontal views are clearer');
assert(Math.abs(density(0,0.4)-density(0,0))<1e-3,'small height differences use the midpoint, avoiding 0/0');
const sun=ATMOSPHERE.sunDirection;assert(Math.abs(Math.hypot(...sun)-1)<1e-12);
// Wiring: installed before scene construction; sky haze matches fog colour.
assert(main.indexOf('installAtmosphere();')<main.indexOf('new T.WebGLRenderer'));
assert(main.includes("scene.fog=new T.FogExp2('#b8c7ca',.00019)"),'scene fog colour and density unchanged');assert.equal(ATMOSPHERE.fogColor,'#b8c7ca');assert.equal(ATMOSPHERE.density,.00019);
const srgb=new T.Color(ATMOSPHERE.fogColor).getRGB(new T.Color(),T.SRGBColorSpace);
const haze=main.match(/vec3 haze=mix\(vec3\(([.\d]+),([.\d]+),([.\d]+)\)/).slice(1).map(Number);
assert(haze.every((v,i)=>Math.abs(v-[srgb.r,srgb.g,srgb.b][i])<1e-3),'sky horizon haze is the fog colour in the sky\'s sRGB authoring space');
assert(main.includes('uniforms:{sunDir:{value:new T.Vector3(...ATMOSPHERE.sunDirection)},clock:{value:0}}'));assert(main.includes('skyMat.uniforms.clock=oceanMat.uniforms.clock;'));
console.log('PASS: four fog chunks replaced with height-averaged exp2 fog, sea-level FogExp2 parity, thinner aloft, sun-side tint, matched sky haze and shared clock');
console.log('Numeric/source checks only; rendered appearance needs browser verification.');
// One cloud layer: the sky offsets by the camera on the same plane the ground
// shadows project to, so a cloud overhead and its shadow agree.
{const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
 assert(main.includes('cloudPlane(cameraPosition.xy,clock)')&&main.includes('terrainMat.userData.cloudClock=oceanMat.uniforms.clock;'));
 assert(createOceanMaterial({coast:new T.Texture(),waveCount:4}).fragmentShader.includes('float shade=cloudShadow(vWorld,clock);'));
 const m=new T.MeshLambertMaterial();m.userData.cloudClock={value:3};applyTerrainShading(m,{detailMean:.5});const shader={uniforms:{},vertexShader:T.ShaderLib.lambert.vertexShader,fragmentShader:T.ShaderLib.lambert.fragmentShader};m.onBeforeCompile(shader);
 assert.equal(shader.uniforms.cloudClock,m.userData.cloudClock);assert(shader.fragmentShader.includes('reflectedLight.directDiffuse*=1.-cloudShadow(vTerrainWorld,cloudClock);'));
 assert(CLOUD_GLSL.includes((CLOUDS.scale/CLOUDS.height).toFixed(7))&&CLOUDS.shadow<.5,'partial shade: direct sun only');}
console.log('PASS: shared cloud layer wired into sky, terrain direct light and sea');
