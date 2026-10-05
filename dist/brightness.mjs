export const BRIGHTNESS_DEFAULT=100,BRIGHTNESS_MIN=60,BRIGHTNESS_MAX=180;
const STORAGE_KEY='skyward.brightness.v1';
export function normalizeBrightness(value){
 if(typeof value!=='number'||!Number.isFinite(value))return BRIGHTNESS_DEFAULT;
 return Math.max(BRIGHTNESS_MIN,Math.min(BRIGHTNESS_MAX,Math.round(value)));
}
export function loadBrightness(storage){
 try{return normalizeBrightness(JSON.parse(storage.getItem(STORAGE_KEY)||'null'))}catch{return BRIGHTNESS_DEFAULT}
}
export function saveBrightness(storage,value){try{storage.setItem(STORAGE_KEY,JSON.stringify(normalizeBrightness(value)))}catch{/* Flight works without browser storage. */}}
export function bindBrightness(root,uniform){
 let storage;try{storage=globalThis.localStorage}catch{/* Private browser policy. */}
 const slider=root.getElementById('brightnessSlider'),value=root.getElementById('brightnessValue'),reset=root.getElementById('brightnessReset');
 slider.min=String(BRIGHTNESS_MIN);slider.max=String(BRIGHTNESS_MAX);slider.step='1';
 function apply(next,persist=false){
  const amount=normalizeBrightness(next);slider.value=String(amount);value.textContent=`${amount}%`;slider.setAttribute('aria-valuetext',`${amount} percent`);
  // Feed-only postprocess gain leaves HTML telemetry and controls unchanged.
  uniform.value=amount/100;
  if(persist)saveBrightness(storage,amount);
 }
 slider.addEventListener('input',()=>apply(Number(slider.value),true));
 // Pointer edits return keyboard control to flight; keyboard-focused range edits
 // retain native arrow-key adjustment and their focus.
 for(const type of ['pointerup','pointercancel'])slider.addEventListener(type,()=>slider.blur());
 reset.addEventListener('click',event=>{apply(BRIGHTNESS_DEFAULT,true);if(event.detail>0)reset.blur()});
 apply(loadBrightness(storage));
}
