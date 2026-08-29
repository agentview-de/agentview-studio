// Undo — the stack, and the two things the editor got wrong around it.
//
// Both were reproducible in a few lines and both destroyed work:
//
//   1. commit() is debounced 250 ms; undo() was not. Pressing ctrl+Z right
//      after an edit — the reflex the feature exists for — undid TWO actions
//      and lost the newest one for good, because it had never been recorded.
//   2. No baseline: canUndo() is "cursor > 0", and the first commit only
//      creates entry 0, so the first edit of a session could not be undone.
//
// The stack itself is now pure (shared/undo-stack.js) and tested here without
// timers; the two store cases below use real ones, because the bug WAS timing.

import { test, expect, describe } from './runner.js';
import { createUndoStack } from '../shared/undo-stack.js';
import { state, commit, undo, redo, canUndo, canRedo, markBaseline, historyReasons } from '../admin/store.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('undo-stack · the pure history', () => {
  test('a fresh stack has nothing to undo or redo', () => {
    const s = createUndoStack();
    expect(s.size()).toBe(0);
    expect(s.canUndo()).toBeFalsy();
    expect(s.canRedo()).toBeFalsy();
    expect(s.undo()).toBe(null);
    expect(s.redo()).toBe(null);
  });

  test('one entry is a floor, not a step: canUndo stays false', () => {
    const s = createUndoStack();
    expect(s.push('A', 'first')).toBeTruthy();
    expect(s.size()).toBe(1);
    expect(s.canUndo()).toBeFalsy();
  });

  test('walks back and forth over the entries', () => {
    const s = createUndoStack();
    s.push('A'); s.push('B'); s.push('C');
    expect(s.canUndo()).toBeTruthy();
    expect(s.undo()).toBe('B');
    expect(s.undo()).toBe('A');
    expect(s.undo()).toBe(null);      // at the floor
    expect(s.canUndo()).toBeFalsy();
    expect(s.redo()).toBe('B');
    expect(s.redo()).toBe('C');
    expect(s.redo()).toBe(null);
    expect(s.canRedo()).toBeFalsy();
  });

  test('a commit that changed nothing does not cost a redo step', () => {
    const s = createUndoStack();
    s.push('A'); s.push('B');
    s.undo();                          // sits on A, B is redoable
    expect(s.push('A', 'no-op')).toBeFalsy();
    expect(s.canRedo()).toBeTruthy();
    expect(s.redo()).toBe('B');
  });

  test('a new edit after an undo forks history — the redo tail is dropped', () => {
    const s = createUndoStack();
    s.push('A'); s.push('B'); s.push('C');
    s.undo(); s.undo();                // back on A
    expect(s.push('D')).toBeTruthy();
    expect(s.size()).toBe(2);
    expect(s.canRedo()).toBeFalsy();
    expect(s.undo()).toBe('A');
  });

  test('the cap drops the OLDEST entry and keeps the cursor on the newest', () => {
    const s = createUndoStack({ limit: 3 });
    for (const v of ['A', 'B', 'C', 'D', 'E']) s.push(v, `r-${v}`);
    expect(s.size()).toBe(3);
    expect(s.reasons()).toEqual(['r-C', 'r-D', 'r-E']);
    expect(s.current()).toBe('E');
    expect(s.index()).toBe(2);
    expect(s.undo()).toBe('D');
  });

  test('clear() empties it', () => {
    const s = createUndoStack();
    s.push('A'); s.push('B');
    s.clear();
    expect(s.size()).toBe(0);
    expect(s.index()).toBe(-1);
    expect(s.current()).toBe(null);
  });
});

describe('store · undo does not lose the edit you are undoing', () => {
  test('REGRESSION: ctrl+Z inside the 250 ms commit window undoes ONE action', async () => {
    state.playlist = { name: 'p', slides: [] };
    markBaseline('load');
    state.playlist.name = 'A';
    commit('rename-A');
    await sleep(320);                  // let that one land

    state.playlist.name = 'B';
    commit('rename-B');
    await sleep(40);                   // …and undo before the debounce fires
    expect(undo()).toBeTruthy();
    expect(state.playlist.name).toBe('A');

    await sleep(320);                  // the stale timer must not corrupt the stack
    expect(state.playlist.name).toBe('A');
    expect(redo()).toBeTruthy();
    expect(state.playlist.name).toBe('B');   // the undone edit is still reachable
  });

  test('REGRESSION: the FIRST edit after loading a document is undoable', async () => {
    state.playlist = { name: 'geladen', slides: [] };
    markBaseline('load');
    expect(canUndo()).toBeFalsy();     // nothing done yet
    state.playlist.name = 'erste Änderung';
    commit('rename');
    await sleep(320);
    expect(canUndo()).toBeTruthy();
    expect(undo()).toBeTruthy();
    expect(state.playlist.name).toBe('geladen');
    expect(canRedo()).toBeTruthy();
    expect(historyReasons()).toEqual(['load', 'rename']);
  });

  test('REGRESSION: undo restores the document, not the chrome around it', async () => {
    state.playlist = { name: 'p', slides: [] };
    markBaseline('load');
    state.playlist.name = 'A';
    commit('rename');
    await sleep(320);

    // The user then walks away from the editor before pressing ctrl+Z.
    state.ui.activeView = 'displays';
    state.ui.themePref = 'light';
    state.ui.adminTab = 'audit';
    state.ui.displayDrawer = 'display-42';

    expect(undo()).toBeTruthy();
    expect(state.playlist.name).toBe('p');
    expect(state.ui.activeView).toBe('displays');
    expect(state.ui.themePref).toBe('light');
    expect(state.ui.adminTab).toBe('audit');
    expect(state.ui.displayDrawer).toBe('display-42');
  });
});
