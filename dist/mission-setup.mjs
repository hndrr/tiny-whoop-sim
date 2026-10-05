import {i18n} from './i18n.mjs';
import {VEHICLES,getVehicle} from './vehicle-catalog.mjs';
// Preparation is reversible. Only the form's explicit start submits a selection.
export function createMissionSetup({state,getSelection,onLaunch,clearInputs,onCancel,mount=document.body}){
 const dialog=document.createElement('dialog');dialog.id='missionSetup';dialog.setAttribute('aria-labelledby','missionSetupTitle');
 dialog.innerHTML='<form><h2 id="missionSetupTitle" data-i18n="missionSetupTitle"></h2><p data-i18n="missionSetupSummary"></p><h3 data-i18n="approachTitle"></h3><p data-i18n="approachHint"></p><label for="missionAircraft" data-i18n="aircraft"></label><select id="missionAircraft"></select><p id="missionAircraftTrait"></p><p class="mission-input-tip" id="missionInputTip"></p><p class="mission-start-note" data-i18n="missionStartNote"></p><div class="mission-setup-actions"><button type="button" id="cancelMission" data-i18n="cancel"></button><button type="submit" id="launchMission" data-i18n="startMissionFlight"></button></div></form>';
 mount.append(dialog);
 const form=dialog.querySelector('form'),aircraft=dialog.querySelector('#missionAircraft');
 for(const vehicle of VEHICLES){const option=document.createElement('option');option.value=vehicle.id;option.textContent=vehicle.name;aircraft.append(option)}
 let pending=null,previousPaused=true;
 function refresh(){i18n.apply(dialog);dialog.querySelector('#missionAircraftTrait').textContent=i18n.t(`vehicle.${getVehicle(aircraft.value).id}.trait`);dialog.querySelector('#missionInputTip').textContent=i18n.t(globalThis.matchMedia?.('(pointer:coarse)').matches?'missionTouchControls':'missionKeyboardControls')}
 function cancel(){if(!pending)return;pending=null;dialog.close();state.paused=previousPaused;clearInputs();onCancel()}
 aircraft.onchange=()=>{if(pending){pending.vehicle=getVehicle(aircraft.value).id;refresh()}};
 dialog.querySelector('#cancelMission').onclick=cancel;
 dialog.addEventListener('cancel',event=>{event.preventDefault();cancel()});
 dialog.addEventListener('close',()=>{if(!dialog.open)cancel()});
 // Native dialog controls own Space/Enter/arrows. Never fly/reset behind this modal.
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 form.addEventListener('submit',event=>{event.preventDefault();if(!pending)return;const vehicle=pending.vehicle;pending=null;dialog.close();clearInputs();onLaunch(vehicle)});
 i18n.subscribe(()=>{if(dialog.open)refresh()});
 return {get isOpen(){return dialog.open},open(){if(pending)return;previousPaused=state.paused;pending={vehicle:getVehicle(getSelection().vehicle).id};aircraft.value=pending.vehicle;state.paused=true;clearInputs();refresh();dialog.showModal()},cancel};
}
