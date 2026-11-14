import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('[data-role="status"]');
const confirmBox = document.querySelector('[data-testid="confirm"]');
const confirmText = confirmBox.querySelector('[data-role="confirm-text"]');

// Rows are kept by incident id, so a refresh never rebuilds a row on-call is acting on.
const rows = new Map();
const acked = new Map(); // id -> ackedAt
const seen = new Map(); // id -> incident; rows are never taken off while the board is open

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
  row.querySelector('[data-testid="ack"]').addEventListener('click', () => askAck(i, row));
  if (acked.has(i.id)) markAcked(row, acked.get(i.id));
  return row;
}

// Ack asks first, and the question names the incident, so a row that moved under the pointer is caught
// before anything is sent. The confirm holds the incident it was opened for, whatever the list does next.
let pending = null;

function askAck(i, row) {
  pending = { i, row };
  confirmText.textContent = `Ack ${i.id}? ${i.severity} · ${i.service} · ${i.region} · ${i.summary}`;
  confirmBox.hidden = false;
  confirmBox.querySelector('[data-testid="confirm-ack"]').focus();
}

function closeConfirm() {
  pending = null;
  confirmBox.hidden = true;
}

async function sendAck() {
  if (!pending) return;
  const { i, row } = pending;
  closeConfirm();
  const button = row.querySelector('[data-testid="ack"]');
  if (button) button.disabled = true;
  try {
    const reply = await ack(i.id);
    acked.set(i.id, reply.ackedAt);
    markAcked(row, reply.ackedAt);
  } catch (err) {
    if (button) button.disabled = false;
    status.textContent = `ack failed: ${err.message}`;
  }
}

confirmBox.querySelector('[data-testid="confirm-ack"]').addEventListener('click', sendAck);
confirmBox.querySelector('[data-testid="confirm-cancel"]').addEventListener('click', closeConfirm);
addEventListener('keydown', (e) => e.key === 'Escape' && !confirmBox.hidden && closeConfirm());

function render(incidents) {
  for (const i of incidents) if (!seen.has(i.id)) seen.set(i.id, i);
  const sorted = [...seen.values()].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
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
