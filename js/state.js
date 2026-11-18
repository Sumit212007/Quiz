/* state.js — the single shared, in-memory application state.
 *  bank     : question bank produced by dataLoader.loadBank()
 *  settings : user settings (mirrors localStorage)
 *  session  : the unfinished quiz currently in progress (or null)
 */
export const state = {
  bank: null,
  settings: null,
  session: null,
};
