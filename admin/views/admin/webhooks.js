// Verwaltung → Webhooks Tab. HMAC-signed event subscriptions pointing at the
// owner's own URL; Studio creates/tests/pauses/deletes them, the platform
// delivers. Sits behind the Tab-Shell: supplies load + render + its actions.
import { mountTab, table, esc, unwrapList, openFormModal, revealSecretModal } from './shell.js';
import { webhooks as webhooksApi } from '../../api.js';
import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';
import { fmtDateTime } from '../../format-date.js';

export function mountWebhooks(body) {
  return mountTab(body, {
    title: t('admin.webhooks'),
    headerActions: `<button class="bb-btn bb-btn-primary" data-act="add">${t('admin.add')}</button>`,
    onHeader: (ctx) => ctx.onClick('[data-act="add"]', () => addWebhook(ctx)),
    load: async () => unwrapList(await webhooksApi.list(), 'webhooks', 'items'),
    isEmpty: (list) => !list.length,
    emptyText: t('wh.empty'),
    emptyOpts: { icon: '🪝', cta: `<button class="bb-btn bb-btn-primary" data-act="add-empty">${t('admin.add')} Webhook</button>` },
    onEmpty: (ctx) => ctx.onClick('[data-act="add-empty"]', () => addWebhook(ctx)),
    render: (list, ctx) => {
      // Verified server shape: { id, url, description, eventPattern, secretPrefix,
      //   isActive, createdAt, lastTriggeredAt, …, consecutiveFailures }
      ctx.content.innerHTML = table(
        ['URL', t('wh.colPattern'), t('wh.colStatus'), t('wh.colSecret'), t('wh.colLastTrigger'), t('wh.colActions')],
        list.map(w => `<tr>
          <td><code>${esc(w.url ?? '')}</code>${w.description ? `<br><span class="avs-muted">${esc(w.description)}</span>` : ''}</td>
          <td><code>${esc(w.eventPattern ?? '*')}</code></td>
          <td>${esc(w.isActive ? t('wh.stateActive') : t('wh.stateInactive'))}${w.consecutiveFailures > 0 ? ` · <span style="color:#fca5a5;">${esc(t('wh.errors', { n: w.consecutiveFailures }))}</span>` : ''}</td>
          <td><code>${esc(w.secretPrefix ?? '—')}…</code></td>
          <td>${esc(fmtDateTime(w.lastTriggeredAt))}</td>
          <td>
            <button class="bb-btn" data-test="${esc(w.id)}">${t('admin.test')}</button>
            <button class="bb-btn" data-toggle="${esc(w.id)}" data-currently="${w.isActive ? '1' : '0'}">${w.isActive ? t('wh.pause') : t('wh.activate')}</button>
            <button class="bb-btn bb-btn-danger" data-del="${esc(w.id)}">${t('common.delete')}</button>
          </td>
        </tr>`)
      );
      ctx.onAction('[data-toggle]', async (b) => {
        const newState = b.dataset.currently !== '1';
        await webhooksApi.setActive(b.dataset.toggle, newState);
        toast(newState ? t('wh.toggledOn') : t('wh.toggledOff'), { kind: 'success' });
      });
      ctx.onAction('[data-del]', async (b) => {
        await webhooksApi.remove(b.dataset.del);
        toast(t('common.delete'), { kind: 'success' });
      });
      // Test manages its own inline timing/feedback and does NOT reload.
      ctx.onClick('[data-test]', (b) => testWebhook(b));
    },
  });
}

async function testWebhook(b) {
  const originalLabel = b.textContent;
  b.disabled = true; b.textContent = '…';
  const start = performance.now();
  try {
    const r = await webhooksApi.test(b.dataset.test);
    const dur = Math.round(performance.now() - start);
    const status = r?.statusCode ?? r?.status ?? '?';
    const ok = (status >= 200 && status < 300) || r?.success;
    b.textContent = `${ok ? '✓' : '✗'} ${status} · ${dur}ms`;
    b.classList.add(ok ? 'bb-btn-success' : 'bb-btn-danger');
    toast(t('wh.testResult', { result: ok ? t('wh.testOk') : t('wh.testFail'), status, dur }), { kind: ok ? 'success' : 'error', ttl: 4000 });
    setTimeout(() => { b.textContent = originalLabel; b.disabled = false; b.classList.remove('bb-btn-success', 'bb-btn-danger'); }, 4000);
  } catch (e) {
    const dur = Math.round(performance.now() - start);
    b.textContent = `✗ ${dur}ms`;
    b.classList.add('bb-btn-danger');
    toast(e.message, { kind: 'error' });
    setTimeout(() => { b.textContent = originalLabel; b.disabled = false; b.classList.remove('bb-btn-danger'); }, 4000);
  }
}

async function addWebhook(ctx) {
  // Server takes ONE eventPattern string, not an array. Pattern syntax: namespace
  // dotted-style with wildcards (e.g. `display.*`, `display.content.delivered`).
  const box = await openFormModal({
    title: t('wh.addTitle'),
    body: `
    <div class="bb-form-group"><label>${t('wh.url')}</label><input id="wh-url" placeholder="https://example.com/hook"></div>
    <div class="bb-form-group"><label>${t('wh.eventsPattern')}</label>
      <select id="wh-pattern">
        <optgroup label="${t('wh.groupDisplay')}">
          <option value="display.*">display.* ${t('wh.optAll')}</option>
          <option value="display.content.*">display.content.*</option>
          <option value="display.content.delivered">display.content.delivered</option>
          <option value="display.approval.*">display.approval.*</option>
          <option value="display.status.online">display.status.online</option>
          <option value="display.status.offline">display.status.offline</option>
        </optgroup>
        <optgroup label="${t('wh.groupData')}">
          <option value="data.*">data.* (changed + deleted)</option>
          <option value="data.changed">data.changed</option>
          <option value="data.deleted">data.deleted</option>
        </optgroup>
      </select>
      <p class="bb-form-help" style="font-size:11px;margin-top:4px;">${t('wh.dataScopeHint')}</p>
    </div>
    <div class="bb-form-group"><label>${t('wh.description')}</label><input id="wh-desc" placeholder="${t('wh.descPlaceholder')}"></div>`,
  });
  if (!box) return;
  const url = box.querySelector('#wh-url').value.trim();
  const eventPattern = box.querySelector('#wh-pattern').value;
  const description = box.querySelector('#wh-desc').value.trim();
  if (!url || !eventPattern) { toast(t('wh.urlPatternRequired'), { kind: 'warn' }); return; }
  try {
    const created = await webhooksApi.create({ url, eventPattern, ...(description && { description }) });
    // Verified server response shape: { subscription: {…}, signingSecret, warning }.
    // The full secret IS returned once — surface it prominently with copy.
    const sub = created?.subscription ?? created?.webhook ?? created;
    const secret = created?.signingSecret ?? created?.secret;
    const warning = created?.warning ?? t('wh.defaultWarning');
    if (secret) {
      await revealSecretModal({
        title: t('wh.secretTitle'),
        intro: `<p>${t('wh.created', { pattern: `<code>${esc(sub?.eventPattern ?? eventPattern)}</code>` })}</p>`
          + `<p class="bb-form-help" style="color:#fca5a5;">⚠ ${esc(warning)}</p>`,
        label: t('wh.secretLabel'),
        secret,
        ackLabel: t('wh.secretAck'),
      });
    }
    ctx.reload();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}
