// =========================================================
// Agendamento guiado: o cliente escolhe serviço, barbeiro, dia e
// horário, e o site monta a mensagem pronta no WhatsApp. A barbearia
// confirma pelo próprio WhatsApp.
//
// Os horários que os barbeiros marcaram como ocupados no painel aparecem
// riscados como "ocupado" — o site recebe só início e fim, nada sobre o
// cliente. Se a agenda não carregar, todos os horários aparecem livres.
//
// Os botões "Agendar" continuam sendo links normais do WhatsApp:
// se este script não carregar, eles funcionam do mesmo jeito.
// =========================================================
import { siteData } from './site-data.js';
import { saoPauloToMs, toMinutes, upcomingOpenDays } from './hours.js';
import { escapeHtml, isBackdropClick, waLink } from './utils.js';

const dialog = document.getElementById('booking-dialog');
const form = dialog?.querySelector('form');

const SLOT_MINUTES = 30;
const BUSY_MAX_AGE = 60 * 1000; // reconsulta a agenda se a janela ficar aberta mais de 1 min

let days = [];
let barbers = []; // [{ id, name }] na ordem da página
let busy = null; // Map: id do barbeiro -> [[início, fim], ...] em ms. null = agenda indisponível
let busyState = 'idle'; // idle | loading | ready | error
let busyLoadedAt = 0;
let busyRequest = null;

/** Serviços na ordem em que aparecem na página (banco ou conteúdo padrão). */
function servicesFromPage() {
  const groups = [
    { label: 'Visagismo', selector: '#visagism-band:not([hidden]) [data-service]' },
    { label: 'Clássicos', selector: '#menu-classics [data-service]' },
    { label: 'Especiais', selector: '#menu-specials [data-service]' },
  ];
  return groups
    .map((g) => ({
      label: g.label,
      items: [...new Set([...document.querySelectorAll(g.selector)].map((el) => el.dataset.service.trim()).filter(Boolean))],
    }))
    .filter((g) => g.items.length);
}

function barbersFromPage() {
  const section = document.getElementById('equipe');
  if (!section || section.hidden) return [];
  return [...section.querySelectorAll('.team-card')]
    .map((card) => ({ id: card.dataset.barberId || '', name: card.querySelector('h3')?.textContent.trim() || '' }))
    .filter((b) => b.name);
}

function renderServices(selected) {
  const select = form.service;
  const groups = servicesFromPage();
  select.innerHTML =
    '<option value="">Escolha o serviço</option>' +
    groups
      .map((g) => `<optgroup label="${escapeHtml(g.label)}">${g.items
        .map((s) => `<option value="${escapeHtml(s)}"${s === selected ? ' selected' : ''}>${escapeHtml(s)}</option>`)
        .join('')}</optgroup>`)
      .join('') +
    '<option value="Outro (explico na mensagem)">Outro / não sei ainda</option>';
}

function renderBarbers(selectedId, selectedName) {
  const field = form.querySelector('[data-field="barber"]');
  barbers = barbersFromPage();
  field.hidden = !barbers.length;
  form.barber.innerHTML =
    '<option value="">Sem preferência</option>' +
    barbers.map((b, i) => `<option value="${i}">${escapeHtml(b.name)}</option>`).join('');
  const index = barbers.findIndex((b) => (selectedId ? b.id === selectedId : selectedName && b.name === selectedName));
  form.barber.value = index >= 0 ? String(index) : '';
}

const selectedBarber = () => (form.barber.value === '' ? null : barbers[Number(form.barber.value)] || null);
const currentDay = () => days[Number(form.querySelector('input[name="day"]:checked')?.value)];

/**
 * O horário (dia + "09:30") está ocupado? Com barbeiro escolhido, vale a
 * agenda dele; "sem preferência" só fica ocupado se todos estiverem.
 */
function isTaken(day, time) {
  if (!busy) return false;
  const start = saoPauloToMs(day.ymd, toMinutes(time));
  const end = start + SLOT_MINUTES * 60000;
  const takenFor = (b) => (busy.get(b.id) || []).some(([s, e]) => s < end && e > start);
  const chosen = selectedBarber();
  if (chosen) return Boolean(chosen.id) && takenFor(chosen);
  return barbers.length > 0 && barbers.every((b) => b.id && takenFor(b));
}

function renderDays() {
  days = upcomingOpenDays(siteData.hours);
  const box = form.querySelector('.day-options');
  const empty = form.querySelector('.booking-empty');
  empty.hidden = days.length > 0;
  box.innerHTML = days
    .map((d, i) => `
      <label class="day-chip">
        <input type="radio" name="day" value="${i}"${i === 0 ? ' checked' : ''}>
        <span><strong>${escapeHtml(d.shortLabel)}</strong><small>${escapeHtml(d.dateLabel)}</small><em class="day-full" hidden>lotado</em></span>
      </label>`)
    .join('');
}

