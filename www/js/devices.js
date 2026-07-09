/* devices.js — device enrollment tracking (table, paste-add, CSV import) */
import { $, $$, enc, debounce } from './dom.js';
import { api, toast } from './api.js';
import { curClass } from './format.js';
import { markDirty } from './persistence.js';

const DEV_OS      = ['Windows','macOS','iOS','Android','Linux','Other'];
const DEV_CURRENT = ['Not enrolled','Hybrid','Intune'];
const DEV_STATUS  = ['Not Started','In Progress','Done','Blocked'];

export async function renderDevices(){
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
    html += `<div class="empty">
      <svg class="empty-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="2" y1="19" x2="22" y2="19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <div class="empty-title">No devices yet</div>
      <div class="empty-hint">Paste a list of names above, or import a CSV.</div>
    </div>`;
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

export function wireDevices(){
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

export async function addDevices(devices){
  try{
    const r = await api('/api/devices/add', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({devices})});
    markDirty();
    toast(`Added ${r.added} ${r.added===1?'device':'devices'}`);
    renderDevices();
  }catch(e){ toast(e.message, true); }
}

export async function updateDevice(id, field, value, el){
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

export async function deleteDevice(id){
  if(!confirm('Remove this device?')) return;
  try{
    await api('/api/devices/delete', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id})});
    markDirty();
    renderDevices();
  }catch(e){ toast(e.message, true); }
}

// Minimal CSV parser (handles quoted fields + header mapping)
export function importCsv(text){
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
