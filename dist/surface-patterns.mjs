// Original deterministic periodic surface artwork; no third-party assets.
export const SIZE=256;
const mix=(a,b,t)=>a+(b-a)*t, smooth=t=>t*t*(3-2*t), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(x,y,seed){let h=Math.imul(x+seed,374761393)^Math.imul(y+seed,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295}
function noise(u,v,n,seed){return noiseXY(u,v,n,n,seed)}
// Anisotropic periodic value noise: streaks and grain run along one axis.
function noiseXY(u,v,nx,ny,seed){const x=u*nx,y=v*ny,ix=Math.floor(x),iy=Math.floor(y),wx=a=>(a%nx+nx)%nx,wy=a=>(a%ny+ny)%ny;return mix(mix(hash(wx(ix),wy(iy),seed),hash(wx(ix+1),wy(iy),seed),smooth(x-ix)),mix(hash(wx(ix),wy(iy+1),seed),hash(wx(ix+1),wy(iy+1),seed),smooth(x-ix)),smooth(y-iy))}
export function sample(kind,u,v){
 const broad=noise(u,v,4,9),grain=noise(u,v,64,32),fine=noise(u,v,128,71),mid=noise(u,v,16,13);
 if(kind==='asphalt'){
  const fleck=Math.pow(fine,5),height=clamp(.46+(grain-.5)*.28+(mid-.5)*.12,0,1);
  const tone=65+(broad-.5)*13+(grain-.5)*22+fleck*35;
  return {rgb:[tone*.97,tone,tone*1.015],surface:clamp(.85+(height-.5)*.3,0,1)};
 }
 if(kind==='corrugated'){
  // Painted cladding: 16 ribs per tile, faint vertical rain streaks and
  // patchy chalking. Ribs live mostly in the height channel for bump.
  const rib=.5+.5*Math.cos(u*Math.PI*2*16),streak=noiseXY(u,v,48,3,5),chalk=noise(u,v,8,27);
  const tone=238-(1-rib)*16-Math.pow(streak,3)*26+(chalk-.5)*14+(grain-.5)*6;
  return {rgb:[tone,tone*.995,tone*.985],surface:clamp(.42+rib*.5+(grain-.5)*.06,0,1)};
 }
 if(kind==='planks'){
  // Crate boards: six boards per tile with dark joints, per-board tone and
  // grain running along the board.
  const row=v*6,within=row-Math.floor(row),board=Math.floor(row)%6,edge=Math.min(within,1-within),joint=smooth(clamp(edge/.06,0,1));
  const along=noiseXY(u,v,4,48,41+board),knot=Math.pow(noiseXY(u,v,12,24,63),9),shade=hash(board,3,17);
  const tone=(212+(shade-.5)*34+(along-.5)*24-knot*60)*(.62+.38*joint);
  return {rgb:[tone*1.04,tone,tone*.9],surface:clamp(.3+.6*joint+(along-.5)*.1,0,1)};
 }
 if(kind!=='concrete')throw Error('Unknown surface');
 const pores=Math.pow(1-fine,7),tone=164+(broad-.5)*18+(mid-.5)*9+(grain-.5)*9-pores*70;
 return {rgb:[tone*1.025,tone*1.01,tone*.955],surface:clamp(.84+(grain-.5)*.15-pores*.22,0,1)};
}
export function pixels(kind,data=false,size=SIZE){const bytes=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const s=sample(kind,x/size,y/size),rgb=data?Array(3).fill(s.surface*255):s.rgb;const o=(y*size+x)*4;for(let k=0;k<3;k++)bytes[o+k]=Math.round(clamp(rgb[k],0,255));bytes[o+3]=255}return bytes}
// Mean linear albedo of a generated map, so a material colour can be divided
// by it and keep its authored average brightness under the new detail.
export function meanLinearAlbedo(bytes){const linear=c=>{c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)};let sum=0;for(let i=0;i<bytes.length;i+=4)sum+=.2126*linear(bytes[i])+.7152*linear(bytes[i+1])+.0722*linear(bytes[i+2]);return sum/(bytes.length/4)}
