/* bulk.js — bulk status updates across the in-scope policies */
import { $, enc } from './dom.js';
import { state } from './state.js';
import { api, toast } from './api.js';
import { dueState } from './format.js';
import { applySummary, renderCards } from './policies.js';
import { markDirty } from './persistence.js';

export function setupBulk(){
  $('#bulkStatus').innerHTML = state.statusOptions.map(o=>`<option>${enc(o)}</option>`).join('');
  updateBulkCount();
}
export function bulkTargets(){
  const scope = $('#bulkScope').value;
  return state.policies.filter(p => {
    if(scope==='visible' && !state.search && p.Section!==state.section) return false;
    if(state.impact!=='all' && p.ImpactClass!==state.impact) return false;
    if(state.attention && !dueState(p)) return false;
    if(state.search){
      const blob = (p.PolicyName+' '+p.WhatItDoes+' '+p.WhatUsersExperience).toLowerCase();
      if(!blob.includes(state.search)) return false;
    }
    return true;
  });
}
export function updateBulkCount(){ const el=$('#bulkCount'); if(el) el.textContent = bulkTargets().length; }
export async function applyBulk(){
  const targets = bulkTargets();
  if(!targets.length){ toast('No policies in scope', true); return; }
  const value = $('#bulkStatus').value;
  const ids = targets.map(p=>p.Id);
  if(!confirm(`Set ${ids.length} ${ids.length===1?'policy':'policies'} to "${value}"?`)) return;
  try{
    const r = await api('/api/policy/bulk', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ids, field:'Status', value})});
    targets.forEach(p => p.Status = value);
    if(r.summary) applySummary(r.summary);
    renderCards();
    if(r.count) markDirty();   // skip the autosave if nothing actually matched
    toast(`Updated ${r.count} ${r.count===1?'policy':'policies'}`);
  }catch(e){ toast(e.message, true); }
}
