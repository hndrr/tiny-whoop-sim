import {i18n} from './i18n.mjs';
import {FLIGHT_HALF,REGIONS,nearestRegion,isOverWater,lowAltitudeWarning} from './world.mjs';
// Presentation only: no pause, input, camera, mission, selection or flight mutations.
// Call after base telemetry and before the precision mission's own HUD overrides.
export function localizeFlight(state,fpv,root=globalThis.document,started=false){
 const set=(id,text)=>{const node=root.getElementById(id);if(node&&node.textContent!==text)node.textContent=text};
 set('title',i18n.t(state.crashed?(state.ditched?'ditched':'crashed'):state.explore?'exploration':'disarmed'));
 set('eyebrow',state.crashed?i18n.t('flightTerminated'):state.explore?i18n.t('freeFlightArea'):'ANGLE / COASTAL 02');
 set('subtitle',state.crashed?i18n.t('resetToRearm'):state.explore?i18n.t(`region.${REGIONS[state.region].id}`):state.elapsed>0?i18n.t('flightPaused'):i18n.t('modeFree'));
 const action=i18n.t(state.crashed?'restart':!state.paused?'pauseFlight':started||state.elapsed>0?'resume':'startFlight');
 set('pause',action);const pause=root.getElementById('pause');pause?.setAttribute?.('title',i18n.t('actionShortcut',{action}));
 set('flightMode',state.paused||state.crashed?i18n.t('disarmed'):state.explore?i18n.t('exploration'):'ANGLE');
 const start=root.getElementById('start');if(start)start.innerHTML=state.crashed?i18n.t('restart'):`${i18n.t(started||state.elapsed>0?'resume':'startFlight')} <kbd>P</kbd>`;
 set('warning',Math.max(Math.abs(state.x),Math.abs(state.y))>FLIGHT_HALF-300?i18n.t('mapEdge'):lowAltitudeWarning(state)?i18n.t('lowAltitude'):'');
 set('distance',state.ringFlash?.some(value=>value>0)?i18n.t('ringPassed'):'');
 set('regionLabel',isOverWater(state.x,state.y)?i18n.t('openWater'):i18n.t(`region.${nearestRegion(state.x,state.y).id}`));
 set('camera',fpv?'CAM: FPV':i18n.getLanguage()==='ja'?'CAM: 追尾':'CAM: CHASE');
}
