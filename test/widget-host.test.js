// Tests for shared/widget-host.js — the per-widget render lifecycle the editor
// canvas and the live player now share. The plugin lookup is injected so the
// lifecycle is exercised without a DOM or the global registry.
import { describe, test, expect } from './runner.js';
import { mountWidget } from '../shared/widget-host.js';

describe('widget-host · mountWidget', () => {
  test('renders the plugin once with an injected (un-aborted) signal and ctx', () => {
    const calls = [];
    const plugin = { type: 'fake', render: (slideObj, container, ctx) => { calls.push({ slideObj, container, ctx }); return () => {}; } };
    const container = {};
    const widget = { id: 'w1', type: 'fake', title: 'Hello', content: { a: 1 } };
    mountWidget(widget, { duration: 7 }, container, { mode: 'preview', t: k => k }, () => plugin);
    expect(calls).toHaveLength(1);
    expect(calls[0].container).toBe(container);
    expect(calls[0].ctx.mode).toBe('preview');
    expect(typeof calls[0].ctx.t).toBe('function');
    expect(calls[0].ctx.signal instanceof AbortSignal).toBe(true);
    expect(calls[0].ctx.signal.aborted).toBe(false);
    // widgetAsSlide adaptation: content/title/duration surface to the plugin.
    expect(calls[0].slideObj.content).toEqual({ a: 1 });
    expect(calls[0].slideObj.title).toBe('Hello');
    expect(calls[0].slideObj.duration).toBe(7);
  });

  test('dispose runs the plugin teardown once and aborts the signal', () => {
    let disposed = 0; let signal = null;
    const plugin = { type: 'fake', render: (s, c, ctx) => { signal = ctx.signal; return () => { disposed++; }; } };
    const dispose = mountWidget({ id: 'w', type: 'fake', content: {} }, {}, {}, { mode: 'live' }, () => plugin);
    expect(signal.aborted).toBe(false);
    dispose();
    expect(disposed).toBe(1);
    expect(signal.aborted).toBe(true);
  });

  test('a synchronous render throw calls onError and still returns a safe dispose', () => {
    let onError = 0;
    const plugin = { type: 'fake', render: () => { throw new Error('boom'); } };
    const dispose = mountWidget({ id: 'w', type: 'fake', content: {} }, {}, {}, { onError: () => { onError++; } }, () => plugin);
    expect(onError).toBe(1);
    dispose(); // must not throw despite the failed render
    expect(onError).toBe(1);
  });

  test('a plugin that returns no dispose still yields a safe dispose', () => {
    const plugin = { type: 'fake', render: () => null };
    const dispose = mountWidget({ id: 'w', type: 'fake', content: {} }, {}, {}, {}, () => plugin);
    dispose(); // must not throw
    expect(typeof dispose).toBe('function');
  });

  test('an unknown widget type renders the missing-widget box and a no-op dispose', () => {
    const container = { innerHTML: '' };
    const dispose = mountWidget({ id: 'w', type: 'nope', content: {} }, {}, container, {}, () => undefined);
    expect(container.innerHTML).toContain('Unknown widget: nope');
    dispose(); // must not throw
    expect(typeof dispose).toBe('function');
  });

  test('onError is also passed to the plugin as its runtime error hook', () => {
    let hookCalled = 0;
    const plugin = { type: 'fake', render: (s, c, ctx) => { ctx.onError?.(); return () => {}; } };
    mountWidget({ id: 'w', type: 'fake', content: {} }, {}, {}, { onError: () => { hookCalled++; } }, () => plugin);
    expect(hookCalled).toBe(1);
  });
});
