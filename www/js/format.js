/* format.js — date / status / schedule-health formatting helpers */
import { state } from './state.js';

export function parseDate(s){ if(!s) return null; const d=new Date(s+'T00:00:00'); return isNaN(d)?null:d; }
export function fmtDate(s){ const d=parseDate(s); return d ? d.toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ''; }
export function shortPhase(name){ return name.replace(/^Phase\s*\d+\s*[-–]\s*/,''); }

export function statusClass(s){ return 's-' + (s||'').toLowerCase().replace(/[^a-z]/g,''); }

export function curClass(c){
  if(c==='Intune') return 'cur-intune';
  if(c==='Hybrid') return 'cur-hybrid';
  return 'cur-none';
}

export function toDateVal(v){
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

export function isDone(s){ return state.doneStatuses.includes(s); }
// '' | 'soon' | 'overdue' — mirrors Get-PolicyDueState on the server.
export function dueState(p){
  if(isDone(p.Status)) return '';
  const d = parseDate(p.PlannedDate);
  if(!d) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.round((d - today) / 86400000);
  if(days < 0)  return 'overdue';
  if(days <= 7) return 'soon';
  return '';
}
export function dueBadgeHtml(due){
  return due==='overdue' ? `<span class="due-badge overdue">&#9888; Overdue</span>`
       : due==='soon'    ? `<span class="due-badge soon">Due soon</span>` : '';
}
