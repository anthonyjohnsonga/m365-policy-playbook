/* persistence.js — save indicator + autosave. The autosave timer handle is
   private to this module; lifecycle code uses scheduleAutosave/cancelAutosave. */
import { $ } from './dom.js';
import { state } from './state.js';
import { api, toast } from './api.js';

let _autosaveT;
const AUTOSAVE_MS = 3000;   // save this long after the last edit settles

export function updateSaveIndicator(){
  const el = $('#savedFlag'); if(!el) return;
  el.classList.toggle('unsaved', state.dirty && !state.saving);
  if(state.saving)     el.textContent = 'Saving…';
  else if(state.dirty) el.textContent = '● Unsaved changes';
  else                 el.textContent = state.sourceFile ? ('Saved: '+state.sourceFile) : 'Not saved yet';
}

// Schedule / cancel the debounced autosave. Kept here so _autosaveT stays private.
export function scheduleAutosave(){
  clearTimeout(_autosaveT);
  _autosaveT = setTimeout(()=> doSave(true), AUTOSAVE_MS);
}
export function cancelAutosave(){ clearTimeout(_autosaveT); }

export function markDirty(){
  state.dirty = true;
  updateSaveIndicator();
  scheduleAutosave();
}

export async function doSave(isAuto){
  if(!state.active || state.saving) return;
  if(isAuto && !state.dirty) return;
  clearTimeout(_autosaveT);
  // Claim the current state as "being saved": clear dirty up front so any edit
  // that lands mid-save re-sets it and isn't lost when this save completes.
  state.saving = true; state.dirty = false; updateSaveIndicator();
  let ok = false;
  try{
    const r = await api('/api/save', {method:'POST'});
    state.sourceFile = r.file;
    state.autosaveFailed = false;
    ok = true;
    if(!isAuto) toast('Saved to '+r.file);
  }catch(e){
    state.dirty = true;   // not persisted — still has unsaved work
    // Manual saves always report. Autosave reports only the FIRST failure (e.g.
    // the file is open in Excel and locked) so we don't spam toasts while the
    // 20s safety-net interval keeps retrying.
    if(!isAuto || !state.autosaveFailed){ toast((isAuto?'Autosave failed — ':'')+e.message, true); }
    state.autosaveFailed = true;
  }finally{
    state.saving = false;
    updateSaveIndicator();
    // Fast-reschedule ONLY when the save succeeded but a new edit landed mid-save.
    // On failure, fall back to the slower 20s interval — never a 1.5s retry loop.
    if(ok && state.dirty){ clearTimeout(_autosaveT); _autosaveT = setTimeout(()=> doSave(true), 1500); }
  }
}
