// Pure lifecycle cores for the Verwaltung Tab-Shell — no DOM, no imports — so the
// load → loading/error/empty/data state machine and the guarded-action flow are
// unit-testable (test/admin-tab-shell.test.js). shell.js wires these to the DOM.
//
// These hold the control-flow that the 9 Tabs used to hand-roll (and that the
// architecture review flagged as bug-prone: silent catch, missed loading state,
// in-flight races). Pulling it here makes it the first part of the Verwaltung
// console under automated test.

// Drive one Tab's load lifecycle through injected callbacks. Exactly one of
// onError / onEmpty / onData fires per run (after onLoading). Returns the final
// phase so callers and tests can assert the outcome.
export async function runTabLifecycle({ load, isEmpty, onLoading, onError, onEmpty, onData }) {
  onLoading?.();
  let data;
  try {
    data = await load();
  } catch (e) {
    onError?.(e);
    return { phase: 'error', error: e };
  }
  if (typeof isEmpty === 'function' && isEmpty(data)) {
    onEmpty?.(data);
    return { phase: 'empty', data };
  }
  onData?.(data);
  return { phase: 'data', data };
}

// Run one guarded action button: success → onSuccess (the Tab reloads for fresh
// data), failure → onError (toast). Never throws, so a failing action can't take
// down the click handler. The Tab's handler does the API call + success toast;
// the reload + error toast live here, once.
export async function runAction(handler, el, { onSuccess, onError } = {}) {
  try {
    await handler(el);
    onSuccess?.();
  } catch (e) {
    onError?.(e);
  }
}
