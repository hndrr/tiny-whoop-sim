// Deliberate arcade tuning, not measured hardware specifications.
// WHOOP 75 keeps the original horizontal motion. Drag scales with acceleration
// / topSpeed so a stronger launch need not also imply a higher cruise speed.
export const FLIGHT_PROFILES=Object.freeze(Object.fromEntries([
 {id:'whoop75',acceleration:1,response:1,topSpeed:1,description:'Balanced all-rounder · familiar, even handling'},
 {id:'micro65',acceleration:1.08,response:1.18,topSpeed:.90,description:'Nimble indoor flyer · quick turns, gentler top speed'},
 {id:'scout85',acceleration:.94,response:.88,topSpeed:1.10,description:'Steady explorer · smooth turns, longer fast runs'},
 {id:'racer90',acceleration:1.14,response:1.04,topSpeed:1.18,description:'Sporty open-prop racer · brisk launch, fastest pace'},
 {id:'cine95',acceleration:.90,response:.78,topSpeed:.94,description:'Smooth camera platform · gradual launch and turns'},
].map(profile=>[profile.id,Object.freeze(profile)])));
export const getFlightProfile=id=>Object.hasOwn(FLIGHT_PROFILES,id)?FLIGHT_PROFILES[id]:FLIGHT_PROFILES.whoop75;
export function profileMetrics(id){const p=getFlightProfile(id);return `Acceleration ${Math.round(p.acceleration*100)} · Turn ${Math.round(p.response*100)} · Top speed ${Math.round(p.topSpeed*100)}`}
