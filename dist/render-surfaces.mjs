import * as T from './vendor/three.module.min.js';
import {terrainHeight,WORLD_OBJECTS} from './world.mjs';

// Render-only repairs for surfaces that were coplanar with (or buried under)
// terrain. Collision records are never changed. Indoor floors sit above paving,
// so the west access strip cannot compete with its overlapping hangar floor.
export const SURFACE_LAYERS=Object.freeze({paving:.006,floor:.018,cover:.02});
export function groundSlabPlacement(position,size,{indoor=false}={}){
 const [x,y,z]=position,[w,d,h]=size,top=z+h/2;
 const heights=[[0,0],[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]].map(([dx,dy])=>terrainHeight(x+dx,y+dy));
 const low=Math.min(...heights),high=Math.max(...heights);
 // Only an authored, flat ground slab: elevated decks and sloping terrain keep
 // their original geometry, as do runway surfaces already clear of the ground.
 if(high-low>1e-5||top<high-.1||top>high+.001)return {position,size};
 const lift=high+(indoor?SURFACE_LAYERS.floor:SURFACE_LAYERS.paving)-top;
 return {position:[x,y,z+lift/2],size:[w,d,h+lift]};
}

// Supports sometimes extend exactly through their cap's top face. Shorten
// only their render mesh by 2 cm, keeping the base, footprint and collision.
export function coveredSupportPlacement(object,objects=WORLD_OBJECTS){
 const {position,size,material,shape='box'}=object;
 if(shape!=='box'||!['steel','wall'].includes(material))return {position,size};
 const top=position[2]+size[2]/2;
 const covered=objects.some(cap=>cap!==object&&(cap.shape||'box')==='box'&&['roof','yellow','floor'].includes(cap.material)&&cap.size[2]<size[2]&&Math.abs(cap.position[2]+cap.size[2]/2-top)<1e-6&&[0,1].every(axis=>Math.abs(cap.position[axis]-position[axis])+size[axis]/2<cap.size[axis]/2-1e-6));
 if(!covered)return {position,size};
 return {position:[position[0],position[1],position[2]-SURFACE_LAYERS.cover/2],size:[size[0],size[1],size[2]-SURFACE_LAYERS.cover]};
}

// Corrected ground slabs need only their exposed top. Keeping a vertical lip
// would introduce a new coplanar strip against the tunnel's open portal ends.
// Unit footprint and local Z=.5 match the original box's top-face transform.
export function groundSurfaceGeometry(size,tileMeters){
 const geometry=new T.PlaneGeometry(1,1);geometry.translate(0,0,.5);
 const uv=geometry.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*size[0]/tileMeters,uv.getY(i)*size[1]/tileMeters);
 return geometry;
}
