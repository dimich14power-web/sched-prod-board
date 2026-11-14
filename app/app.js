import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('[data-role="status"]');

// Rows are kept by incident id, so a refresh never rebuilds a row on-call is acting on.
const rows = new Map();
const acked = new Map(); // id -> ackedAt

// The viewer's own zone and order: en-GB, de-DE, en-NZ … give day before month; en-US gives month first.
const timeFormat = new Intl.DateTimeFormat(navigator.languages, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function markAcked(row, ackedAt) {
  const slot = row.querySelector('.act');
  slot.innerHTML = `<span data-testid="acked" class="acked" title="${esc(ackedAt)}">acked</span>`;
}

function buildRow(i) {
  const row = document.createElement('li');
  row.dataset.testid = 'incident-row';
  row.dataset.id = i.id;
  row.className = `row ${i.severity}`;
  row.innerHTML = `
    <span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}" title="${esc(i.openedAt)}">${esc(timeFormat.format(new Date(i.openedAt)))}</time>
    <span class="act"><button type="button" data-testid="ack">Ack</button></span>`;
  row.querySelector('[data-testid="ack"]').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      const reply = await ack(i.id);
      acked.set(i.id, reply.ackedAt);
      markAcked(row, reply.ackedAt);
    } catch (err) {
      button.disabled = false;
      status.textContent = `ack failed: ${err.message}`;
    }
  });
  if (acked.has(i.id)) markAcked(row, acked.get(i.id));
  return row;
}

function render(incidents) {
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const ids = new Set(sorted.map((i) => i.id));
  for (const [id, row] of rows) if (!ids.has(id)) (row.remove(), rows.delete(id));
  // Walk newest first; new rows go in at their place, existing rows stay the same element.
  let prev = null;
  for (const i of sorted) {
    let row = rows.get(i.id);
    if (!row) rows.set(i.id, (row = buildRow(i)));
    const want = prev ? prev.nextSibling : list.firstChild;
    if (row !== want) list.insertBefore(row, want);
    prev = row;
  }
  loader.hidden = true;
  empty.hidden = sorted.length > 0;
  list.hidden = sorted.length === 0;
}

async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    status.textContent = `· updated ${timeFormat.format(new Date(page.updatedAt))}`;
  } catch (err) {
    status.textContent = `· refresh failed: ${err.message}`;
  } finally {
    setTimeout(refresh, REFRESH_MS);
  }
}

refresh();
