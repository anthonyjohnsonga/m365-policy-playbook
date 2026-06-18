/* M365 Policy Playbook - front-end */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const enc = s => (s ?? '').toString()
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const state = {
  active:false, policies:[], statusOptions:[], doneStatuses:[], verb:'done',
  section:null, impact:'all', search:'', view:'checklist', attention:false,
  sourceFile:null, dirty:false, saving:false, autosaveFailed:false, playbook:null
};

/* ---------- schedule health ---------- */
function isDone(s){ return state.doneStatuses.includes(s); }
// '' | 'soon' | 'overdue' — mirrors Get-PolicyDueState on the server.
function dueState(p){
  if(isDone(p.Status)) return '';
  const d = parseDate(p.PlannedDate);
  if(!d) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.round((d - today) / 86400000);
  if(days < 0)  return 'overdue';
  if(days <= 7) return 'soon';
  return '';
}
function dueBadgeHtml(due){
  return due==='overdue' ? `<span class="due-badge overdue">&#9888; Overdue</span>`
       : due==='soon'    ? `<span class="due-badge soon">Due soon</span>` : '';
}

/* ---------- persistence / autosave ---------- */
let _autosaveT;
const AUTOSAVE_MS = 3000;   // save this long after the last edit settles

function updateSaveIndicator(){
  const el = $('#savedFlag'); if(!el) return;
  el.classList.toggle('unsaved', state.dirty && !state.saving);
  if(state.saving)     el.textContent = 'Saving…';
  else if(state.dirty) el.textContent = '● Unsaved changes';
  else                 el.textContent = state.sourceFile ? ('Saved: '+state.sourceFile) : 'Not saved yet';
}

function markDirty(){
  state.dirty = true;
  updateSaveIndicator();
  clearTimeout(_autosaveT);
  _autosaveT = setTimeout(()=> doSave(true), AUTOSAVE_MS);
}

