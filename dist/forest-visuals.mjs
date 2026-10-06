import * as T from './vendor/three.module.min.js';

// Original authored, opaque geometry. No image downloads, alpha overdraw or
// new collision volumes: the forest remains decorative, as in the base world.
export const FOREST_BUDGET = Object.freeze({count:700,maxDrawCalls:12,maxTrianglesPerTree:160,lodDistance:650,hysteresis:65});
const hash = n => {n=Math.imul(n ^ (n>>>16),0x45d9f3b);n=Math.imul(n ^ (n>>>16),0x45d9f3b);return ((n ^ (n>>>16))>>>0)/4294967296;};

export function forestRecords(random,terrainHeight,nearestRegion,count=700){
  return Array.from({length:count},(_,i)=>{
    // Exactly three calls, in the same order as the legacy loop. Do not use
    // this stream for tint, rotation or silhouette variation.
    let x=(random()-.5)*3500,y=200+random()*2900;
    const region=nearestRegion(x,y);if(region.distance<region.radius+30)x+=300;
    const z=terrainHeight(x,y),scale=.7+random()*.7;
    const patch=Math.sin(x*.006+y*.002)+Math.cos(y*.008-x*.001);
    const species=patch>.65?0:patch<-.5?1:2;
    return {x,y,z,scale,species,rotation:hash(i+131)*Math.PI*2,tint:.88+hash(i+718)*.22};
  });
}

