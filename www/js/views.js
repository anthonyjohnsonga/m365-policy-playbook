/* views.js — top-level view switching (checklist / timeline / devices / companion) */
import { $, $$ } from './dom.js';
import { state } from './state.js';
import { renderCards } from './policies.js';
import { renderTimeline } from './timeline.js';
import { renderDevices } from './devices.js';
import { renderCompanion } from './companion.js';
import { updateBulkCount, applyBulk } from './bulk.js';

export function wireViews(){
  $$('#viewSeg button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('#bulkScope').onchange = updateBulkCount;
  $('#bulkApply').onclick = applyBulk;
}
export function setView(v){
  state.view = v;
  $$('#viewSeg button').forEach(b => b.classList.toggle('active', b.dataset.view===v));
  const checklist = v==='checklist', timeline = v==='timeline', devices = v==='devices', companion = v==='companion';
  $('#bulkbar').classList.toggle('hidden', !checklist);
  $('#contentHead').classList.toggle('hidden', !checklist);
  $('#cards').classList.toggle('hidden', !checklist);
  $('#timeline').classList.toggle('hidden', !timeline);
  $('#devices').classList.toggle('hidden', !devices);
  $('#companion').classList.toggle('hidden', !companion);
  if(checklist) renderCards();
  else if(timeline) renderTimeline();
  else if(devices) renderDevices();
  else if(companion) renderCompanion();
}
