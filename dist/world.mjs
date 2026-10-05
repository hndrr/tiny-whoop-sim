export const WORLD_SIZE=8000;
export const WORLD_HALF=WORLD_SIZE/2;
export const SEA_LEVEL=-2.4;
export const REGIONS=[
 {id:'airfield',label:'AIRFIELD',x:0,y:0,radius:190},
 {id:'harbor',label:'EAST HARBOR',x:1800,y:-120,radius:150},
 {id:'viaduct',label:'RIDGE VIADUCT',x:-900,y:1100,radius:140},
 {id:'village',label:'HILL SETTLEMENT',x:650,y:1550,radius:180},
 {id:'quarry',label:'NORTH QUARRY',x:-450,y:2400,radius:200},
 {id:'lighthouse',label:'LIGHTHOUSE POINT',x:-1850,y:250,radius:90},
 {id:'windfarm',label:'WEST WIND RIDGE',x:-1550,y:1850,radius:170}
];
const QUARRY_INDEX=REGIONS.findIndex(region=>region.id==='quarry');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
function naturalHeight(x,y){
 const coast=Math.min(1950+250*Math.sin(y/650)-Math.abs(x+260*Math.sin(y/1100)),y+410+110*Math.sin(x/400),3400-y);
 const inland=smooth(coast/340);
 const ridge=300*Math.exp(-((x+750)**2/700000+(y-1500)**2/2200000))+220*Math.exp(-((x-850)**2/1400000+(y-2200)**2/900000));
 const erosion=30*Math.sin(x*.003+y*.001)*Math.cos(y*.004)+12*Math.sin(x*.009-y*.006);
 return -9+inland*(25+ridge+erosion);
}
export const REGION_ELEVATIONS=REGIONS.map(r=>r.id==='airfield'?0:r.id==='harbor'?2:r.id==='lighthouse'?3:Math.max(2,naturalHeight(r.x,r.y)));
export function terrainHeight(x,y){let h=naturalHeight(x,y);for(let i=0;i<REGIONS.length;i++){const r=REGIONS[i],d=Math.hypot(x-r.x,y-r.y);if(d<r.radius+110)h=h+(REGION_ELEVATIONS[i]-h)*(1-smooth((d-r.radius)/110))}const q=REGIONS[QUARRY_INDEX];h-=32*(1-smooth(Math.hypot(x-q.x,y-q.y)/115));return h}
export function groundHeight(x,y){return Math.max(SEA_LEVEL,terrainHeight(x,y))}
export function nearestRegion(x,y){let best=REGIONS[0],distance=Infinity;for(const r of REGIONS){const d=Math.hypot(x-r.x,y-r.y);if(d<distance){best=r;distance=d}}return {...best,distance}}
// Gentle spring return near the outer chart edge, never a boundary-triggered crash.
export function boundaryAcceleration(x,y){const onset=WORLD_HALF-300;return [Math.abs(x)>onset?-Math.sign(x)*(Math.abs(x)-onset)*.09:0,Math.abs(y)>onset?-Math.sign(y)*(Math.abs(y)-onset)*.09:0]}
export const WORLD_OBJECTS=[];
const add=(region,position,size,material,shape='box')=>{const r=REGIONS[region];WORLD_OBJECTS.push({region,position:[position[0]+r.x,position[1]+r.y,position[2]+REGION_ELEVATIONS[region]],size,material,shape})};
// Harbor: piers, warehouses, containers and three gantry cranes.
for(const y of [-45,0,45]){add(1,[25,y,1],[150,12,2],'floor');for(const x of [-40,10,60])add(1,[x,y,-2],[2,2,7],'steel');}
for(let i=0;i<12;i++)add(1,[-55+(i%4)*14,-58+Math.floor(i/4)*20,2],[11,5,4],i%2?'container':'roof');
for(const y of [-35,35]){for(const x of [-5,20])add(1,[x,y,19],[1.2,1.2,38],'steel');add(1,[7.5,y,37],[38,1.8,2],'yellow');add(1,[7.5,y,40],[1,34,1],'steel');}
// Viaduct: a long deck on widely spaced piers; each bay is flyable.
add(2,[0,0,31],[250,16,2],'floor');for(let x=-110;x<=110;x+=36){for(const y of [-5,5])add(2,[x,y,15],[3.5,3.5,30],'wall');add(2,[x,0,29],[5,17,2],'steel')}
for(const y of [-7.7,7.7])add(2,[0,y,33],[250,.25,1.8],'steel');
// Settlement: open doorways and lit service courts between six houses.
for(let i=0;i<6;i++){const x=(i%3)*32-32,y=Math.floor(i/3)*38-19,w=18,d=16,h=6;add(3,[x,y,-.1],[w,d,.2],'floor');for(const sx of [-1,1])add(3,[x+sx*w/2,y,h/2],[.25,d,h],'wall');add(3,[x,y+d/2,h/2],[w,.25,h],'wall');for(const sx of [-1,1])add(3,[x+sx*5.5,y-d/2,h/2],[7,.25,h],'wall');add(3,[x,y-d/2,4.6],[4,.25,2.8],'wall');add(3,[x,y,h+.15],[w+1,d+1,.3],'roof');}
// Quarry works: processing frame, spoil stacks and service sheds.
for(const x of [-90,-65]){const r=REGIONS[QUARRY_INDEX],halfWidth=.7,top=REGION_ELEVATIONS[QUARRY_INDEX]+26;const bottom=Math.min(...[-halfWidth,halfWidth].flatMap(dx=>[-halfWidth,halfWidth].map(dy=>terrainHeight(r.x+x+dx,r.y+dy))))-.15;const height=top-bottom;add(QUARRY_INDEX,[x,0,(top+bottom)/2-REGION_ELEVATIONS[QUARRY_INDEX]],[1.4,1.4,height],'steel')}add(QUARRY_INDEX,[-77.5,0,25],[40,14,2],'roof');for(let i=0;i<7;i++)add(QUARRY_INDEX,[-80+i*25,125,3],[13,7,6],i%2?'crate':'container');
// Lighthouse point and service hut. Cylindrical surfaces use conservative box collision.
add(5,[0,0,20],[7,7,40],'wall','cylinder');add(5,[0,0,41],[10,10,3],'glass','cylinder');add(5,[0,0,43],[12,12,.8],'roof','cylinder');add(5,[16,14,2.5],[14,10,5],'wall');
// Turbine ridge: slender towers spread across the hillside.
for(const [x,y] of [[-90,-60],[0,0],[95,60]]){add(6,[x,y,35],[3,3,70],'wall','cylinder');add(6,[x,y,71],[5,9,4],'roof');}

export function regionSpawn(index){const r=REGIONS[index];if(!r)throw Error('Unknown area');const offsets=[[0,0],[-100,-90],[0,-55],[0,-85],[0,0],[35,-25],[0,-75]],o=offsets[index],x=r.x+o[0],y=r.y+o[1];return [x,y,groundHeight(x,y)+7]}

export function surfaceClearance(x,y,z){return Math.max(0,z-groundHeight(x,y))}
export function lowAltitudeWarning(state){return !state.paused&&!state.crashed&&surfaceClearance(state.x,state.y,state.z)<.35}
