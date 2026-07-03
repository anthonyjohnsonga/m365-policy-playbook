/* timeline.js — rollout schedule (project window + phase gantt + phase cards) */
import { $, $$, enc } from './dom.js';
import { api, toast } from './api.js';
import { parseDate, fmtDate, shortPhase, statusClass } from './format.js';
import { markDirty } from './persistence.js';
import { jumpToPolicy } from './companion.js';

export async function renderTimeline(){
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

    // status breakdown for the summary line (covers both the Tier 0/1 and the
    // Email Security status vocabularies; unknown statuses fall to "not started")
    const c = {done:0, planned:0, inprogress:0, notstarted:0, unaccepted:0, drift:0, overdue:0};
    items.forEach(it => {
      if(it.done) c.done++;
      else if(it.status==='Planned') c.planned++;
      else if(it.status==='In Progress') c.inprogress++;
      else if(it.status==='Unaccepted Deviation') c.unaccepted++;
      else if(it.status==='Drift Detected') c.drift++;
      else c.notstarted++;
      if(!it.done && it.dueState==='overdue') c.overdue++;
    });
    const chips = [];
    if(c.overdue)    chips.push(`<span class="chip-mini overdue">&#9888; ${c.overdue} overdue</span>`);
    if(c.done)       chips.push(`<span class="chip-mini done">${c.done} done</span>`);
    if(c.planned)    chips.push(`<span class="chip-mini planned">${c.planned} planned</span>`);
    if(c.inprogress) chips.push(`<span class="chip-mini planned">${c.inprogress} in progress</span>`);
    if(c.notstarted) chips.push(`<span class="chip-mini notstarted">${c.notstarted} not started</span>`);
    if(c.unaccepted) chips.push(`<span class="chip-mini unaccepted">${c.unaccepted} unaccepted</span>`);
    if(c.drift)      chips.push(`<span class="chip-mini unaccepted">${c.drift} drift</span>`);

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

export function wireTimeline(){
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

export async function saveProject(payload){
  try{
    const r = await api('/api/project', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)});
    if(r.changed) markDirty();   // skip the autosave if the schedule didn't change
    renderTimeline();
  }catch(e){ toast(e.message, true); }
}
