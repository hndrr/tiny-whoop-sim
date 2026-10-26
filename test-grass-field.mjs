import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {GRASS_FIELD,footprintIndex,boxFootprint,cellsInRange,maxCells,cellBlades,tuftGeometry,createGrassField} from './dist/grass-field.mjs';
import {terrainHeight,WORLD_OBJECTS} from './dist/world.mjs';
import {createTerrainGeometry,renderedTerrainSurface} from './dist/terrain-visuals.mjs';
import {SOLIDS} from './dist/stage.mjs';
import {QUALITY_LEVELS} from './dist/render-quality.mjs';
// Footprints: inclusive rectangles across grid cells, margins honoured.
const inside=footprintIndex([boxFootprint([0,0,0],[10,4,1],.5),[100,100,170,104]]);
assert(inside(5.4,0)&&inside(-5.4,2.4)&&!inside(5.6,0)&&inside(150,102)&&!inside(150,99));
// Cells: nearest first, all within reach, and the slot pool covers any position.
const cells=cellsInRange(3,-7);assert(cells.every((c,i)=>i===0||c.d>=cells[i-1].d));assert(cells.every(c=>c.d<=GRASS_FIELD.radius+GRASS_FIELD.cell*.7072));
for(const [x,y] of [[0,0],[7.9,8.1],[-15.99,3.2],[1000.5,-77]])assert(cellsInRange(x,y).length<=maxCells());
// Placement: deterministic, inside its cell, bare on paving, beach, rock and stone.
const flat=()=>1,a=cellBlades(4,-2,80,{terrainHeight:flat}),b=cellBlades(4,-2,80,{terrainHeight:flat});assert.deepEqual(a,b);
const placed=a.filter(Boolean);assert(placed.length>20&&placed.length<80,'meadow clumps thin some tufts');
for(const p of placed){assert(p[0]>=64&&p[0]<=80&&p[1]>=-32&&p[1]<=-16);assert.equal(p[2],1)}
// Consecutive blades are not on a line (a weak hash put them diagonally).
{const xs=placed.map(p=>p[0]),ys=placed.map(p=>p[1]),mx=xs.reduce((s,v)=>s+v)/xs.length,my=ys.reduce((s,v)=>s+v)/ys.length;let sxy=0,sxx=0,syy=0;xs.forEach((x,i)=>{sxy+=(x-mx)*(ys[i]-my);sxx+=(x-mx)**2;syy+=(ys[i]-my)**2});assert(Math.abs(sxy/Math.sqrt(sxx*syy))<.4)}
assert(cellBlades(4,-2,80,{terrainHeight:flat,exclude:()=>true}).every(v=>v===null),'paved');
assert(cellBlades(4,-2,80,{terrainHeight:()=>-2}).every(v=>v===null),'beach and sea');
assert(cellBlades(4,-2,80,{terrainHeight:()=>260}).every(v=>v===null),'high stone');
assert(cellBlades(4,-2,80,{terrainHeight:(x)=>x*.8}).every(v=>v===null),'steep rock');
// Real world: nothing on the runway or in the hangars; plenty in the airfield meadow.
const exclude=footprintIndex([boxFootprint([5,25,0],[23,125,.05],.4),...[...SOLIDS,...WORLD_OBJECTS].map(o=>boxFootprint(o.position,o.size,.6))]);
let meadow=0;for(const c of cellsInRange(-30,20,{radius:40}))for(const p of cellBlades(c.i,c.j,40,{terrainHeight,exclude}))if(p){assert(!exclude(p[0],p[1]));meadow++}
assert(meadow>300,`airfield meadow has grass (${meadow})`);
// Grass stands on the drawn near mesh, not the analytic field: raycast real
// patches (including edges and a curved hillside) against renderedTerrainSurface.
{const down=new T.Vector3(0,0,-1),ray=new T.Raycaster(),hits=[];let worst=0,analyticGap=0;
 for(const [cx,cy] of [[250,-250],[250,250],[-750,1250],[1750,-250]]){const mesh=new T.Mesh(createTerrainGeometry(cx,cy,24),new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.position.set(cx,cy,0);mesh.updateMatrixWorld();
  for(let n=0;n<160;n++){const x=cx-249.5+((n*37)%160)/160*499,y=cy-249.5+((n*91)%157)/157*499;ray.set(new T.Vector3(x,y,2000),down);const hit=ray.intersectObject(mesh)[0];if(!hit)continue;hits.push(1);
   worst=Math.max(worst,Math.abs(hit.point.z-renderedTerrainSurface(x,y).z));analyticGap=Math.max(analyticGap,Math.abs(hit.point.z-terrainHeight(x,y)))}
  mesh.geometry.dispose()}
 assert(hits.length>600);assert(worst<1e-3,`rendered surface matches the float32 mesh (${worst})`);assert(analyticGap>1,'the analytic field alone would float or bury tufts');
 const reported=renderedTerrainSurface(297.37314,-0.05495);assert(Math.abs(reported.z-54.14084)<1e-4,'review case: root on the drawn ground, not 13.8 m above it');
 assert(cellBlades(18,-1,400,{surface:renderedTerrainSurface}).filter(Boolean).every(b=>Math.abs(b[2]-renderedTerrainSurface(b[0],b[1]).z)<1e-9));
 // Slope comes from the drawn triangle; the steep review-case face is left bare.
 assert(reported.slope>GRASS_FIELD.maxSlope);}
// Tuft: several fanned blades, same vertex layout, still upright for the wind bend.
const blade=new T.PlaneGeometry(.08,.42,1,2);blade.translate(0,.21,0);blade.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(blade.attributes.position.count*3).fill(1),3));blade.rotateX(Math.PI/2);
const tuft=tuftGeometry(blade);assert.equal(tuft.attributes.position.count,blade.attributes.position.count*4);assert.equal(tuft.index.count,blade.index.count*4);assert(tuft.attributes.color);
tuft.computeBoundingBox();assert(tuft.boundingBox.max.z<=.43&&tuft.boundingBox.min.z>=-.02,"roots stay at the ground");
// Field: one draw, fills a few cells per frame, recycles slots, hides high up, density follows quality.
const field=createGrassField({geometry:tuft,material:new T.MeshLambertMaterial(),terrainHeight:flat});
assert.equal(field.mesh.count,field.slots*field.perCell);assert(field.mesh.count<=GRASS_FIELD.capacity);assert.equal(field.mesh.frustumCulled,false);
const pos=new T.Vector3(0,0,3);field.update(pos);assert.equal(field.cells,GRASS_FIELD.fillPerFrame);for(let i=0;i<40;i++)field.update(pos);const full=field.cells;assert.equal(full,cellsInRange(0,0).length);
pos.set(400,0,3);for(let i=0;i<40;i++)field.update(pos);assert.equal(field.cells,cellsInRange(400,0).length,'slots recycled after relocation');
pos.z=1+GRASS_FIELD.hideAbove+1;field.update(pos);assert.equal(field.mesh.visible,false);pos.z=3;field.update(pos);assert(field.mesh.visible);
const nonzero=()=>{let n=0;const m=field.mesh.instanceMatrix.array;for(let i=0;i<field.mesh.count;i++)if(m[i*16]||m[i*16+1]||m[i*16+2])n++;return n};
const dense=nonzero(),drawn=field.drawn;field.setDensity(QUALITY_LEVELS.at(-1).grass);for(let i=0;i<40;i++)field.update(pos);assert(nonzero()<dense*.45,'low quality thins the meadow');assert(field.drawn<drawn*.4&&field.drawn===field.mesh.count,'and draws fewer instances');
field.setDensity(1);for(let i=0;i<40;i++)field.update(pos);assert.equal(field.drawn,drawn);assert(Math.abs(nonzero()-dense)<=dense*.02,'restores the same meadow');
for(let i=1;i<QUALITY_LEVELS.length;i++)assert(QUALITY_LEVELS[i].grass<=QUALITY_LEVELS[i-1].grass);
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
assert(main.includes('grassField.update(camera.position)')&&main.includes('grassField.setDensity(level.grass)')&&main.includes('surface:renderedTerrainSurface,'));
assert(main.indexOf('const grassField=')<main.indexOf('const renderQuality='),'exists before the first quality apply');
console.log('PASS: footprint index, nearest-first cells within reach, deterministic hashed tufts, bare paving/beach/rock/stone, airfield meadow coverage, tuft geometry, slot recycling, altitude hide, quality density');
console.log('CPU checks only; the look and GPU cost of the meadow need browser/device verification.');
