/* configure.js — guided "how to configure" walkthrough modal.
   Opens from a policy card's Configure button; shows the portal path as a
   breadcrumb, the settings to set, and the steps as a tick-off checklist with a
   live progress bar so you can follow along while clicking in the real admin
   portal. Check state is IN-SESSION ONLY: it's rebuilt fresh on each open and
   cleared when the modal closes — the policy's Status field stays the source of
   truth for "done". */
import { $, $$, enc } from './dom.js';
import { state } from './state.js';
import { statusClass } from './format.js';

// Best-effort link to the relevant admin portal root, derived from the first
// segment of the Portal Path (or an explicit guidance.portalUrl override). Only
// well-known, stable portal roots — we never fabricate a deep link to a
// specific policy page.
const PORTAL_ROOTS = [
  [/defender/,                        'https://security.microsoft.com'],
  [/entra/,                           'https://entra.microsoft.com'],
  [/exchange/,                        'https://admin.exchange.microsoft.com'],
  [/intune|endpoint/,                 'https://intune.microsoft.com'],
  [/purview|compliance/,              'https://purview.microsoft.com'],
  [/teams/,                           'https://admin.teams.microsoft.com'],
  [/sharepoint/,                      'https://admin.microsoft.com/sharepoint'],
  [/azure/,                           'https://portal.azure.com'],
  [/microsoft 365|m365|admin center/, 'https://admin.microsoft.com'],
];
function portalUrl(g, portalPath){
  if(g && typeof g.portalUrl === 'string' && /^https?:\/\//i.test(g.portalUrl)) return g.portalUrl;
  const first = (portalPath || '').split(/[>›]/)[0].trim().toLowerCase();
  for(const [re, url] of PORTAL_ROOTS){ if(re.test(first)) return url; }
  return '';
}

// A single-item list can round-trip through PowerShell's JSON as a scalar.
const asArray = v => v == null ? [] : (Array.isArray(v) ? v : [v]);

// Does a policy have anything worth walking through? (gates the card button)
export function hasGuidance(p){
  const g = p && p.Guidance;
  return !!g && (asArray(g.requiredSettings).length || asArray(g.steps).length);
}

export function initConfigure(){
  const overlay = $('#configOverlay');
  if(!overlay) return;
  const close = () => overlay.classList.add('hidden');
  $('#configClose').onclick = close;
  overlay.onclick = e => { if(e.target === overlay) close(); };
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
  });
}

export function openConfigure(id){
  const p = state.policies.find(x => x.Id === id);
  if(!hasGuidance(p)) return;
  const g = p.Guidance;
  const overlay = $('#configOverlay');
  const modal = overlay.querySelector('.modal');

  // Tint the modal by impact (mirrors the inline guide panel's per-impact color).
  modal.className = 'modal modal-config impact-' + (p.ImpactClass || 'none');
  $('#configTitle').textContent = 'Configure: ' + p.PolicyName;

  const crumbs = (p.PortalPath || '').split(/[>›]/).map(s => s.trim()).filter(Boolean);
  const crumbHtml = crumbs.length
    ? `<nav class="cfg-crumbs">${crumbs.map(c => `<span class="cfg-crumb">${enc(c)}</span>`)
        .join('<span class="cfg-sep">▸</span>')}</nav>`
    : '';
  const url = portalUrl(g, p.PortalPath);
  const openBtn = url
    ? `<a class="cfg-portal" href="${enc(url)}" target="_blank" rel="noopener">Open portal ↗</a>` : '';

  const settings = asArray(g.requiredSettings);
  const settingsHtml = settings.length ? `
    <div class="cfg-sec">
      <div class="cfg-h">Settings to set</div>
      <table class="cfg-tbl"><tbody>${settings.map(s =>
        `<tr><td>${enc(s.label)}</td><td>${enc(s.value)}</td></tr>`).join('')}</tbody></table>
    </div>` : '';

  const steps = asArray(g.steps);
  const stepsHtml = steps.length ? `
    <div class="cfg-sec">
      <div class="cfg-h cfg-h-steps">
        <span>Steps</span>
        <span class="cfg-prog">
          <span class="cfg-prog-bar"><span class="cfg-prog-fill" style="width:0%"></span></span>
          <span class="cfg-prog-txt">0/${steps.length}</span>
        </span>
      </div>
      <ol class="cfg-steps">${steps.map((s, i) => `
        <li class="cfg-step">
          <label>
            <input type="checkbox" class="cfg-check">
            <span class="cfg-num">${i + 1}</span>
            <span class="cfg-txt">${enc(s)}</span>
          </label>
        </li>`).join('')}</ol>
    </div>` : '';

  const docsUrl = (g.docs && /^https?:\/\//i.test(g.docs)) ? g.docs : '';
  const docs = docsUrl
    ? `<a class="cfg-learn" href="${enc(docsUrl)}" target="_blank" rel="noopener">Microsoft Learn ↗</a>`
    : '<span></span>';

  $('#configBody').innerHTML = `
    <div class="cfg-top">
      <span class="badge ${p.ImpactClass}">${enc(p.Impact)}</span>
      <span class="status-chip ${statusClass(p.Status)}">${enc(p.Status)}</span>
    </div>
    <div class="cfg-crumbrow">${crumbHtml}${openBtn}</div>
    ${settingsHtml}
    ${stepsHtml}
    <div class="cfg-foot">${docs}<button type="button" class="btn cta" id="cfgDone">Done</button></div>`;

  // Live progress. In-session only — rebuilt on every open, so closing clears it.
  const total = steps.length;
  const fill = $('.cfg-prog-fill', overlay);
  const txt  = $('.cfg-prog-txt', overlay);
  const recount = () => {
    const done = $$('.cfg-check', overlay).filter(c => c.checked).length;
    if(fill) fill.style.width = total ? Math.round(100 * done / total) + '%' : '0%';
    if(txt)  txt.textContent = `${done}/${total}`;
  };
  $$('.cfg-check', overlay).forEach(c => c.addEventListener('change', () => {
    c.closest('.cfg-step').classList.toggle('done', c.checked);
    recount();
  }));
  $('#cfgDone').onclick = () => overlay.classList.add('hidden');

  overlay.classList.remove('hidden');
}