async function doSave(isAuto){
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

async function api(path, opts){
  const r = await fetch(path, opts);
  let body = null;
  try { body = await r.json(); } catch {}
  if(!r.ok){ throw new Error((body && body.error) || ('HTTP '+r.status)); }
  return body;
}

function toast(msg, isErr){
  const t = $('#toast');
  clearTimeout(t._t);
  if(isErr){
    // Errors stay until dismissed so they can actually be read / noted down.
    // Build with a close button instead of auto-fading after a couple seconds.
    t.textContent = '';
    const span = document.createElement('span'); span.textContent = msg;
    const x = document.createElement('button');
    x.className = 'toast-x'; x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    x.onclick = ()=> t.className = 'toast';
    t.append(span, x);
    t.className = 'toast show err';
  } else {
    t.textContent = msg;
    t.className = 'toast show';
    t._t = setTimeout(()=> t.className='toast', 2600);
  }
}

/* ---------- theme ---------- */
function initTheme(){
  const root = document.documentElement;
  const btn = $('#btnTheme');
  const sync = () => { if(btn) btn.textContent = root.getAttribute('data-theme')==='dark' ? '☀' : '☾'; };
  sync();
  if(btn) btn.onclick = () => {
    const next = root.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try{ localStorage.setItem('pb-theme', next); }catch(e){}
    sync();
  };
}

/* ---------- settings (display-only) ---------- */
function initSettings(){
  const overlay = $('#settingsOverlay');
  const open  = () => { loadSettings(); overlay.classList.remove('hidden'); };
  const close = () => overlay.classList.add('hidden');
  const btn = $('#btnSettings');
  if(btn) btn.onclick = open;
  $('#settingsClose').onclick = close;
  // Dismiss on backdrop click or Esc.
  overlay.onclick = e => { if(e.target===overlay) close(); };
  document.addEventListener('keydown', e => { if(e.key==='Escape' && !overlay.classList.contains('hidden')) close(); });
}

async function loadSettings(){
  const wrap = $('#settingsFolders');
  wrap.innerHTML = '<div class="empty">Loading…</div>';
  $('#settingsMeta').innerHTML = '';
  let s;
  try{ s = await api('/api/settings'); }
  catch(e){ wrap.innerHTML = `<div class="empty">${enc(e.message)}</div>`; return; }
  wrap.innerHTML = s.folders.map(f => `
    <div class="setrow${f.exists?'':' missing'}">
      <div class="setlabel"><span>${enc(f.label)}</span>
        ${f.exists?`<span class="setcount">${f.count} ${f.count===1?'file':'files'}</span>`:''}</div>
      <div class="setpath">${enc(f.path)}</div>
      ${f.note?`<div class="setnote">${enc(f.note)}</div>`:''}
      ${f.exists?'':'<div class="setmissing">Not created yet — appears on first use.</div>'}
    </div>`).join('');
  $('#settingsMeta').innerHTML = `Serving at <code>http://127.0.0.1:${enc(s.port)}</code>`;
}

/* ---------- manage master (admin: add policy) ---------- */
let _masterNames = [];
function initMaster(){
  const overlay = $('#masterOverlay');
  const open  = () => { overlay.classList.remove('hidden'); loadMasterMeta(); };
  const close = () => overlay.classList.add('hidden');
  const btn = $('#btnMaster');
  if(btn) btn.onclick = open;
  $('#masterClose').onclick = close;
  overlay.onclick = e => { if(e.target===overlay) close(); };
  document.addEventListener('keydown', e => { if(e.key==='Escape' && !overlay.classList.contains('hidden')) close(); });
  // "New section…" reveals a free-text box.
  $('#mSection').onchange = e => {
    const isNew = e.target.value === '__new__';
    $('#mSectionNew').classList.toggle('hidden', !isNew);
    if(isNew) $('#mSectionNew').focus();
  };
  $('#mName').oninput = checkMasterDup;
  $('#masterForm').onsubmit = submitMaster;
}

async function loadMasterMeta(){
  $('#mMeta').textContent = 'Loading…';
  try{
    const m = await api('/api/master/meta?tier=Tier1');
    _masterNames = (m.policyNames||[]).map(n => (n||'').toString().trim().toLowerCase());
    $('#mSection').innerHTML =
      (m.sections || []).map(s => `<option value="${enc(s)}">${enc(s)}</option>`).join('')
      + `<option value="__new__">➕ New section…</option>`;
    $('#mImpact').innerHTML = '<option value="">Select…</option>'
      + (m.impactOptions||[]).map(i => `<option value="${enc(i)}">${enc(i)}</option>`).join('');
    $('#mMeta').textContent = `${m.count} policies in Tier 1 master`;
  }catch(e){ $('#mMeta').textContent = e.message; }
}

function checkMasterDup(){
  const v = $('#mName').value.trim().toLowerCase();
  const dup = !!v && _masterNames.includes(v);
  $('#mDup').classList.toggle('hidden', !dup);
  if(dup) $('#mDup').textContent = 'A policy with this name already exists in the master.';
  $('#mSubmit').disabled = dup;
}

async function submitMaster(e){
  e.preventDefault();
  let section = $('#mSection').value;
  if(section === '__new__') section = $('#mSectionNew').value.trim();
  const body = {
    tier: 'Tier1',
    section,
    policyName: $('#mName').value.trim(),
    impact: $('#mImpact').value,
    whatItDoes: $('#mDoes').value.trim(),
    whatUsersExperience: $('#mUsers').value.trim(),
    portalPath: $('#mPortal').value.trim(),
    autoRemediable: $('#mAuto').value.trim(),
    license: $('#mLicense').value.trim()
  };
  if(!section){ toast('Section is required', true); return; }
  if(!body.policyName){ toast('Policy name is required', true); return; }
  if(!body.impact){ toast('Impact is required', true); return; }
  $('#mSubmit').disabled = true;
  try{
    const r = await api('/api/master/policy', {method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    toast(`Added "${r.policyName}" to Tier 1 master`);
    $('#masterForm').reset();
    $('#mSectionNew').classList.add('hidden');
    $('#mDup').classList.add('hidden');
    await loadMasterMeta();   // refresh sections/names + count
  }catch(err){ toast(err.message, true); }
  // Always re-enable: form.reset() doesn't fire input, so checkMasterDup won't
  // run to clear the disable — without this the button stays dead after a
  // successful add until the user types in the name field again.
  finally{ $('#mSubmit').disabled = false; }
}

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
  if(state.dirty){ clearTimeout(_autosaveT); _autosaveT = setTimeout(()=> doSave(true), AUTOSAVE_MS); }
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
  clearTimeout(_autosaveT);
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
  clearTimeout(_autosaveT); state.dirty = false;
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
  $('#search').oninput = e => { state.search = e.target.value.toLowerCase(); renderCards(); };
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

/* ---------- policies ---------- */
async function loadPolicies(){
  const r = await api('/api/policies');
  state.policies = r.policies;
  if(!state.section){ const secs = sections(); state.section = secs[0] || null; }
  renderNav(); renderCards();
}
function sections(){ return [...new Set(state.policies.map(p=>p.Section))]; }

function applySummary(sum){
  $('#pctText').textContent = sum.Pct + '%';
  $('.ring').style.setProperty('--p', sum.Pct);
  $('#doneText').textContent = sum.Done;
  $('#totalText').textContent = sum.Total;
  $('#verbText').textContent = state.verb;
  $('#cntHigh').textContent = sum.High;
  $('#cntMed').textContent = sum.Medium;
  $('#cntLow').textContent = sum.Low;
  state._sectionPct = {};
  sum.Sections.forEach(s => state._sectionPct[s.Section] = s.Pct);
  if($('#sectionNav').children.length) renderNav();
  updateAttnToggle(sum);
}

function updateAttnToggle(sum){
  const btn = $('#attnToggle'); if(!btn) return;
  const o = sum.Overdue || 0, s = sum.DueSoon || 0;
  if(!o && !s){ btn.classList.add('hidden'); btn.classList.remove('active'); state.attention = false; return; }
  const parts = [];
  if(o) parts.push(`${o} overdue`);
  if(s) parts.push(`${s} due soon`);
  btn.textContent = '⚠ ' + parts.join(' · ');
  btn.classList.remove('hidden');
  btn.classList.toggle('active', state.attention);
}

function renderNav(){
  const nav = $('#sectionNav');
  nav.innerHTML = sections().map(sec => {
    const n = state.policies.filter(p=>p.Section===sec).length;
    const pct = (state._sectionPct && state._sectionPct[sec]!=null) ? state._sectionPct[sec] : 0;
    const active = sec===state.section ? ' active' : '';
    return `<div class="navitem${active}" data-sec="${enc(sec)}">
       <span class="navname" title="${enc(sec)}">${enc(sec)}</span>
       <span class="navcount">${pct}% &middot; ${n}</span></div>`;
  }).join('');
  $$('#sectionNav .navitem').forEach(it => it.onclick = () => {
    state.section = it.dataset.sec; renderNav(); setView('checklist');
  });
}

function visiblePolicies(){
  return state.policies.filter(p => {
    if(p.Section !== state.section) return false;
    if(state.impact !== 'all' && p.ImpactClass !== state.impact) return false;
    if(state.attention && !dueState(p)) return false;
    if(state.search){
      const blob = (p.PolicyName+' '+p.WhatItDoes+' '+p.WhatUsersExperience).toLowerCase();
      if(!blob.includes(state.search)) return false;
    }
    return true;
  });
}

function statusClass(s){ return 's-' + (s||'').toLowerCase().replace(/[^a-z]/g,''); }

function renderCards(){
  const head = $('#contentHead');
  const list = visiblePolicies();
  head.innerHTML = `<h2>${enc(state.section||'')}</h2>
     <div class="meta">${list.length} ${state.impact==='all'?'':state.impact+' impact '}policies${state.search?` matching "${enc(state.search)}"`:''}</div>`;
  const cards = $('#cards');
  if(!list.length){ cards.innerHTML = '<div class="empty">No policies match the current filter.</div>'; return; }

  cards.innerHTML = list.map(p => {
    const opts = state.statusOptions.map(o =>
      `<option ${o===p.Status?'selected':''}>${enc(o)}</option>`).join('');
    const extra = [];
    if(p.AutoRemediable) extra.push(`<span><b>Auto-remediable:</b> ${enc(p.AutoRemediable)}</span>`);
    if(p.License)        extra.push(`<span><b>License:</b> ${enc(p.License)}</span>`);
    if(p.CurrentSettings)extra.push(`<span><b>Current (Baseline 0):</b> ${enc(p.CurrentSettings)}</span>`);
    const dueBadge = dueBadgeHtml(dueState(p));
    return `
    <div class="pcard ${p.ImpactClass}" data-id="${p.Id}">
      <div class="row1">
        <span class="badge ${p.ImpactClass}">${enc(p.Impact)}</span>
        <div style="flex:1">
          <div class="pname">${enc(p.PolicyName)}</div>
          <div class="section-tag">${enc(p.Section)}</div>
        </div>
        ${dueBadge}
      </div>
      ${p.WhatItDoes?`<p class="does">${enc(p.WhatItDoes)}</p>`:''}
      ${p.WhatUsersExperience?`<div class="users"><b>What users will experience</b>${enc(p.WhatUsersExperience)}</div>`:''}
      <div class="kv">
        ${p.PortalPath?`<span class="portal">${enc(p.PortalPath)}</span>`:''}
        ${extra.join('')}
      </div>
      <div class="controls">
        <span><label>Status</label>
          <select class="status-sel ${statusClass(p.Status)}" data-field="Status">${opts}</select></span>
        <span><label>Planned</label>
          <input type="date" data-field="PlannedDate" value="${enc(toDateVal(p.PlannedDate))}"></span>
        <span><label>Completed</label>
          <input type="date" data-field="DateCompleted" value="${enc(toDateVal(p.DateCompleted))}"></span>
        <span><label>Tech</label>
          <input type="text" style="width:80px" data-field="Tech" value="${enc(p.Tech)}" placeholder="initials"></span>
      </div>
      <textarea class="notes" data-field="Notes" placeholder="Notes / pre-deploy checks / drift...">${enc(p.Notes)}</textarea>
    </div>`;
  }).join('');

  $$('#cards .pcard').forEach(card => {
    const id = +card.dataset.id;
    $$('[data-field]', card).forEach(el => {
      const ev = el.tagName==='SELECT' ? 'change' : (el.type==='date'?'change':'input');
      let handler = () => updateField(id, el.dataset.field, el.value, el);
      if(el.tagName==='TEXTAREA' || el.type==='text') handler = debounce(handler, 650);
      el.addEventListener(ev, handler);
    });
  });
  updateBulkCount();
}

/* ---------- view toggle ---------- */
function wireViews(){
  $$('#viewSeg button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('#bulkScope').onchange = updateBulkCount;
  $('#bulkApply').onclick = applyBulk;
}
function setView(v){
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

/* ---------- bulk actions ---------- */
function setupBulk(){
  $('#bulkStatus').innerHTML = state.statusOptions.map(o=>`<option>${enc(o)}</option>`).join('');
  updateBulkCount();
}
function bulkTargets(){
  const scope = $('#bulkScope').value;
  return state.policies.filter(p => {
    if(scope==='visible' && p.Section!==state.section) return false;
    if(state.impact!=='all' && p.ImpactClass!==state.impact) return false;
    if(state.attention && !dueState(p)) return false;
    if(state.search){
      const blob = (p.PolicyName+' '+p.WhatItDoes+' '+p.WhatUsersExperience).toLowerCase();
      if(!blob.includes(state.search)) return false;
    }
    return true;
  });
}
function updateBulkCount(){ const el=$('#bulkCount'); if(el) el.textContent = bulkTargets().length; }
async function applyBulk(){
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

/* ---------- timeline ---------- */
function parseDate(s){ if(!s) return null; const d=new Date(s+'T00:00:00'); return isNaN(d)?null:d; }
function fmtDate(s){ const d=parseDate(s); return d ? d.toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ''; }
function shortPhase(name){ return name.replace(/^Phase\s*\d+\s*[-–]\s*/,''); }

async function renderTimeline(){
  const tl = $('#timeline');
  tl.innerHTML = '<div class="empty">Loading timeline...</div>';
  let data;
  try{ data = await api('/api/timeline'); }
  catch(e){ tl.innerHTML = `<div class="empty">${enc(e.message)}</div>`; return; }

  const proj = data.project || {start:'', end:''};
  let html = `<div class="schedule">
    <div class="sched-row">
      <span><label>Project start</label><input id="projStart" type="date" value="${enc(proj.start||'')}"></span>
      <span><label>Project end</label><input id="projEnd" type="date" value="${enc(proj.end||'')}"></span>
      <button id="autoPhases" class="btn">Auto-distribute phases</button>
    </div>`;

  const ps = parseDate(proj.start), pe = parseDate(proj.end);
  if(ps && pe && pe>ps){
    const span = pe - ps;
    html += `<div class="gantt"><div class="gantt-axis"><span>${fmtDate(proj.start)}</span><span>${fmtDate(proj.end)}</span></div>`;
    data.phases.forEach(ph => {
      const phs=parseDate(ph.start), phe=parseDate(ph.end);
      let bar = '';
      if(phs && phe){
        let l = Math.max(0,(phs-ps)/span*100);
        let w = Math.max(1.5,(phe-phs)/span*100);
        if(l+w>100) w = 100-l;
        bar = `<div class="gantt-bar imp${ph.index}" style="left:${l}%;width:${w}%">
                 <div class="gantt-fill" style="width:${ph.pct}%"></div>
                 <span class="gantt-blabel">${ph.pct}%</span></div>`;
      }
      const glabel = `P${ph.index} ${enc(shortPhase(ph.name))}`;
      html += `<div class="gantt-row">
        <div class="gantt-label" title="${glabel}">${glabel}</div>
        <div class="gantt-track">${bar}</div>
        <div class="gantt-when">${ph.start?fmtDate(ph.start):'—'} – ${ph.end?fmtDate(ph.end):'—'}</div>
      </div>`;
    });

    // device enrollment track — spans the full project window, fills to enrolled %
    const dv = data.devices;
    if(dv && dv.total){
      const dlabel = `Devices → ${enc(dv.target)}`;
      html += `<div class="gantt-row">
        <div class="gantt-label" title="${dlabel}">${dlabel}</div>
        <div class="gantt-track">
          <div class="gantt-bar dev" style="left:0;width:100%">
            <div class="gantt-fill" style="width:${dv.pct}%"></div>
            <span class="gantt-blabel">${dv.atTarget}/${dv.total} enrolled (${dv.pct}%)</span>
          </div>
        </div>
        <div class="gantt-when">${dv.pct}%</div>
      </div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="sched-hint">Set a project <b>start</b> and <b>end</b> date to build the schedule — the three phases auto-distribute across the window, and you can fine-tune each one below or set a planned date on individual policies.</div>`;
  }
  html += `</div>`;

  const rank = {high:0, medium:1, low:2, none:3};
  html += data.phases.map(ph => {
    const items = ph.items.slice().sort((a,b)=>
      (rank[a.impactClass]-rank[b.impactClass]) || a.name.localeCompare(b.name));

    // status breakdown for the summary line
    const c = {done:0, planned:0, notstarted:0, unaccepted:0, overdue:0};
    items.forEach(it => {
      if(it.done) c.done++;
      else if(it.status==='Planned') c.planned++;
      else if(it.status==='Unaccepted Deviation') c.unaccepted++;
      else c.notstarted++;
      if(!it.done && it.dueState==='overdue') c.overdue++;
    });
    const chips = [];
    if(c.overdue)    chips.push(`<span class="chip-mini overdue">&#9888; ${c.overdue} overdue</span>`);
    if(c.done)       chips.push(`<span class="chip-mini done">${c.done} done</span>`);
    if(c.planned)    chips.push(`<span class="chip-mini planned">${c.planned} planned</span>`);
    if(c.notstarted) chips.push(`<span class="chip-mini notstarted">${c.notstarted} not started</span>`);
    if(c.unaccepted) chips.push(`<span class="chip-mini unaccepted">${c.unaccepted} unaccepted</span>`);

    const rows = items.length
      ? items.map(it => `
        <div class="tl-item" data-id="${it.id}" data-section="${enc(it.section)}">
          <span class="mini-badge ${it.impactClass}">${enc(it.impact)}</span>
          <span class="tname">${enc(it.name)}</span>
          <span class="tl-plan ${it.plannedDate?'override':'inherit'}${it.dueState?(' '+it.dueState):''}">${it.dueState==='overdue'?'&#9888; ':''}${it.effectivePlanned?fmtDate(it.effectivePlanned):'—'}</span>
          <span class="status-chip ${statusClass(it.status)}">${enc(it.status)}</span>
        </div>`).join('')
      : '<div class="tl-empty">Validation milestone &mdash; no policies pushed in this phase.</div>';

    const toggle = items.length
      ? `<button class="toggle-items" data-phase="${ph.index}">Show ${items.length} ${items.length===1?'policy':'policies'} &#9662;</button>`
      : '';

    return `<div class="phase-card">
      <div class="phase-head">
        <span class="phase-num">${ph.index}</span>
        <span class="phase-title">${enc(shortPhase(ph.name))}</span>
        <span class="phase-when">
          <input type="date" class="phase-date" data-phase="${ph.index}" data-edge="start" value="${enc(ph.start||'')}">
          <span class="dash">to</span>
          <input type="date" class="phase-date" data-phase="${ph.index}" data-edge="end" value="${enc(ph.end||'')}">
        </span>
        <span class="phase-pct">${ph.pct}%</span>
      </div>
      <div class="phase-bar"><span style="width:${ph.pct}%"></span></div>
      <div class="phase-desc">${enc(ph.desc)}</div>
      <div class="phase-summary">${chips.join('')}${toggle}</div>
      <div class="phase-items collapsed" id="items-${ph.index}">${rows}</div>
    </div>`;
  }).join('');

  tl.innerHTML = html;
  wireTimeline();
}

function wireTimeline(){
  const ps=$('#projStart'), pe=$('#projEnd'), auto=$('#autoPhases');
  if(ps) ps.onchange = () => saveProject({projectStart: ps.value});
  if(pe) pe.onchange = () => saveProject({projectEnd: pe.value});
  if(auto) auto.onclick = () => saveProject({auto:true});
  $$('#timeline .phase-date').forEach(inp => inp.onchange = () => {
    const phase = inp.dataset.phase;
    const start = $(`.phase-date[data-phase="${phase}"][data-edge="start"]`).value;
    const end   = $(`.phase-date[data-phase="${phase}"][data-edge="end"]`).value;
    saveProject({phase, phaseStart:start, phaseEnd:end});
  });
  $$('#timeline .toggle-items').forEach(btn => btn.onclick = () => {
    const box = $(`#items-${btn.dataset.phase}`);
    const open = box.classList.toggle('collapsed') === false;
    const n = box.querySelectorAll('.tl-item').length;
    btn.innerHTML = open ? `Hide policies &#9652;` : `Show ${n} ${n===1?'policy':'policies'} &#9662;`;
  });
  $$('#timeline .tl-item').forEach(el =>
    el.onclick = () => jumpToPolicy(+el.dataset.id, el.dataset.section));
}

async function saveProject(payload){
  try{
    const r = await api('/api/project', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)});
    if(r.changed) markDirty();   // skip the autosave if the schedule didn't change
    renderTimeline();
  }catch(e){ toast(e.message, true); }
}

/* ---------- devices ---------- */
const DEV_OS      = ['Windows','macOS','iOS','Android','Linux','Other'];
const DEV_CURRENT = ['Not enrolled','Hybrid','Intune'];
const DEV_STATUS  = ['Not Started','In Progress','Done','Blocked'];

function curClass(c){
  if(c==='Intune') return 'cur-intune';
  if(c==='Hybrid') return 'cur-hybrid';
  return 'cur-none';
}

async function renderDevices(){
  const wrap = $('#devices');
  wrap.innerHTML = '<div class="empty">Loading devices...</div>';
  let data;
  try{ data = await api('/api/devices'); }
  catch(e){ wrap.innerHTML = `<div class="empty">${enc(e.message)}</div>`; return; }

  const s = data.summary;
  const targetOpts = ['Intune','Hybrid'].map(t=>`<option ${t===data.target?'selected':''}>${t}</option>`).join('');

  let html = `
   <div class="dev-top">
     <div class="dev-target">
       <label>Project enrollment goal</label>
       <select id="devTarget">${targetOpts}</select>
       <div class="hint">Drives the device track on the Timeline.</div>
     </div>
     <div class="dev-stats">
       <div class="dstat"><div class="dn">${s.total}</div><div class="dl">Devices</div></div>
       <div class="dstat"><div class="dn cur-intune">${s.intune}</div><div class="dl">Intune</div></div>
       <div class="dstat"><div class="dn cur-hybrid">${s.hybrid}</div><div class="dl">Hybrid</div></div>
       <div class="dstat"><div class="dn cur-none">${s.notEnrolled}</div><div class="dl">Not enrolled</div></div>
       <div class="dstat wide">
         <div class="dn">${s.atTarget}/${s.total} <span class="dsm">at target (${enc(s.target)})</span></div>
         <div class="dbar"><span style="width:${s.pct}%"></span></div>
       </div>
     </div>
   </div>

   <div class="dev-add">
     <textarea id="devPaste" placeholder="Paste device names, one per line, then click Add..."></textarea>
     <div class="dev-add-actions">
       <button id="devAddBtn" class="btn cta">Add devices</button>
       <label class="btn filelabel">Import CSV<input id="devCsv" type="file" accept=".csv,.txt" hidden></label>
       <div class="hint">CSV headers (optional): Name, OS, User, Current, Status, Notes</div>
     </div>
   </div>`;

  if(!data.devices.length){
    html += `<div class="empty">No devices yet. Paste a list of names above, or import a CSV.</div>`;
  } else {
    const rows = data.devices.map(d => {
      const osOpts  = DEV_OS.map(o=>`<option ${o===d.OS?'selected':''}>${o}</option>`).join('');
      const curOpts = DEV_CURRENT.map(o=>`<option ${o===d.Current?'selected':''}>${o}</option>`).join('');
      const stOpts  = DEV_STATUS.map(o=>`<option ${o===d.Status?'selected':''}>${o}</option>`).join('');
      const atTgt   = d.Current===data.target ? '<span class="tgt-yes" title="At target">&#10003;</span>' : '';
      return `<tr data-id="${d.Id}">
        <td><input class="d-name" data-field="Name" value="${enc(d.Name)}"></td>
        <td><select data-field="OS"><option value="">—</option>${osOpts}</select></td>
        <td><input data-field="User" value="${enc(d.User)}" placeholder="user"></td>
        <td><select class="cur-sel ${curClass(d.Current)}" data-field="Current">${curOpts}</select></td>
        <td class="tgt-cell">${atTgt}</td>
        <td><select data-field="Status">${stOpts}</select></td>
        <td><input data-field="Notes" value="${enc(d.Notes)}" placeholder="notes"></td>
        <td><button class="d-del" title="Remove">&times;</button></td>
      </tr>`;
    }).join('');
    html += `<div class="dev-tablewrap"><table class="dev-table">
      <thead><tr><th>Device name</th><th>OS</th><th>User</th><th>Current</th><th></th><th>Status</th><th>Notes</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  wrap.innerHTML = html;
  wireDevices();
}

function wireDevices(){
  const tsel = $('#devTarget');
  if(tsel) tsel.onchange = async () => {
    try{ await api('/api/devices/target', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({target: tsel.value})}); markDirty(); renderDevices(); }
    catch(e){ toast(e.message, true); }
  };
  const addBtn = $('#devAddBtn');
  if(addBtn) addBtn.onclick = async () => {
    const names = $('#devPaste').value.split('\n').map(x=>x.trim()).filter(Boolean);
    if(!names.length){ toast('Paste at least one device name', true); return; }
    await addDevices(names.map(n=>({name:n})));
  };
  const csv = $('#devCsv');
  if(csv) csv.onchange = () => {
    const f = csv.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(reader.result);
    reader.readAsText(f);
    csv.value = '';
  };
  $$('#devices tbody tr').forEach(tr => {
    const id = +tr.dataset.id;
    $$('[data-field]', tr).forEach(el => {
      const ev = el.tagName==='SELECT' ? 'change' : 'input';
      let h = () => updateDevice(id, el.dataset.field, el.value, el);
      if(el.tagName==='INPUT') h = debounce(h, 600);
      el.addEventListener(ev, h);
    });
    tr.querySelector('.d-del').onclick = () => deleteDevice(id);
  });
}

async function addDevices(devices){
  try{
    const r = await api('/api/devices/add', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({devices})});
    markDirty();
    toast(`Added ${r.added} ${r.added===1?'device':'devices'}`);
    renderDevices();
  }catch(e){ toast(e.message, true); }
}

async function updateDevice(id, field, value, el){
  try{
    const r = await api('/api/devices/update', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id, field, value})});
    markDirty();
    if(field==='Current'){
      if(el){ el.className = 'cur-sel '+curClass(value); }
      renderDevices();           // refresh summary + at-target tick
    }
  }catch(e){ toast(e.message, true); }
}

async function deleteDevice(id){
  if(!confirm('Remove this device?')) return;
  try{
    await api('/api/devices/delete', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id})});
    markDirty();
    renderDevices();
  }catch(e){ toast(e.message, true); }
}

// Minimal CSV parser (handles quoted fields + header mapping)
function importCsv(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if(!lines.length){ toast('CSV is empty', true); return; }
  const parseLine = l => {
    const out=[]; let cur='', q=false;
    for(let i=0;i<l.length;i++){ const c=l[i];
      if(q){ if(c==='"'){ if(l[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
      else { if(c==='"') q=true; else if(c===','){ out.push(cur); cur=''; } else cur+=c; }
    }
    out.push(cur); return out.map(x=>x.trim());
  };
  const rows = lines.map(parseLine);
  const header = rows[0].map(h=>h.toLowerCase());
  const known = ['name','os','user','current','status','notes'];
  const hasHeader = known.some(k => header.includes(k));
  const idx = f => header.indexOf(f);
  const start = hasHeader ? 1 : 0;
  const devices = [];
  for(let i=start;i<rows.length;i++){
    const r = rows[i];
    const get = (f, col) => hasHeader ? (idx(f)>=0 ? r[idx(f)] : '') : (r[col]||'');
    const name = (hasHeader ? get('name',0) : r[0]) || '';
    if(!name.trim()) continue;
    devices.push({ name, os:get('os',1), user:get('user',2), current:get('current',3), status:get('status',4), notes:get('notes',5) });
  }
  if(!devices.length){ toast('No device rows found in CSV', true); return; }
  addDevices(devices);
}

/* ---------- companion tier (read-only) ---------- */
async function renderCompanion(){
  const wrap = $('#companion');
  wrap.innerHTML = '<div class="empty">Loading…</div>';
  let d;
  try{ d = await api('/api/companion'); }
  catch(e){ wrap.innerHTML = `<div class="empty">${enc(e.message)}</div>`; return; }
  if(!d.available){
    wrap.innerHTML = `<div class="empty">${enc(d.reason || 'No companion tier available.')}</div>`;
    return;
  }
  const done = d.doneStatuses || [];
  const s = d.summary;
  const rank = {high:0, medium:1, low:2, none:3};
  const bySec = new Map();
  d.policies.forEach(p => { if(!bySec.has(p.Section)) bySec.set(p.Section, []); bySec.get(p.Section).push(p); });

  let html = `<div class="comp-head">
    <div>
      <h2>${enc(d.shortName)} status</h2>
      <div class="meta">${enc(d.displayName)} · read-only · from <code>${enc(d.file)}</code></div>
    </div>
    <div class="comp-stat"><b>${s.Pct}%</b> ${enc((d.verbPast||'done').toLowerCase())} · ${s.Done}/${s.Total}</div>
  </div>`;

  for(const [sec, items] of bySec){
    const secDone = items.filter(p => done.includes(p.Status)).length;
    items.sort((a,b)=> (rank[a.ImpactClass]-rank[b.ImpactClass]) || a.PolicyName.localeCompare(b.PolicyName));
    html += `<div class="comp-sec">
      <div class="comp-sechead"><span>${enc(sec)}</span><span class="comp-seccount">${secDone}/${items.length}</span></div>
      ${items.map(p => `
        <div class="comp-item">
          <span class="mini-badge ${p.ImpactClass}">${enc(p.Impact)}</span>
          <span class="tname">${enc(p.PolicyName)}</span>
          ${p.DateCompleted?`<span class="comp-date">${enc(fmtDate(p.DateCompleted))}</span>`:''}
          <span class="status-chip ${statusClass(p.Status)}">${enc(p.Status)}</span>
        </div>`).join('')}
    </div>`;
  }
  wrap.innerHTML = html;
}

function jumpToPolicy(id, section){
  state.impact='all'; state.search='';
  $('#search').value='';
  $$('#impactFilter .chip').forEach(x => x.classList.toggle('active', x.dataset.impact==='all'));
  if(section) state.section = section;
  renderNav();
  setView('checklist');
  setTimeout(()=>{
    const card = document.querySelector(`#cards .pcard[data-id="${id}"]`);
    if(card){ card.scrollIntoView({behavior:'smooth',block:'center'});
      card.classList.add('flash'); setTimeout(()=>card.classList.remove('flash'),1200); }
  }, 60);
}

function toDateVal(v){
  if(!v) return '';
  // Already an ISO date (yyyy-MM-dd...)? Take the date part verbatim — no Date
  // parsing, so no UTC/timezone shift.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  // Otherwise it's a locale datetime string (e.g. Excel round-trip "6/12/2026
  // 12:00:00 AM"): parse, then format from LOCAL components so the calendar day
  // the user sees is preserved (toISOString() would shift it east of UTC).
  const d = new Date(v);
  if(isNaN(d)) return '';
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// Refresh just one card's overdue badge in place (no full list rebuild).
function updateCardDue(id){
  const row1 = document.querySelector(`#cards .pcard[data-id="${id}"] .row1`);
  if(!row1) return;
  const existing = row1.querySelector('.due-badge');
  if(existing) existing.remove();
  const p = state.policies.find(x=>x.Id===id);
  const html = p ? dueBadgeHtml(dueState(p)) : '';
  if(html) row1.insertAdjacentHTML('beforeend', html);
}

async function updateField(id, field, value, el){
  try{
    const r = await api('/api/policy', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id, field, value})});
    const p = state.policies.find(x=>x.Id===id); if(p) p[field]=value;
    if(field==='Status' && el){ el.className = 'status-sel '+statusClass(value); }
    if(r.summary) applySummary(r.summary);
    markDirty();
    // Status / planned-date edits change a card's overdue badge. With the
    // attention filter on they can also change list membership (a now-done item
    // leaves the view) → full re-render; otherwise refresh just that one card.
    if(field==='Status' || field==='PlannedDate'){
      if(state.attention) renderCards();
      else updateCardDue(id);
    }
  }catch(e){ toast(e.message, true); }
}

function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

boot().catch(e => toast('Startup error: '+e.message, true));
