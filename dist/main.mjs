import {groundSlabPlacement,coveredSupportPlacement,groundSurfaceGeometry} from './render-surfaces.mjs';
import {createChaseCamera} from './chase-camera.mjs';
import {applyTerrainShading,noiseMapMean} from './terrain-visuals.mjs';
import {createTerrain} from './terrain-lod.mjs';
import {chooseDepthMode,rendererDepthOptions} from './render-depth.mjs';
import {createShadowScheduler} from './shadow-scheduler.mjs';
import {createStaticBatcher,instanceMeshes} from './static-batch.mjs';
import {createRockField,applyWind} from './nature-visuals.mjs';
import {ATMOSPHERE,installAtmosphere} from './atmosphere.mjs';
import {OCEAN,coastDepthTexture,createOceanMaterial,createOceanSurface} from './ocean-surface.mjs';
import {createQualityController} from './render-quality.mjs';
import {createFeedPost,markGlow} from './feed-post.mjs';
import {createExposure} from './exposure.mjs';
import {createSignalModel} from './signal-model.mjs';
import {createCameraMotion} from './camera-motion.mjs';
import {createAirframeEffects} from './airframe-effects.mjs';
import {createOsd} from './osd.mjs';
import {createFlightRenderTarget} from './render-color.mjs';
import {loadPaintedTextures,applyPaintedArchitecture} from './painted-materials.mjs';
import {createForestVisuals} from './forest-visuals.mjs';
import {createRenderProfile} from './render-profile.mjs';
import {createSurfaceMaterials,surfaceBoxGeometry,createSkyEnvironment,scaleCylinderSurfaceUV} from './surface-materials.mjs';
import {localizeFlight} from './localize-flight.mjs';
import {i18n} from './i18n.mjs';
import {setupPrecision} from './precision-ui.mjs';
import {bindBrightness} from './brightness.mjs';
import {bindSticks} from './controls.mjs';
import {createVehicle,disposeVehicle,bakeVehicle} from './vehicle-catalog.mjs';
import {setupFlightSelection} from './selection-integration.mjs';
import * as T from './vendor/three.module.min.js';
import {FlightState,GATES} from './flight.mjs';
import {SOLIDS,segmentHitsSolid} from './stage.mjs';
import {WORLD_SIZE,WORLD_HALF,FLIGHT_HALF,REGIONS,REGION_ELEVATIONS,WORLD_OBJECTS,terrainHeight,groundHeight,nearestRegion,isOverWater,homeNavigation,surfaceClearance,lowAltitudeWarning} from './world.mjs';
// Height fog with sun-side scattering replaces the fog chunks before any compile.
installAtmosphere();
const $=id=>document.getElementById(id),s=new FlightState(),keys=new Set(),axes={pitch:0,roll:0,yaw:0,throttle:0};let flightStarted=false;let fpv=true,previous=performance.now(),time=0;
const scene=new T.Scene();scene.background=new T.Color('#afc4cf');scene.fog=new T.FogExp2('#b8c7ca',.00019);
// The scene renders into its own feed target, so canvas MSAA only ever covered
// the full-screen post quad. Reversed float depth keeps early depth rejection.
const depthMode=chooseDepthMode();let renderer;try{renderer=new T.WebGLRenderer({canvas:$('world'),antialias:false,...rendererDepthOptions(depthMode),powerPreference:'high-performance'});}catch(e){$('title').textContent=i18n.t('noVideo');$('subtitle').textContent=i18n.t('webglRequired');throw e}
const reversedDepth=renderer.capabilities.reversedDepthBuffer===true;
renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia("(pointer:coarse)").matches?1.25:1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.outputColorSpace=T.SRGBColorSpace;
const coarsePointer=matchMedia('(pointer:coarse)').matches,surfaces=createSurfaceMaterials(renderer,{coarse:coarsePointer});
// ACES/HDR remains opt-in; display sRGB conversion is required for either feed target.
const colorManaged=new URLSearchParams(location.search).get('colorPipeline')==='1'&&renderer.extensions.has('EXT_color_buffer_float');
const renderProfile=new URLSearchParams(location.search).get('profile')==='1'?createRenderProfile():null;if(renderProfile)globalThis.tinyWhoopProfile={snapshot:()=>renderProfile.snapshot(),reset:()=>renderProfile.reset(),get scene(){return scene},programKeys:()=>renderer.info.programs.map(p=>p.cacheKey),inventory:()=>{const counts={};scene.traverseVisible(o=>{if(!o.isMesh)return;const key=(o.parent?.name||o.parent?.type||'')+'/'+(o.name||o.geometry.type)+'/'+o.material.type;counts[key]=(counts[key]||0)+1});return Object.entries(counts).sort((a,b)=>b[1]-a[1])},capture:()=>renderProfile.capture({camera:fpv?'fpv':'chase',programs:renderer.info.programs?.length??0,depth:reversedDepth?'reversed':'logarithmic',shadowUpdates:shadowSchedule.updates,ripple:{...oceanSurface.wash.state},dust:airframeFx.alive,quality:{level:renderQuality.level.name,cost:renderQuality.cost,refreshMs:renderQuality.refreshMs,history:renderQuality.history,feed:[target.width,target.height,target.samples]}})};
const camera=new T.PerspectiveCamera(105,1,.025,20000);camera.up.set(0,0,1);const chaseCamera=createChaseCamera();
scene.add(new T.HemisphereLight('#d7e9ff','#777650',2.1));const sun=new T.DirectionalLight('#fff0d3',3.6);sun.position.set(-80,-95,140);sun.castShadow=true;sun.shadow.mapSize.set(matchMedia("(pointer:coarse)").matches?1024:2048,matchMedia("(pointer:coarse)").matches?1024:2048);Object.assign(sun.shadow.camera,{left:-72,right:72,top:72,bottom:-72,near:1,far:520});sun.shadow.bias=-.0003;sun.shadow.normalBias=.018;scene.add(sun);sun.target.position.set(15,25,0);scene.add(sun.target);const shadowSchedule=createShadowScheduler(renderer,sun);
let seed=13;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mat=(c,r=1,m=0)=>new T.MeshStandardMaterial({color:c,roughness:r,metalness:m});const carbon=mat('#151a1b',.5,.25),ductmat=mat('#ede6d6',.6),pink=mat('#ed5a48',.4),dark=mat('#182a2d',.6,.2),metal=mat('#acbac0',.45,.7),glass=mat('#0a1720',.08,.8);
function mesh(geo,material,pos,scale,parent=scene){let m=new T.Mesh(geo,material);if(pos)m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
const unitBox=new T.BoxGeometry(1,1,1),surfaceBoxes=new Map();
const box=(pos,scale,m,parent,indoor=false)=>{let groundLayer=false;if(m===surfaces.asphalt){const view=groundSlabPlacement(pos,scale,{indoor});groundLayer=view.position!==pos;({position:pos,size:scale}=view)}let geo=unitBox;if(m.userData.tileMeters){const key=`${groundLayer?'layer:':''}${m.userData.tileMeters}:${scale.join(',')}`;if(!surfaceBoxes.has(key))surfaceBoxes.set(key,groundLayer?groundSurfaceGeometry(scale,m.userData.tileMeters):surfaceBoxGeometry(scale,m.userData.tileMeters));geo=surfaceBoxes.get(key)}return mesh(geo,m,pos,scale,parent)};const ball=(pos,scale,m,parent)=>mesh(new T.SphereGeometry(1,20,12),m,pos,scale,parent);
function texture(kind){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),im=ctx.createImageData(256,256);for(let i=0;i<im.data.length;i+=4){const n=rand();const value=210+n*24;im.data[i]=im.data[i+1]=im.data[i+2]=value;im.data[i+3]=255}ctx.putImageData(im,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(kind==='asphalt'?25:100,kind==='asphalt'?80:100);t.colorSpace=T.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t}
// Continuous eroded coastal hills, a flat race apron, and a sloping natural shoreline.
// Fully rough, non-metal surfaces gain no visible specular from GGX; Lambert
// keeps the same diffuse lighting at a fraction of the per-pixel cost.
const terrainMat=new T.MeshLambertMaterial({vertexColors:true,flatShading:true,map:texture('grass')});
applyTerrainShading(terrainMat,{detailMean:noiseMapMean()});
// Emerged 500 m patches only (187 of 256 lie wholly under the opaque sea), both
// levels in one batched multi-draw; each patch picks its level by pixel error.
const terrain=createTerrain(terrainMat);scene.add(terrain.mesh);const terrainChunks=terrain.chunks;
const skyGeo=new T.SphereGeometry(18000,40,20);const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{sunDir:{value:new T.Vector3(...ATMOSPHERE.sunDirection)},clock:{value:0}},vertexShader:`#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n#include <logdepthbuf_vertex>\n}`,fragmentShader:`#include <logdepthbuf_pars_fragment>\nvarying vec3 v;uniform vec3 sunDir;uniform float clock;
float skyHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float skyNoise(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.-2.*u);return mix(mix(skyHash(i),skyHash(i+vec2(1.,0.)),u.x),mix(skyHash(i+vec2(0.,1.)),skyHash(i+vec2(1.,1.)),u.x),u.y);}
void main(){
#include <logdepthbuf_fragment>
vec3 d=normalize(v);float h=max(0.,d.z);vec3 col=mix(vec3(.74,.79,.78),vec3(.17,.38,.59),pow(h,.5));float sd=max(dot(d,sunDir),0.);col+=vec3(1.,.75,.40)*pow(sd,18.)*.21;col+=vec3(1.,.91,.69)*smoothstep(.99955,.99975,sd)*2.;
// Drifting cumulus on a plane overhead: three octaves, brighter cores and sun
// side, thinning toward the horizon where they would alias.
if(d.z>.012){vec2 cp=d.xy/(d.z+.12)*.55+vec2(clock*.004,clock*.0015);float n=skyNoise(cp*1.3)*.55+skyNoise(cp*2.9+3.1)*.3+skyNoise(cp*6.3-1.7)*.15;float cover=smoothstep(.5,.76,n)*smoothstep(.012,.16,d.z);vec3 cloud=mix(vec3(.79,.82,.84),vec3(.97,.96,.92),clamp(smoothstep(.55,.9,n)+pow(sd,6.)*.45,0.,1.));col=mix(col,cloud,cover*.86);}
// The horizon dissolves into the same haze as distant scenery and sea.
vec3 haze=mix(vec3(.7216,.7804,.7922),vec3(.854,.815,.735),pow(sd,8.)*.55);col=mix(haze,col,smoothstep(-.01,.14,d.z));
// The sun marks itself in feed alpha for the video pass glow.
float glow=clamp(smoothstep(.9994,.99975,sd)+pow(sd,90.)*.35,0.,1.)*.9;gl_FragColor=sRGBTransferEOTF(vec4(clamp(col,0.,1.),1.-glow));}`});const skyDome=new T.Mesh(skyGeo,skyMat);skyDome.renderOrder=2;scene.add(skyDome);// Drawn after opaque scenery: early depth rejection skips covered sky.
// Footprint-limited swell, Fresnel sky reflection, glint, coastal shallows and
// surf; normals only, so ditching still uses the mean sea level.
const oceanMat=createOceanMaterial({coast:coastDepthTexture(),waveCount:coarsePointer?OCEAN.coarseWaves:OCEAN.waves});const ocean=mesh(new T.PlaneGeometry(80000,80000,1,1),oceanMat,[0,0,-2.4]);ocean.renderOrder=1;ocean.castShadow=false;
const airfieldStart=scene.children.length;
// Sky clouds drift on the same clock as the sea and foliage.
skyMat.uniforms.clock=oceanMat.uniforms.clock;const oceanSurface=createOceanSurface(renderer,oceanMat);
// Preserve the original seeded scenery sequence without allocating the old noise map.
for(let i=0;i<256*256;i++)rand();
const asphalt=surfaces.asphalt;box([5,25,.025],[23,125,.05],asphalt);const white=mat('#c8c7b5'),yellow=mat('#c7a24e');for(let y=-28;y<85;y+=12)box([5,y,.058],[.2,5,.01],white);for(const x of [-5.5,15.5])box([x,25,.06],[.12,120,.01],white);for(const y of [-29,79])for(let x=-3;x<15;x+=3)box([x,y,.061],[1,6,.015],white);box([32,25,.02],[31,75,.04],asphalt);
// Open hangars, service tunnel and cargo alleys. Collision keeps authored boxes;
// rendering alone separates buried ground slabs from terrain.
const concrete=surfaces.concrete,roofMat=mat('#637578',.65,.45),stageMats={floor:asphalt,wall:concrete,roof:roofMat,steel:metal,crate:surfaces.crate,container:surfaces.container,glass};
roofMat.userData.tileMeters=6;
const skyEnvironment=createSkyEnvironment(renderer);if(skyEnvironment)for(const material of [metal,roofMat,glass]){material.envMap=skyEnvironment.texture;material.envMapIntensity=.35;material.envMapRotation.x=Math.PI/2}
for(const o of SOLIDS)box(o.position,o.size,stageMats[o.material],scene,true);
const regionGroups=REGIONS.map(()=>new T.Group());regionGroups.forEach(g=>scene.add(g));
for(const o of WORLD_OBJECTS){let m;if(o.shape==='cylinder'){const geo=new T.CylinderGeometry(o.size[0]/2,o.size[0]/2,o.size[2],16);geo.rotateX(Math.PI/2);const material=stageMats[o.material]||yellow;if(material.userData.tileMeters)scaleCylinderSurfaceUV(geo,{diameter:o.size[0],height:o.size[2],tileMeters:material.userData.tileMeters,repeat:material===concrete?.5:1});m=mesh(geo,material,o.position,null,regionGroups[o.region])}else {const view=coveredSupportPlacement(o);m=box(view.position,view.size,stageMats[o.material]||yellow,regionGroups[o.region],true);}m.castShadow=false}
const turbines=[];for(const [x,y] of [[-90,-60],[0,0],[95,60]]){const rotor=new T.Group(),r=REGIONS[6];rotor.position.set(r.x+x,r.y+y+5,REGION_ELEVATIONS[6]+71);for(let i=0;i<3;i++){const blade=box([0,0,14],[1.4,.3,28],white,rotor);blade.rotation.y=i*Math.PI*2/3;blade.position.set(Math.sin(i*Math.PI*2/3)*14,0,Math.cos(i*Math.PI*2/3)*14);blade.castShadow=false}regionGroups[6].add(rotor);turbines.push(rotor)}
// Original tree positions and random-stream consumption are preserved.
const forest=createForestVisuals({random:rand,terrainHeight,nearestRegion});scene.add(forest.group);
// Loads never block flight or replace a working material with a failed image.
loadPaintedTextures(renderer,{coarse:coarsePointer}).then(textures=>{applyPaintedArchitecture(surfaces,roofMat,textures);staticBatcher.syncMaterials();forest.applyPaintedTextures(textures);warmPrograms();flightSelection?.selector.refreshStagePreviews?.()}).catch(error=>{if(renderProfile)console.warn('Painted material integration failed',error)});
// Interior ceiling lights, painted safety lines and loading-bay frames.
const lightMat=markGlow(new T.MeshStandardMaterial({color:'#e4e7d1',emissive:'#f3efd4',emissiveIntensity:.9}),.55);
for(const [cx,cy,w,d,h] of [[-40,30,30,44,7],[-42,80,44,24,8]]){for(let y=cy-d/2+5;y<cy+d/2;y+=8){box([cx,y,h-.28],[4,.2,.055],lightMat);for(const x of [cx-7,cx+7])box([x,y,.025],[.10,4,.012],yellow)}for(const x of [cx-w/2,cx+w/2]){for(const sy of [-1,1])box([x,cy+sy*6,2.7],[.35,.15,5.4],yellow);box([x,cy,5.43],[.35,12,.14],yellow)}const fill=new T.PointLight('#c8deed',120,28,2);fill.position.set(cx,cy,h-1);scene.add(fill)}
box([32,76,.028],[.14,22,.015],yellow);
// Extended apron and access strips make the expanded areas readable at low altitude.
box([-42,61,-.04],[55,8,.04],asphalt);box([32,90,-.05],[100,16,.05],asphalt);box([73,35,-.04],[55,72,.04],asphalt);
// Fine foreground vegetation and scattered weathered rocks.
// Tapered blades, dark at the root and sunlit at the tip, instead of flat boards.
const bladeGeo=new T.PlaneGeometry(.08,.42,1,2);bladeGeo.translate(0,.21,0);{const p=bladeGeo.attributes.position,c=[];for(let i=0;i<p.count;i++){const h=p.getY(i)/.42;p.setX(i,p.getX(i)*(1-h*.92)+.012*h*h);c.push(.62+.5*h,.66+.46*h,.6+.3*h)}bladeGeo.setAttribute('color',new T.Float32BufferAttribute(c,3));bladeGeo.computeVertexNormals()}bladeGeo.rotateX(Math.PI/2);const grassMat=new T.MeshLambertMaterial({color:'#7b8852',side:T.DoubleSide,vertexColors:true});const blades=new T.InstancedMesh(bladeGeo,grassMat,11000);const dummy=new T.Object3D();for(let i=0;i<11000;i++){let x=-85+rand()*180,y=-60+rand()*180;if(x>-66&&x<-14&&y>4&&y<97){x-=50}else if(x>-7&&x<110&&y>-40&&y<100){x+=100}dummy.position.set(x,y,Math.max(0,terrainHeight(x,y)));dummy.rotation.set(0,(rand()-.5)*.3,rand()*Math.PI);dummy.scale.setScalar(.5+rand()*1.7);dummy.updateMatrix();blades.setMatrixAt(i,dummy.matrix)}blades.receiveShadow=true;scene.add(blades);
// Same seeded placement and random-stream use; four faceted instanced shapes.
const rockRecords=[];for(let i=0;i<95;i++){const x=(rand()-.5)*430,y=-100+rand()*540;if(x>-100&&x<120&&y<120)continue;const z=terrainHeight(x,y),r=.4+rand()*2.5;if(z<-3)continue;rockRecords.push({position:[x,y,z+.1],scale:[r,r*.7,r*.65],rotation:[rand(),rand(),rand()]})}scene.add(createRockField(rockRecords));
// Equal practice rings; a mint flash acknowledges a pass in either direction.
const gates=[],gateMint=markGlow(new T.MeshStandardMaterial({color:'#8ee7cb',emissive:'#3fc79e',emissiveIntensity:1,roughness:.5}),.7),gateIdle=mat('#cfb77a',.8),gateDark=mat('#2f403d');const ringGeo=new T.TorusGeometry(1.6,.065,8,64),bandGeo=new T.TorusGeometry(1.6,.069,6,5,.16);GATES.forEach((g,i)=>{const group=new T.Group();group.position.set(...g);const prev=i?GATES[i-1]:[0,0,1.2],next=GATES[(i+1)%GATES.length];const dx=next[0]-prev[0],dy=next[1]-prev[1];group.rotation.z=-Math.atan2(dx,dy);const ring=mesh(ringGeo,gateIdle,[0,0,0],null,group);ring.rotation.x=Math.PI/2;for(let j=0;j<8;j++){const band=mesh(bandGeo,gateDark,null,null,ring);band.rotation.z=j*Math.PI/4}for(const x of [-1.4,1.4]){box([x,0,-g[2]/2],[.08,.08,g[2]],metal,group);box([x,0,-g[2]+.04],[.5,.6,.08],dark,group)}scene.add(group);gates.push({group,ring});});
// Posts, feet and dark bands repeat across all 18 gates: three instanced draws.
// Rings stay separate because each one flashes its own material.
const gateFixtures=new T.Group();gateFixtures.name='gate-fixtures';scene.add(gateFixtures);instanceMeshes(gates.flatMap(({group,ring})=>[...ring.children,...group.children.filter(o=>o!==ring)]),gateFixtures);
const airfieldObjects=scene.children.slice(airfieldStart).filter(o=>!regionGroups.includes(o)&&o!==forest.group);const airfieldGroup=new T.Group();airfieldObjects.forEach(o=>airfieldGroup.add(o));scene.add(airfieldGroup);
// Paving, floors and painted lines end within 8 cm of the ground: their shadows
// never read, but each one would be drawn into every shadow-map update.
airfieldGroup.traverse(o=>{if(o.isMesh&&o.parent===airfieldGroup&&o.position.z+o.scale.z/2<.08)o.castShadow=false});
// Static scenery is merged per material and 120 m cell (render-only).
const staticBatcher=createStaticBatcher({groundHeight});staticBatcher.batch(airfieldGroup);regionGroups.forEach(g=>staticBatcher.batch(g));
// Shared airframe factory drives both the inspector and the actual flight model.
let drone,propellers=[],vehiclePreset,flightSelection,precision;
function setVehicle(id){const next=bakeVehicle(createVehicle(id,{envMap:skyEnvironment?.texture??null}));if(drone){scene.remove(drone);disposeVehicle(drone)}drone=next.group;propellers=next.propellers;vehiclePreset=next.preset;scene.add(drone)}
setVehicle('whoop75');
// One shared video pass: full goggle signal in FPV, subpixel analog texture in chase.
// Chase feed scale and MSAA come from the adaptive quality level (FPV keeps its
// 576-line analog cap and never multisamples).
const renderLevel={chaseScale:1,msaa:0};
const target=createFlightRenderTarget({hdr:colorManaged,floatDepth:reversedDepth});// One video pass for both views: FPV goggle feed, chase as a second analog camera.
const feedPost=createFeedPost({target,colorManaged}),{postScene,postCam,material:postMat}=feedPost;
// Reduced motion freezes the grain/flicker clock; camera shake and skew stop too.
const signalMotion=matchMedia('(prefers-reduced-motion: reduce)');
function syncChaseSignalMotion(){postMat.uniforms.chaseMotion.value=signalMotion.matches?0:1}syncChaseSignalMotion();signalMotion.addEventListener?.('change',syncChaseSignalMotion);
bindBrightness(document,postMat.uniforms.brightness);
// Grass and crowns sway on the scene clock; reduced motion holds them still.
const foliageWind=[applyWind(grassMat,{clock:oceanMat.uniforms.clock,kind:'grass',reducedMotion:signalMotion.matches}),applyWind(forest.batches[0].crowns.material,{clock:oceanMat.uniforms.clock,kind:'crown',reducedMotion:signalMotion.matches})];signalMotion.addEventListener?.('change',()=>foliageWind.forEach(w=>w.setReducedMotion(signalMotion.matches)));
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();const scale=fpv?Math.min(1,576/h):renderer.getPixelRatio()*renderLevel.chaseScale,samples=fpv?0:renderLevel.msaa;if(target.samples!==samples){target.samples=samples;target.dispose()}target.setSize(Math.max(1,Math.floor(w*scale)),Math.max(1,Math.floor(h*scale)));postMat.uniforms.resolution.value.set(w,h)}addEventListener('resize',resize);resize();
function reset(){chaseCamera.reset();flightStarted=false;if(precision?.mission.active){precision.mission.retry(s);keys.clear();clearSticks();updateHUD();return}if(flightSelection){flightSelection.reset();return}s.reset();keys.clear();clearSticks();updateHUD()}
function toggle(){if(precision?.mission.active&&precision.mission.done)return;if(s.crashed)reset();s.paused=!s.paused;if(!s.paused)flightStarted=true;keys.clear();clearSticks();updateHUD()}
function switchCamera(){chaseCamera.reset();fpv=!fpv;camera.fov=fpv?105:72;camera.updateProjectionMatrix();$('camera').textContent=fpv?'CAM: FPV':'CAM: CHASE';document.body.classList.toggle('fpv',fpv);postMat.uniforms.fpv.value=fpv?1:0;resize()}
document.body.classList.add('fpv');const areaSelect=$('areaSelect');REGIONS.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.label;areaSelect.append(o)});$('relocate').onclick=()=>{chaseCamera.reset();s.relocate(Number(areaSelect.value));keys.clear();clearSticks();help(false);updateHUD()};$('start').onclick=()=>{toggle();$('start').blur()};$('pause').onclick=()=>{toggle();$('pause').blur()};$('reset').onclick=reset;$('camera').onclick=switchCamera;
function help(show){$('helpPanel').hidden=!show;$('help').setAttribute('aria-expanded',String(show));if(show){s.paused=true;keys.clear();clearSticks();updateHUD()}}$('help').onclick=()=>help($('helpPanel').hidden);$('closeHelp').onclick=()=>help(false);
const sticks=bindSticks(document,keys,axes);
function clearSticks(){sticks.clear()}
addEventListener('keydown',e=>{
 if(flightSelection?.selector.isOpen||precision?.mission.active&&precision.mission.done)return;
 if(e.target.closest?.('dialog[open],input,select,textarea,[contenteditable="true"]'))return;
 if(e.target.tagName==='BUTTON'&&!e.target.closest?.('[hidden]')&&['Enter','Space'].includes(e.code))return;
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(!e.repeat){if(e.code==='KeyP'||e.code==='Space')toggle();if(e.code==='KeyR')reset();if(e.code==='KeyC')switchCamera()}
 keys.add(e.code);sticks.render();
});
addEventListener('keyup',e=>{keys.delete(e.code);sticks.render()});
function suspendInput(){keys.clear();clearSticks();s.paused=true;updateHUD()}
addEventListener('blur',suspendInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendInput()});
addEventListener('resize',()=>sticks.render());

