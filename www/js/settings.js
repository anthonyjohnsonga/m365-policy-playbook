/* settings.js — display-only Settings modal (app folder locations) */
import { $, enc } from './dom.js';
import { api } from './api.js';

export function initSettings(){
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

export async function loadSettings(){
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