// Polygonal crown envelopes with several overlapping branch masses rather
// than a single cone. Lower faces are deliberately darker, sunlit tips warmer.
function crownGeometry(species,detail){
  const positions=[],colors=[],uvs=[];
  const base=new T.Color(['#52613f','#3d5945','#606846'][species]);
  function triangle(a,b,c,uv){
    uvs.push(...uv.flat());
    for(const v of [a,b,c]){
      positions.push(...v);
      const light=.69+.30*(v[2]+8.5)/17+.055*Math.sin(v[0]*1.9+v[1]*.7);
      colors.push(base.r*light,base.g*light,base.b*light);
    }
  }
  function mass(cx,cy,cz,rx,ry,rz,phase){
    const sides=detail?7:5,rings=4,rows=[];
    for(let j=0;j<=rings;j++){
      const latitude=Math.PI*j/rings,row=[];
      for(let k=0;k<=sides;k++){
        const a=k/sides*Math.PI*2+phase;
        const irregular=1+.10*Math.sin(a*3+phase)+.055*Math.cos(a*5-phase);
        row.push([cx+Math.sin(latitude)*Math.cos(a)*rx*irregular,cy+Math.sin(latitude)*Math.sin(a)*ry*irregular,cz+Math.cos(latitude)*rz]);
      }
      rows.push(row);
    }
    for(let j=0;j<rings;j++)for(let k=0;k<sides;k++){
      const n=k+1,u=2*k/sides,un=2*n/sides,v=1-j/rings,vn=1-(j+1)/rings;
      // Duplicate the closed seam at U=0/2. Two mirrored spans make both
      // sides sample the same edge even for a non-periodic painted image.
      if(j>0)triangle(rows[j][k],rows[j+1][k],rows[j][n],[[u,v],[j===rings-1?(u+un)/2:u,vn],[un,v]]);
      if(j<rings-1)triangle(rows[j][n],rows[j+1][k],rows[j+1][n],[[j===0?(u+un)/2:un,v],[u,vn],[un,vn]]);
    }
  }
  function tier(z,r,h,phase){
    const sides=detail?10:6;
    const tip=[Math.cos(phase)*.35,Math.sin(phase)*.35,z+h];
    for(let k=0;k<sides;k++){
      const point=j=>{const a=j/sides*Math.PI*2+phase;const rr=r*(1+.09*Math.sin(a*3));return [Math.cos(a)*rr,Math.sin(a)*rr,z+.24*Math.sin(a*3)];};
      const a=point(k),b=point(k+1),u=2*k/sides,un=2*(k+1)/sides;
      triangle(a,b,tip,[[u,0],[un,0],[(u+un)/2,1]]);
      triangle(b,a,[0,0,z+.35],[[un,0],[u,0],[(u+un)/2,.2]]);
    }
  }
  if(species===1){tier(-8,4.3,8.2,.1);tier(-3.9,3.6,7.5,.5);tier(.3,2.55,8.2,.2);}
  else if(species===0){
    mass(-1.8,.3,-1.4,2.75,3.1,4.9,.2);mass(1.7,.7,-.4,2.7,3.0,5.8,.6);
    mass(.1,-1.3,1.4,3.3,2.8,7.1,.1);
  }else{
    mass(-1.6,-.9,.3,2.9,2.5,5.8,.6);mass(1.7,.5,1.4,2.8,3.0,6.7,.2);
    mass(-.2,1.3,-2.0,3.2,2.7,5.8,.7);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

export function createForestVisuals({random,terrainHeight,nearestRegion,count=700}){
  const records=forestRecords(random,terrainHeight,nearestRegion,count),group=new T.Group();group.name='authored-forest';
  const canopyMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1});
  const barkMaterial=new T.MeshStandardMaterial({color:'#655c49',roughness:1});
  const trunkGeometry=new T.CylinderGeometry(.6,.9,8,5).rotateX(Math.PI/2);
  // Cylinder V remains root-to-tip after its +Z rotation; use two mirrored
  // U spans around the trunk as for crown masses.
  const barkUV=trunkGeometry.attributes.uv;for(let i=0;i<barkUV.count;i++)barkUV.setX(i,barkUV.getX(i)*2);
  const batches=[],fallbackColors=new Map();
  for(let species=0;species<3;species++)for(let detail=0;detail<2;detail++){
    const capacity=records.filter(r=>r.species===species).length;
    const crowns=new T.InstancedMesh(crownGeometry(species,detail),canopyMaterial,capacity);
    const trunks=new T.InstancedMesh(trunkGeometry,barkMaterial,capacity);
    for(const mesh of [crowns,trunks]){mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.receiveShadow=true;mesh.castShadow=false;mesh.name=`forest-${species}-${detail}-${mesh===crowns?'crown':'trunk'}`;group.add(mesh);}
    fallbackColors.set(crowns.geometry,new Float32Array(crowns.geometry.attributes.color.array));
    batches.push({species,detail,crowns,trunks});
  }
  const dummy=new T.Object3D(),color=new T.Color(),levels=new Uint8Array(count);
  let lastX=Infinity,lastY=Infinity,lastZ=Infinity,disposed=false;
  function update(position,force=false){
    if(disposed)return;
    if(!force&&Math.hypot(position.x-lastX,position.y-lastY,position.z-lastZ)<12)return;
    lastX=position.x;lastY=position.y;lastZ=position.z;
    for(let i=0;i<count;i++){
      const r=records[i],distance=Math.hypot(r.x-lastX,r.y-lastY,r.z+13-lastZ);
      const threshold=FOREST_BUDGET.lodDistance+(levels[i]?FOREST_BUDGET.hysteresis:-FOREST_BUDGET.hysteresis);
      levels[i]=distance<threshold?1:0;
    }
    for(const batch of batches){let n=0;
      for(let i=0;i<count;i++){
        const r=records[i];if(r.species!==batch.species||levels[i]!==batch.detail)continue;
        dummy.rotation.set(0,0,r.rotation);
        const trunkHeight=13+2*r.scale;dummy.scale.set(r.scale,r.scale,trunkHeight/8);
        // Ground the original trunk footprint. Old center offset floated small
        // trunks and buried large ones; crown center and total scale stay fixed.
        dummy.position.set(r.x,r.y,r.z+trunkHeight/2);dummy.updateMatrix();batch.trunks.setMatrixAt(n,dummy.matrix);
        dummy.scale.setScalar(r.scale);dummy.position.z=r.z+13;dummy.updateMatrix();batch.crowns.setMatrixAt(n,dummy.matrix);
        color.setRGB(r.tint,r.tint,r.tint);batch.crowns.setColorAt(n,color);n++;
      }
      for(const mesh of [batch.trunks,batch.crowns]){mesh.count=n;mesh.visible=n>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();}
    }
  }
  update({x:0,y:0,z:0},true);
  // Maps are caller-owned and shared across every LOD/species. Passing null
  // restores the original opaque vertex-color/bark fallback independently.
  function applyPaintedTextures({foliage=null,bark=null}={}){
    if(disposed)return;
    canopyMaterial.map=foliage;barkMaterial.map=bark;
    canopyMaterial.needsUpdate=true;barkMaterial.needsUpdate=true;
    barkMaterial.color.set(bark?'#ffffff':'#655c49');
    const tints=[[.98,1,.94],[.94,1,.97],[1,.99,.93]];
    for(const {crowns,species} of batches){
      const geometry=crowns.geometry,color=geometry.attributes.color,positions=geometry.attributes.position;
      if(!foliage)color.array.set(fallbackColors.get(geometry));
      else for(let i=0;i<color.count;i++){
        const light=.83+.15*(positions.getZ(i)+8.5)/17;
        color.setXYZ(i,...tints[species].map(c=>c*light));
      }
      color.needsUpdate=true;
    }
  }
  function dispose(){if(disposed)return;disposed=true;for(const b of batches){b.crowns.geometry.dispose();b.crowns.dispose();b.trunks.dispose();}trunkGeometry.dispose();canopyMaterial.dispose();barkMaterial.dispose();group.removeFromParent();group.clear();fallbackColors.clear();}
  return {group,records,batches,update,applyPaintedTextures,dispose};
}
