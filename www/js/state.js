/* state.js — the single shared client-side state object */
export const state = {
  active:false, policies:[], statusOptions:[], doneStatuses:[], verb:'done',
  section:null, impact:'all', search:'', searchRaw:'', view:'checklist', attention:false,
  sourceFile:null, dirty:false, saving:false, autosaveFailed:false, playbook:null
};
