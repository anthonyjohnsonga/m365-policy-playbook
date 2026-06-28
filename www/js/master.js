/* master.js — admin: add a policy to the Tier 1 master playbook */
import { $, enc } from './dom.js';
import { api, toast } from './api.js';

let _masterNames = [];

export function initMaster(){
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

export async function loadMasterMeta(){
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

export function checkMasterDup(){
  const v = $('#mName').value.trim().toLowerCase();
  const dup = !!v && _masterNames.includes(v);
  $('#mDup').classList.toggle('hidden', !dup);
  if(dup) $('#mDup').textContent = 'A policy with this name already exists in the master.';
  $('#mSubmit').disabled = dup;
}

export async function submitMaster(e){
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
