/* policies.js — policy list: nav, summary, cards, guidance, per-field updates */
import { $, $$, enc, debounce } from './dom.js';
import { state } from './state.js';
import { api, toast } from './api.js';
import { dueState, dueBadgeHtml, statusClass, toDateVal } from './format.js';
import { markDirty } from './persistence.js';
import { setView } from './views.js';
import { updateBulkCount } from './bulk.js';

export async function loadPolicies(){
  const r = await api('/api/policies');
  state.policies = r.policies;
  if(!state.section){ const secs = sections(); state.section = secs[0] || null; }
  renderNav(); renderCards();
}
export function sections(){ return [...new Set(state.policies.map(p=>p.Section))]; }

export function applySummary(sum){
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

export function updateAttnToggle(sum){
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

export function renderNav(){
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

export function visiblePolicies(){
  return state.policies.filter(p => {
    // A search term searches across every section; without one, show only the
    // section selected in the nav.
    if(!state.search && p.Section !== state.section) return false;
    if(state.impact !== 'all' && p.ImpactClass !== state.impact) return false;
    if(state.attention && !dueState(p)) return false;
    if(state.search){
      const blob = (p.PolicyName+' '+p.WhatItDoes+' '+p.WhatUsersExperience).toLowerCase();
      if(!blob.includes(state.search)) return false;
    }
    return true;
  });
}

// Optional per-policy "how to configure" reference (from data/guidance/*.json),
// shown as a collapsed details block. Only policies with guidance render it.
export function guidanceHtml(g){
  if(!g) return '';
  // A single-item list can round-trip through PowerShell's JSON as a scalar, so
  // coerce to an array before mapping.
  const asArray = v => v == null ? [] : (Array.isArray(v) ? v : [v]);
  const settings = asArray(g.requiredSettings).map(s =>
    `<tr><td>${enc(s.label)}</td><td>${enc(s.value)}</td></tr>`).join('');
  const steps = asArray(g.steps).map(s => `<li>${enc(s)}</li>`).join('');
  // Only render the link for a real http(s) URL so a javascript:/data: href can't slip in.
  const docsUrl = (g.docs && /^https?:\/\//i.test(g.docs)) ? g.docs : '';
  const docs = docsUrl ? `<div class="guide-docs"><a href="${enc(docsUrl)}" target="_blank" rel="noopener">Microsoft Learn reference ↗</a></div>` : '';
  if(!settings && !steps && !docs) return '';
  return `<details class="guide">
    <summary>How to configure <span class="guide-hint">settings &amp; steps</span></summary>
    <div class="guide-body">
      ${settings?`<div class="guide-h">Settings to meet this policy</div>
        <table class="guide-tbl"><tbody>${settings}</tbody></table>`:''}
      ${steps?`<div class="guide-h">Configuration steps</div><ol class="guide-steps">${steps}</ol>`:''}
      ${docs}
    </div>
  </details>`;
}

export function renderCards(){
  const head = $('#contentHead');
  const list = visiblePolicies();
  head.innerHTML = `<h2>${state.search ? 'Search results' : enc(state.section||'')}</h2>
     <div class="meta">${list.length} ${state.impact==='all'?'':state.impact+' impact '}policies${state.search?` matching "${enc(state.searchRaw)}" across all sections`:''}</div>`;
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
      ${guidanceHtml(p.Guidance)}
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

// Refresh just one card's overdue badge in place (no full list rebuild).
export function updateCardDue(id){
  const row1 = document.querySelector(`#cards .pcard[data-id="${id}"] .row1`);
  if(!row1) return;
  const existing = row1.querySelector('.due-badge');
  if(existing) existing.remove();
  const p = state.policies.find(x=>x.Id===id);
  const html = p ? dueBadgeHtml(dueState(p)) : '';
  if(html) row1.insertAdjacentHTML('beforeend', html);
}

export async function updateField(id, field, value, el){
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
