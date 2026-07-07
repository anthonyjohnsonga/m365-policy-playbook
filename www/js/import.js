/* import.js — bring working files saved by another install into data/clients.
   One POST per file (multipart), so each file gets its own success/error line
   and one bad workbook never blocks the rest of the batch. */
import { $, enc } from './dom.js';
import { api, toast } from './api.js';

let _onImported = null;   // app.js callback: refresh the saved-files dropdown

export function initImport(onImported){
  _onImported = onImported;
  const overlay = $('#importOverlay');
  const open  = () => { overlay.classList.remove('hidden'); resetImport(); loadImportClients(); };
  const close = () => overlay.classList.add('hidden');
  const btn = $('#btnImport');
  if(btn) btn.onclick = open;
  $('#importClose').onclick = close;
  overlay.onclick = e => { if(e.target===overlay) close(); };
  document.addEventListener('keydown', e => { if(e.key==='Escape' && !overlay.classList.contains('hidden')) close(); });
  // "New client…" reveals a free-text box (same pattern as the master modal).
  $('#impClient').onchange = e => {
    const isNew = e.target.value === '__new__';
    $('#impClientNew').classList.toggle('hidden', !isNew);
    if(isNew) $('#impClientNew').focus();
  };
  $('#btnImportGo').onclick = doImport;
}

function resetImport(){
  $('#impFiles').value = '';
  $('#impClientNew').value = '';
  const out = $('#impResults');
  out.innerHTML = '';
  out.classList.add('hidden');
}

async function loadImportClients(){
  const sel = $('#impClient');
  sel.innerHTML = '<option value="__new__">&#10133; New client&hellip;</option>';
  try{
    const c = await api('/api/clients');
    const names = [...new Set(c.files.map(f => f.client).filter(Boolean))].sort();
    if(names.length){
      sel.innerHTML = names.map(n => `<option value="${enc(n)}">${enc(n)}</option>`).join('')
        + '<option value="__new__">&#10133; New client&hellip;</option>';
    }
  }catch(e){ toast(e.message, true); }
  $('#impClientNew').classList.toggle('hidden', sel.value !== '__new__');
}

async function doImport(){
  const sel = $('#impClient');
  const client = sel.value === '__new__' ? $('#impClientNew').value.trim() : sel.value;
  if(!client){ toast('Pick a client or enter a new client name', true); return; }
  const files = [...$('#impFiles').files];
  if(!files.length){ toast('Choose at least one .xlsx working file', true); return; }

  const btn = $('#btnImportGo'); btn.disabled = true;
  const out = $('#impResults'); out.innerHTML = ''; out.classList.remove('hidden');
  let ok = 0, failed = 0;
  for(const f of files){
    const row = document.createElement('div');
    row.className = 'imp-row';
    row.textContent = `${f.name} — importing…`;
    out.appendChild(row);
    try{
      const fd = new FormData();
      fd.append('clientName', client);
      fd.append('file', f, f.name);
      const r = await api('/api/import', {method:'POST', body: fd});
      row.textContent = `✓ ${f.name} → ${r.playbook} (${r.policies} policies)`
        + (r.replaced.length ? ` — replaced ${r.replaced.join(', ')} (backed up)` : '');
      row.classList.add('ok');
      ok++;
    }catch(e){
      row.textContent = `✗ ${f.name} — ${e.message}`;
      row.classList.add('err');
      failed++;
    }
  }
  btn.disabled = false;
  toast(failed ? `Imported ${ok} file(s), ${failed} failed — see details` : `Imported ${ok} file(s) into ${client}`, !!failed);
  if(ok && _onImported) await _onImported();   // refresh the resume dropdown
}
