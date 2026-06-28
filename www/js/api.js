/* api.js — fetch wrapper + toast notifications */
import { $ } from './dom.js';

export async function api(path, opts){
  const r = await fetch(path, opts);
  let body = null;
  try { body = await r.json(); } catch {}
  if(!r.ok){ throw new Error((body && body.error) || ('HTTP '+r.status)); }
  return body;
}

export function toast(msg, isErr){
  const t = $('#toast');
  clearTimeout(t._t);
  if(isErr){
    // Errors stay until dismissed so they can actually be read / noted down.
    // Build with a close button instead of auto-fading after a couple seconds.
    t.textContent = '';
    const span = document.createElement('span'); span.textContent = msg;
    const x = document.createElement('button');
    x.className = 'toast-x'; x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    x.onclick = ()=> t.className = 'toast';
    t.append(span, x);
    t.className = 'toast show err';
  } else {
    t.textContent = msg;
    t.className = 'toast show';
    t._t = setTimeout(()=> t.className='toast', 2600);
  }
}
