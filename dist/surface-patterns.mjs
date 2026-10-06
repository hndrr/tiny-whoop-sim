// Original deterministic periodic surface artwork; no third-party assets.
export const SIZE=256;
const mix=(a,b,t)=>a+(b-a)*t, smooth=t=>t*t*(3-2*t), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(x,y,seed){let h=Math.imul(x+seed,374761393)^Math.imul(y+seed,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295}
function noise(u,v,n,seed){const x=u*n,y=v*n,ix=Math.floor(x),iy=Math.floor(y),wrap=a=>(a%n+n)%n;return mix(mix(hash(wrap(ix),wrap(iy),seed),hash(wrap(ix+1),wrap(iy),seed),smooth(x-ix)),mix(hash(wrap(ix),wrap(iy+1),seed),hash(wrap(ix+1),wrap(iy+1),seed),smooth(x-ix)),smooth(y-iy))}
export function sample(kind,u,v){
 const broad=noise(u,v,4,9),grain=noise(u,v,64,32),fine=noise(u,v,128,71),mid=noise(u,v,16,13);
 if(kind==='asphalt'){
  const fleck=Math.pow(fine,5),height=clamp(.46+(grain-.5)*.28+(mid-.5)*.12,0,1);
  const tone=65+(broad-.5)*13+(grain-.5)*22+fleck*35;
  return {rgb:[tone*.97,tone,tone*1.015],surface:clamp(.85+(height-.5)*.3,0,1)};
 }
 if(kind!=='concrete')throw Error('Unknown surface');
 const pores=Math.pow(1-fine,7),tone=164+(broad-.5)*18+(mid-.5)*9+(grain-.5)*9-pores*70;
 return {rgb:[tone*1.025,tone*1.01,tone*.955],surface:clamp(.84+(grain-.5)*.15-pores*.22,0,1)};
}
export function pixels(kind,data=false){const bytes=new Uint8Array(SIZE*SIZE*4);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const s=sample(kind,x/SIZE,y/SIZE),rgb=data?Array(3).fill(s.surface*255):s.rgb;const o=(y*SIZE+x)*4;for(let k=0;k<3;k++)bytes[o+k]=Math.round(clamp(rgb[k],0,255));bytes[o+3]=255}return bytes}
