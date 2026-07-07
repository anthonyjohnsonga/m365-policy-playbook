/* dom.js — tiny DOM + generic helpers (no dependencies) */
export const $  = (s, r=document) => r.querySelector(s);
export const $$ = (s, r=document) => [...r.querySelectorAll(s)];
export const enc = s => (s ?? '').toString()
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

/* Standard modal-overlay wiring: the ✕ button, a backdrop click, and Escape
   all close it. Returns { open, close }; the optional onOpen runs on every
   open (load fresh data, reset the form). Callers that render before showing
   (e.g. the configure walkthrough) can ignore `open` and unhide themselves. */
export function wireModal(overlaySel, closeSel, onOpen){
  const overlay = $(overlaySel);
  if(!overlay) return { open(){}, close(){} };
  const close = () => overlay.classList.add('hidden');
  const open  = () => { overlay.classList.remove('hidden'); if(onOpen) onOpen(); };
  const x = $(closeSel);
  if(x) x.onclick = close;
  overlay.onclick = e => { if(e.target === overlay) close(); };
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
  });
  return { open, close };
}
