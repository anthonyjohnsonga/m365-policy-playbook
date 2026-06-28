/* theme.js — light / dark toggle (persisted in localStorage) */
import { $ } from './dom.js';

export function initTheme(){
  const root = document.documentElement;
  const btn = $('#btnTheme');
  const sync = () => { if(btn) btn.textContent = root.getAttribute('data-theme')==='dark' ? '☀' : '☾'; };
  sync();
  if(btn) btn.onclick = () => {
    const next = root.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try{ localStorage.setItem('pb-theme', next); }catch(e){}
    sync();
  };
}
