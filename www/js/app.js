/* app.js — entry module: app shell, engagement lifecycle, top/start wiring.
   Loaded via <script type="module">, so it runs after the DOM is parsed. */
import { $, $$, enc } from './dom.js';
import { state } from './state.js';
import { api, toast } from './api.js';
import { updateSaveIndicator, doSave, scheduleAutosave, cancelAutosave } from './persistence.js';
import { initTheme } from './theme.js';
import { initSettings } from './settings.js';
import { initMaster } from './master.js';
import { applySummary, loadPolicies, renderCards } from './policies.js';
import { setupBulk, updateBulkCount } from './bulk.js';
import { setView, wireViews } from './views.js';

/* ---------- boot ---------- */
async function boot(){
  initTheme();
  initSettings();
  initMaster();
  // Warn before leaving with unsaved work; safety-net autosave every 20s.
  window.addEventListener('beforeunload', e => {
    if(state.dirty || state.saving){ e.preventDefault(); e.returnValue = ''; }
  });
  setInterval(()=> { if(state.active && state.dirty && !state.saving) doSave(true); }, 20000);
  const v = new URLSearchParams(location.search).get('view');
  if(['timeline','checklist','devices','companion'].includes(v)) state.view = v;
  await loadPlaybookOptions();
  await loadClientFiles();
  await refreshState();
  wireStart();
  wireTop();
  wireViews();
}

async function loadPlaybookOptions(){
  const c = await api('/api/config');
  $('#newPlaybook').innerHTML = c.playbooks
    .map(p => `<option value="${enc(p.key)}">${enc(p.name)}</option>`).join('');
}
async function loadClientFiles(){
  const c = await api('/api/clients');
  const sel = $('#openFile');
  if(!c.files.length){ sel.innerHTML = '<option value="">No saved files yet</option>'; return; }
  // Group by client folder (insertion order = newest first from the server);
  // legacy flat files without a client folder fall under "Other".
  const groups = new Map();
  c.files.forEach(f => {
    const key = f.client || '';
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });
  const optFor = f => `<option value="${enc(f.rel || f.name)}">${enc(f.name)}  -  ${enc(f.modified)}</option>`;
  let html = '';
  for(const [client, files] of groups){
    if(client) html += `<optgroup label="${enc(client)}">${files.map(optFor).join('')}</optgroup>`;
  }
  const flat = groups.get('') || [];
  if(flat.length) html += `<optgroup label="Other">${flat.map(optFor).join('')}</optgroup>`;
  sel.innerHTML = html;
}

async function refreshState(){
  const s = await api('/api/state');
  if(!s.active){ showStart(); return; }
  state.active = true;
  state.statusOptions = s.statusOptions;
  state.doneStatuses = s.doneStatuses || [];
  state.verb = (s.verbPast || 'Done').toLowerCase();
  state.sourceFile = s.sourceFile || null;
  state.dirty = !!s.dirty;
  state.playbook = s.playbook || null;
  $('#engClient').textContent = s.client;
  $('#engPlaybook').textContent = s.playbookName;
  // The companion view shows the OTHER tier; label the tab accordingly.
  const compName = s.playbook==='Tier1' ? 'Tier 0' : (s.playbook==='Tier0' ? 'Tier 1' : null);
  const cb = $('#btnCompanion');
  if(cb){ cb.classList.toggle('hidden', !compName); if(compName) cb.textContent = compName; }
  updateSaveIndicator();
  // engagement already had unsaved edits (e.g. after a page refresh)? persist soon.
  if(state.dirty){ scheduleAutosave(); }
  applySummary(s.summary);
  await loadPolicies();
  setupBulk();
  setView(state.view);
  showApp();
}

/* ---------- start screen ---------- */
function showStart(){
  state.active = false;
  state.dirty = false; state.saving = false; state.sourceFile = null; state.autosaveFailed = false;
  // Clear per-engagement view state so the next engagement starts clean. Without
  // this, a stale section name from the previous playbook (Tier 1 vs Tier 0 use
  // different sections) leaves the checklist empty until the user clicks a section.
  state.section = null; state.policies = [];
  cancelAutosave();
  $('#startScreen').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $('#engInfo').classList.add('hidden');
  $('#topActions').classList.add('hidden');
  loadClientFiles();
}
function showApp(){
  $('#startScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#engInfo').classList.remove('hidden');
  $('#topActions').classList.remove('hidden');
}

// Flush any unsaved work, close the engagement, and return to the start screen.
// Returns false only if the user aborts after a failed save. Shared by the
// "Switch" and "+ New client" buttons.
async function leaveEngagement(){
  if(state.dirty){
    await doSave(false);
    if(state.dirty && !confirm('Could not save changes. Continue anyway and lose them?')) return false;
  }
  cancelAutosave(); state.dirty = false;
  await api('/api/engagement/close', {method:'POST'});
  showStart();
  return true;
}

function wireStart(){
  $('#btnNew').onclick = async () => {
    const clientName = $('#newClient').value.trim();
    const playbook = $('#newPlaybook').value;
    if(!clientName){ toast('Enter a client name', true); return; }
    try{
      await api('/api/engagement/new', {method:'POST',headers:{'Content-Type':'application/json'},
        body: JSON.stringify({clientName, playbook})});
      await refreshState();
      toast('Engagement created');
    }catch(e){ toast(e.message, true); }
  };
  $('#btnOpen').onclick = async () => {
    const file = $('#openFile').value;
    if(!file){ toast('No file selected', true); return; }
    try{
      await api('/api/engagement/open', {method:'POST',headers:{'Content-Type':'application/json'},
        body: JSON.stringify({file})});
      await refreshState();
      toast('Opened '+file);
    }catch(e){ toast(e.message, true); }
  };
}

function wireTop(){
  $('#btnSave').onclick = () => doSave(false);
  $('#btnSwitch').onclick = () => leaveEngagement();
  $('#btnNewClient').onclick = async () => {
    // Autosave + close the current engagement, then focus the new-client field.
    if(await leaveEngagement()){
      const inp = $('#newClient');
      if(inp){ inp.value = ''; inp.focus(); }
    }
  };
  // Reports dropdown: click to toggle, close on outside click or item pick
  const menu = $('.menu');
  if(menu){
    menu.querySelector('button').onclick = e => { e.stopPropagation(); menu.classList.toggle('open'); };
    menu.querySelectorAll('.dropdown a').forEach(a => a.addEventListener('click', () => menu.classList.remove('open')));
    document.addEventListener('click', e => { if(!menu.contains(e.target)) menu.classList.remove('open'); });
  }
  $('#search').oninput = e => { state.searchRaw = e.target.value; state.search = e.target.value.toLowerCase(); renderCards(); };
  $$('#impactFilter .chip').forEach(c => c.onclick = () => {
    $$('#impactFilter .chip').forEach(x=>x.classList.remove('active'));
    c.classList.add('active'); state.impact = c.dataset.impact; renderCards();
  });
  const attn = $('#attnToggle');
  if(attn) attn.onclick = () => {
    state.attention = !state.attention;
    attn.classList.toggle('active', state.attention);
    setView('checklist');     // attention filter applies to the checklist
    renderCards(); updateBulkCount();
  };
}

boot().catch(e => toast('Startup error: '+e.message, true));
