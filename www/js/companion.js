/* companion.js — read-only view of the client's OTHER tier + jump-to-policy */
import { $, $$, enc } from './dom.js';
import { state } from './state.js';
import { api } from './api.js';
import { fmtDate, statusClass } from './format.js';
import { renderNav, clearSearch } from './policies.js';
import { setView } from './views.js';

export async function renderCompanion(){
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

export function jumpToPolicy(id, section){
  state.impact='all'; clearSearch();
  $$('#impactFilter .chip').forEach(x => x.classList.toggle('active', x.dataset.impact==='all'));
  if(section) state.section = section;
  renderNav();
  setView('checklist');
  setTimeout(()=>{
    const card = document.querySelector(`#cards .pcard[data-id="${id}"]`);
    const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if(card){ card.scrollIntoView({behavior:motion,block:'center'});
      card.classList.add('flash'); setTimeout(()=>card.classList.remove('flash'),1200); }
  }, 60);
}