function renderTimes() {
  const box = form.querySelector('.time-options');
  const status = form.querySelector('.time-status');
  const legend = form.querySelector('.time-legend');
  const day = currentDay();
  const previous = form.querySelector('input[name="time"]:checked')?.value;

  if (!day) {
    box.innerHTML = '';
    status.textContent = '';
    legend.hidden = true;
    return;
  }

  let free = 0;
  box.innerHTML = day.slots
    .map((t) => {
      const taken = isTaken(day, t);
      if (!taken) free++;
      return `
        <label class="time-chip${taken ? ' is-busy' : ''}">
          <input type="radio" name="time" value="${t}"${taken ? ' disabled' : ''}${!taken && t === previous ? ' checked' : ''}>
          <span><strong>${t}</strong>${taken ? '<small>ocupado</small>' : ''}</span>
        </label>`;
    })
    .join('');

  legend.hidden = !busy;
  if (busyState === 'loading') status.textContent = 'Conferindo a agenda...';
  else if (busy && !free) status.textContent = 'Todos os horários deste dia estão ocupados. Escolha outro dia ou outro barbeiro.';
  else status.textContent = '';
}

/** Marca os dias lotados e redesenha os horários com a agenda atual. */
function refreshAvailability() {
  form.querySelectorAll('.day-chip').forEach((chip) => {
    const day = days[Number(chip.querySelector('input').value)];
    const full = Boolean(busy && day && day.slots.every((t) => isTaken(day, t)));
    chip.classList.toggle('is-full', full);
    chip.querySelector('.day-full').hidden = !full;
  });
  renderTimes();
}

/** Busca os horários ocupados dos próximos dias (só início/fim de cada barbeiro). */
function loadBusy() {
  if (!days.length || !barbers.some((b) => b.id)) {
    busy = null;
    busyState = 'idle';
    return Promise.resolve();
  }
  if ((busyState === 'ready' || busyState === 'error') && Date.now() - busyLoadedAt < BUSY_MAX_AGE) {
    return Promise.resolve();
  }
  if (busyRequest) return busyRequest;

  if (!busy) {
    busyState = 'loading';
    refreshAvailability();
  }
  const first = days[0];
  const last = days[days.length - 1];

  busyRequest = (async () => {
    try {
      const { supabase } = await import('./supabase-client.js');
      const { data, error } = await supabase.rpc('busy_slots', {
        p_from: first.ymd,
        p_days: last.offset - first.offset + 1,
      });
      if (error) throw error;
      const map = new Map();
      for (const row of data || []) {
        if (!map.has(row.barber_id)) map.set(row.barber_id, []);
        map.get(row.barber_id).push([Date.parse(row.starts_at), Date.parse(row.ends_at)]);
      }
      busy = map;
      busyState = 'ready';
      busyLoadedAt = Date.now();
    } catch (err) {
      console.warn('Agenda indisponível, mostrando todos os horários:', err?.message || err);
      busy = null;
      busyState = 'error';
      busyLoadedAt = Date.now();
    } finally {
      busyRequest = null;
    }
    if (dialog.open) refreshAvailability();
  })();
  return busyRequest;
}

function setMessage(text) {
  const box = form.querySelector('.form-msg');
  box.textContent = text;
  box.className = text ? 'form-msg error' : 'form-msg';
}

function openBooking(service, barberId = '', barberName = '') {
  setMessage('');
  renderServices(service);
  renderBarbers(barberId, barberName);
  renderDays();
  refreshAvailability();
  if (!dialog.open) dialog.showModal();
  (service ? form.querySelector('input[name="day"]') : form.service)?.focus();
  loadBusy();
}

function submit(e) {
  e.preventDefault();
  const day = currentDay();
  const service = form.service.value;
  const time = form.querySelector('input[name="time"]:checked')?.value || '';
  const name = form.client_name.value.trim().replace(/\s+/g, ' ').slice(0, 60);
  const note = form.note.value.trim().slice(0, 300);
  const barber = selectedBarber();

  if (!service) return setMessage('Escolha o serviço.');
  if (!day) return setMessage('Escolha o dia.');
  if (!time) return setMessage('Escolha um horário livre.');
  if (isTaken(day, time)) return setMessage('Esse horário acabou de ser ocupado. Escolha outro.');
  if (name.length < 2) return setMessage('Informe seu nome.');

  const lines = [
    'Olá! Gostaria de agendar um horário na Tonsorium.',
    '',
    `Serviço: ${service}`,
    `Barbeiro: ${barber ? barber.name : 'sem preferência'}`,
    `Dia: ${day.fullLabel}`,
    `Horário: ${time}`,
    `Nome: ${name}`,
  ];
  if (note) lines.push(`Obs.: ${note}`);

  window.open(waLink(siteData.whatsapp, lines.join('\n')), '_blank', 'noopener');
  dialog.close();
  form.reset();
}

function init() {
  if (!dialog || !form) return;

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-booking]');
    if (!trigger) return;
    e.preventDefault();
    openBooking(trigger.dataset.service || '', trigger.dataset.barberId || '', trigger.dataset.barber || '');
  });

  form.addEventListener('change', (e) => {
    if (e.target.name === 'day') {
      renderTimes();
      loadBusy();
    }
    if (e.target.name === 'barber') refreshAvailability();
  });
  form.addEventListener('submit', submit);
  dialog.addEventListener('click', (e) => {
    if (isBackdropClick(dialog, e) || e.target.closest('[data-close]')) dialog.close();
  });
  // O link "falar direto no WhatsApp" fecha a janela ao abrir a conversa.
  dialog.querySelector('.booking-direct')?.addEventListener('click', () => dialog.close());
}

init();
