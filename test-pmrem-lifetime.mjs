// Deterministic resource lifetime checks; no WebGL/GPU execution.
import assert from 'node:assert/strict';
import {createSkyEnvironment} from './dist/surface-materials.mjs';

function probe({failAt=Infinity,failCompile=false,xr=true,autoClear=true}={}){
 const previous={name:'caller-owned render target'};
 let current=previous,face=2,level=3,renderCalls=0;
 const targets=new Map(),sources=new Map();
 const renderer={
  extensions:{has:()=>true},xr:{enabled:xr},autoClear,
  compile(){if(failCompile)throw Error('Synthetic constructor compile failure')},
  getRenderTarget:()=>current,getActiveCubeFace:()=>face,getActiveMipmapLevel:()=>level,
  setRenderTarget(target,nextFace=0,nextLevel=0){
   assert.equal(this,renderer,'wrapped renderer method preserves its receiver');
   current=target;face=nextFace;level=nextLevel;
   if(target?.isWebGLRenderTarget&&!targets.has(target)){
    const record={disposals:0};targets.set(target,record);
    target.addEventListener('dispose',()=>record.disposals++);
   }
  },
  render(mesh){
   assert.equal(this,renderer,'render runs on the real renderer');
   const source=mesh.material.uniforms?.envMap?.value;
   if(source?.isDataTexture&&!sources.has(source)){
    const record={disposals:0};sources.set(source,record);
    source.addEventListener('dispose',()=>record.disposals++);
   }
   if(++renderCalls===failAt)throw Error(`Synthetic PMREM render failure ${failAt}`);
  }
 };
 const setTarget=renderer.setRenderTarget;
 const result=createSkyEnvironment(renderer);
 assert.equal(renderer.setRenderTarget,setTarget,'original renderer method restored');
 assert.equal(current,previous,'caller target restored');
 assert.equal(face,2,'caller cube face restored');
 assert.equal(level,3,'caller mip level restored');
 assert.equal(renderer.xr.enabled,xr,'caller XR state restored');
 assert.equal(renderer.autoClear,autoClear,'caller autoClear restored');
 for(const record of sources.values())assert.equal(record.disposals,1,'source disposed exactly once');
 return {result,targets,sources,renderCalls};
}

// Successful generation keeps only its result target alive.
const success=probe();
assert(success.result?.isWebGLRenderTarget);
assert.equal(success.targets.size,2,'one result and one temporary ping-pong target');
assert.equal(success.result.width,336);
assert.equal(success.result.height,256);
assert.equal(success.result.depthBuffer,false);
assert.equal(success.result.texture.generateMipmaps,false);
for(const [target,record] of success.targets)
 assert.equal(record.disposals,target===success.result?0:1);
assert.equal(success.sources.size,1);
const source=[...success.sources.keys()][0],pixels=source.image.data;
assert(pixels[(source.image.height-1)*source.image.width*4+2]>pixels[2],
 'v=1 / +Y is the blue sky pole for an unflipped DataTexture');
success.result.dispose();
assert.equal(success.targets.get(success.result).disposals,1,'caller owns successful result');

// Constructor failure and every actual render stage must be safe fallbacks.
assert.equal(probe({failCompile:true}).result,null);
for(let failAt=1;failAt<=success.renderCalls;failAt++){
 const failed=probe({failAt});
 assert.equal(failed.result,null,`render ${failAt} falls back`);
 for(const record of failed.targets.values())
  assert.equal(record.disposals,1,`render ${failAt} disposes every captured target exactly once`);
}

// Preserve disabled initial states too, and permit repeated independent calls.
for(const config of [{xr:false,autoClear:false},{xr:false,autoClear:true},{xr:true,autoClear:false}]){
 const run=probe(config);assert(run.result);run.result.dispose();
 const failed=probe({...config,failAt:2});assert.equal(failed.result,null);
 for(const record of failed.targets.values())assert.equal(record.disposals,1);
}
assert.equal(createSkyEnvironment({extensions:{has:()=>false}}),null);
console.log(`PASS: PMREM success ownership, constructor failure, all ${success.renderCalls} render failure stages, exact temporary disposal and renderer-state restoration (stubbed renderer, no GPU validation)`);