// Frame cost / refresh interval drives one-step level changes with dwell.
const renderQuality=createQualityController({coarse:coarsePointer,override:new URLSearchParams(location.search).get('quality'),onChange:applyQuality});
function applyQuality(level){renderLevel.chaseScale=level.chaseScale;renderLevel.msaa=coarsePointer?0:level.msaa;oceanSurface.setWaveCount(Math.min(level.waves,coarsePointer?OCEAN.coarseWaves:OCEAN.waves));const size=coarsePointer?Math.min(1024,level.shadowMap):level.shadowMap;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;shadowSchedule.invalidate()}resize()}
applyQuality(renderQuality.level);
// Camera life and video optics. Motion rotates only; the video pass reads the
// scene feed's mips, so exposure runs after the scene render, before post.
const exposure=createExposure(renderer,target.texture),signalModel=createSignalModel({segmentHitsSolid,terrainHeight}),cameraMotion=createCameraMotion(),airframeFx=createAirframeEffects(scene);let videoMode=null;
function cameraLife(dt){const near=fpv&&reversedDepth?.006:.025;if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix()}cameraMotion.apply(camera,dt,s,{fpv,reducedMotion:signalMotion.matches,clearance:surfaceClearance(s.x,s.y,s.z)});airframeFx.update(dt,s,{reducedMotion:signalMotion.matches})}
function videoFx(dt){if(videoMode!==fpv){exposure.reset();videoMode=fpv}exposure.update(dt,{fpv,width:target.width,height:target.height});postMat.uniforms.exposureMap.value=exposure.texture;feedPost.update(dt,{camera,state:s,fpv,motion:cameraMotion.output,signal:signalModel.update(dt,s),drone,reducedMotion:signalMotion.matches,level:renderQuality.level})}
precision=setupPrecision({scene,state:s,start:startPrecision,leave:leavePrecision,retry:reset,next:nextMissionStage,replay:replayMissionStage,completionLeave:finishMissionFree,clearInputs:()=>{keys.clear();clearSticks()}});
function startPrecision(){flightSelection.selector.open('mission')}
function leavePrecision(){flightSelection.selector.open('free')}
function nextMissionStage(){if(precision.mission.next(s)){chaseCamera.reset();flightSelection.setRegion(precision.mission.stage.region);s.paused=false;flightStarted=true;keys.clear();clearSticks();updateHUD()}}
function replayMissionStage(){chaseCamera.reset();precision.mission.start(s,precision.mission.stageIndex);s.paused=false;flightStarted=true;keys.clear();clearSticks();updateHUD()}
function finishMissionFree(){precision.mission.leave();s.practiceEnabled=true;s.paused=false;flightStarted=true;keys.clear();clearSticks();updateHUD()}
function startSelectedFlight(mode,stageIndex=0){chaseCamera.reset();if(mode==='mission'){if(!precision.mission.active||precision.mission.stageIndex!==stageIndex||precision.mission.done)precision.mission.start(s,stageIndex);else if(s.crashed)precision.mission.retry(s)}else {precision.mission.leave();s.practiceEnabled=true;if(s.crashed)flightSelection.reset()}flightStarted=true;keys.clear();clearSticks();help(false)}
flightSelection=setupFlightSelection({getMode:()=>precision.mission.active?'mission':'free',getMissionStage:()=>precision.mission.stageIndex,onStart:startSelectedFlight,onAreaChange:()=>{flightStarted=false},renderer,scene,skyDome,sun,terrainChunks,regionGroups,airfieldGroup,getDrone:()=>drone,state:s,clearInputs:()=>{keys.clear();clearSticks()},updateHUD,setVehicle,closeHelp:()=>help(false)});
const osd=document.createElement('div');osd.id='osd';osd.innerHTML='<span>VTX SIM</span><span>ANALOG / 576</span>';document.body.append(osd);
// Horizon, ladder, compass tape and HOME arrow; presentation only.
const hudOsd=createOsd(document);
function updateHUD(){
document.body.classList.toggle('flight-idle',s.paused||s.crashed);
$('speed').textContent=String(Math.round(s.indicatedSpeed*3.6)).padStart(3,'0');$('alt').textContent=surfaceClearance(s.x,s.y,s.z).toFixed(1).padStart(4,'0');$('throttle').textContent=Math.round(s.throttle*100)+'%';$('bar').style.width=s.throttle*100+'%';$('gate').textContent=s.practiceCount;$('gateTotal').textContent='';$('heading').textContent='HDG '+String(Math.round((-s.heading*180/Math.PI+36000)%360)).padStart(3,'0')+'°';$('vertical').textContent='V/S '+(s.vz>=0?'+':'')+s.vz.toFixed(1);
$('pause').textContent=s.paused||s.crashed?'ARM':'DISARM';$('message').style.display=s.paused||s.crashed?'block':'none';$('title').textContent=s.crashed?(s.ditched?'DITCHED':'CRASHED'):s.explore?'EXPLORATION':'DISARMED';$('eyebrow').textContent=s.crashed?'FLIGHT TERMINATED':s.explore?'FREE FLIGHT / ISLAND + OCEAN':'ANGLE / COASTAL 02';$('subtitle').textContent=s.crashed?'RESET TO RE-ARM':s.explore?REGIONS[s.region].label:s.elapsed>0?'FLIGHT PAUSED':GATES.length+' GATES · INDOOR / OUTDOOR';$('start').innerHTML=s.crashed?'RESTART':s.elapsed>0?'RESUME <kbd>P</kbd>':'ARM <kbd>P</kbd>';$('flightMode').textContent=s.paused||s.crashed?'DISARMED':s.explore?'EXPLORE':'ANGLE';$('warning').textContent=Math.max(Math.abs(s.x),Math.abs(s.y))>FLIGHT_HALF-300?'MAP EDGE · RETURN':lowAltitudeWarning(s)?'LOW ALTITUDE':'';$('regionLabel').textContent=isOverWater(s.x,s.y)?'OPEN WATER':nearestRegion(s.x,s.y).label;const home=homeNavigation(s.x,s.y);$('homeText').textContent='HOME '+(home.distance>=1000?(home.distance/1000).toFixed(1)+'km':Math.round(home.distance)+'m')+' '+String(Math.round(home.bearing)).padStart(3,'0')+'°';hudOsd.update(s,{camera,fpv:fpv&&!s.crashed,bearing:home.bearing});gateFixtures.visible=!precision?.mission.active;gates.forEach((g,i)=>{g.group.visible=!precision?.mission.active;g.ring.material=s.ringFlash[i]>0?gateMint:gateIdle});localizeFlight(s,fpv,document,flightStarted);if(precision){precision.render(flightStarted);if(precision.mission.active){$('reset').textContent=i18n.t('retryShort');$('title').textContent=s.crashed?i18n.t(s.ditched?'ditched':'crashed'):i18n.t(precision.mission.done?'missionComplete':'modePrecision');$('eyebrow').textContent=i18n.t('missionReady');$('subtitle').textContent=i18n.t(s.crashed?'retryObjective':precision.mission.done?'missionComplete':precision.mission.objective.hint);$('flightMode').textContent=s.paused||s.crashed?i18n.t('disarmed'):i18n.t('modePrecision')}else $('reset').textContent=i18n.t('reset')}}
const aim=new T.Vector3(),up=new T.Vector3(0,0,1),forward=new T.Vector3(0,1,0),local=new T.Vector3();
function frame(now){const frameMs=now-previous;renderQuality.sample(frameMs,{active:!document.hidden&&!s.paused});let dt=Math.min((now-previous)/1000,.05);previous=now;time+=dt;skyDome.position.set(s.x,s.y,s.z);airfieldGroup.visible=Math.hypot(s.x,s.y)<1100;terrain.update(s,target.height,camera.fov);regionGroups.forEach((g,i)=>g.visible=Math.hypot(REGIONS[i].x-s.x,REGIONS[i].y-s.y)<2400);turbines.forEach(r=>r.rotation.y+=dt*.24);for(let i=0;i<2;i++){const before=[s.x,s.y,s.z];s.step(dt/2,keys,axes,false);if(!s.crashed&&!s.paused&&segmentHitsSolid(before,[s.x,s.y,s.z]))s.crashed=true;s.updatePractice(before,Math.min(dt/2,.03),!precision.mission.active)}if(precision.mission.update(s,dt)&&precision.mission.done){keys.clear();clearSticks()}drone.position.set(s.x,s.y,s.z);drone.rotation.set(s.pitch,s.roll,s.heading,'ZXY');propellers.forEach((p,i)=>{p.rotation.z+=dt*(s.paused?6:400)*(i%2?1:-1);p.userData.blur?.(s.paused||s.crashed?0:1)});// FPV keeps the ducts and props in view (they need the tiny reversed-depth near plane).
drone.visible=!fpv||drone.userData.fpvParts===true&&reversedDepth;drone.userData.setView?.(fpv);// The light frame stays within 30 m of the ground: with reversed depth, ground
// beyond the light's far plane would otherwise read as shadowed when high.
shadowSchedule.update({x:s.x,y:s.y,z:Math.min(s.z,s.z-surfaceClearance(s.x,s.y,s.z)+30)},{caster:drone,clearance:surfaceClearance(s.x,s.y,s.z)});if(fpv){camera.position.copy(drone.position).add(local.set(...vehiclePreset.camera).applyQuaternion(drone.quaternion));forward.set(0,Math.cos(.20),Math.sin(.20)).applyQuaternion(drone.quaternion);up.set(0,-Math.sin(.20),Math.cos(.20)).applyQuaternion(drone.quaternion);camera.up.copy(up);camera.lookAt(aim.copy(camera.position).add(forward))}else{chaseCamera.update(camera,s,dt)}cameraLife(dt);forest.update(camera.position);oceanMat.uniforms.clock.value=time;oceanSurface.update(dt,s,camera,target.height);postMat.uniforms.clock.value=time;const renderStart=renderProfile?performance.now():0;renderer.setRenderTarget(target);renderer.render(scene,camera);const sceneCalls=renderProfile?renderer.info.render.calls:0,triangles=renderProfile?renderer.info.render.triangles:0;videoFx(dt);renderer.setRenderTarget(null);renderer.render(postScene,postCam);if(renderProfile){const frameInfo={frameMs,renderSubmitMs:performance.now()-renderStart,sceneCalls,postCalls:renderer.info.render.calls,triangles:triangles+renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries};renderProfile.note(frameInfo);if(!document.hidden&&!s.paused)renderProfile.record(frameInfo)}updateHUD();requestAnimationFrame(frame)}requestAnimationFrame(frame);
// Inspectable prototype state for local automated checks and supported browser tools.
// Leaving the airfield hides its two fill lights, which changes every lit
// program. Compile both light states up front instead of stalling mid-flight.
// Programs depend on the bound target (tone mapping/output transfer), so bind
// the feed target the scene actually renders into.
function warmPrograms(){if(!renderer.compileAsync)return;const shown=airfieldGroup.visible,previous=renderer.getRenderTarget();try{renderer.setRenderTarget(target);renderer.compileAsync(scene,camera).catch(()=>{});airfieldGroup.visible=!shown;renderer.compileAsync(scene,camera).catch(()=>{})}finally{airfieldGroup.visible=shown;renderer.setRenderTarget(previous)}}
warmPrograms();
window.skyward={state:s,mission:precision.mission,startPrecision,leavePrecision,reset,toggle,switchCamera,get cameraMode(){return fpv?'fpv':'chase'},get selection(){return flightSelection.selected},get aircraft(){return drone.userData.vehicleId},openSelection:()=>flightSelection.selector.open(),keys};
if(document.modelContext?.registerTool){for(const tool of [{name:'read_flight_state',description:'Read the current simulated drone flight state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({...s,camera:fpv?'fpv':'chase'})},{name:'set_flight_pause',description:'Pause or resume the simulated drone flight.',inputSchema:{type:'object',properties:{paused:{type:'boolean'}},required:['paused'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(typeof input?.paused!=='boolean')throw Error('paused must be boolean');s.paused=input.paused||flightSelection.selector.isOpen||Boolean(precision.mission.active&&precision.mission.done);if(!s.paused&&!s.crashed)flightStarted=true;keys.clear();clearSticks();updateHUD();return{paused:s.paused}}}]){try{Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{})}catch{}}}

const language=document.createElement('select');language.id='languageSelect';language.setAttribute('aria-label','Language / 言語');language.innerHTML='<option value="en">English</option><option value="ja">日本語</option>';language.value=i18n.getLanguage();flightSelection.selector.element.querySelector('.selector-heading').prepend(language);language.onchange=()=>{i18n.setLanguage(language.value)};i18n.subscribe(()=>{language.value=i18n.getLanguage();i18n.apply();flightSelection.refreshLanguage?.();updateHUD()});i18n.apply();flightSelection.refreshLanguage();updateHUD();
