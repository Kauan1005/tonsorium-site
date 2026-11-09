// Horário de funcionamento: tudo calculado no fuso de São Paulo, não no
// fuso do aparelho de quem está vendo o site.

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Mesmo horário que está escrito no HTML — usado se o banco não responder.
export const DEFAULT_HOURS = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  day_of_week: d,
  is_closed: d === 0,
  open_time: '09:00',
  close_time: d === 6 ? '18:00' : '20:00',
}));

/** "09:00:00" -> "09:00" */
export const hhmm = (t) => String(t || '').slice(0, 5);

export const toMinutes = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number);
  return h * 60 + (m || 0);
};

export const minutesToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Data e hora atuais em São Paulo: { year, month, day, dow, minutes }. */
const SP_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Data e hora de um instante em São Paulo: { year, month, day, dow, minutes }. */
export function partsInSaoPaulo(date) {
  const parts = SP_FORMAT.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  };
}

/** Data e hora atuais em São Paulo: { year, month, day, dow, minutes }. */
export const nowInSaoPaulo = () => partsInSaoPaulo(new Date());

/**
 * "2026-11-05" + minutos (570 = 09:30) no horário de São Paulo -> instante
 * em milissegundos. Funciona mesmo se o Brasil voltar a ter horário de verão.
 */
export function saoPauloToMs(ymd, minutes) {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const guess = base + minutes * 60000 + 3 * 3600000; // SP costuma ser UTC-3
  const p = partsInSaoPaulo(new Date(guess));
  const dayDiff = (Date.UTC(p.year, p.month - 1, p.day) - base) / 86400000;
  return guess - (dayDiff * 1440 + p.minutes - minutes) * 60000;
}

/**
 * Próximos dias abertos com os horários de início possíveis (de 30 em 30 min).
 * Hoje só entra com horários a partir de 30 min depois de agora.
 */
export function upcomingOpenDays(hours, { maxDays = 10, lookAhead = 21, step = 30, leadMinutes = 30 } = {}) {
  const byDay = new Map(hours.map((h) => [h.day_of_week, h]));
  const now = nowInSaoPaulo();
  const days = [];

  for (let offset = 0; offset < lookAhead && days.length < maxDays; offset++) {
    const date = new Date(Date.UTC(now.year, now.month - 1, now.day + offset));
    const dow = date.getUTCDay();
    const h = byDay.get(dow);
    if (!h || h.is_closed) continue;

    const open = toMinutes(h.open_time);
    const close = toMinutes(h.close_time);
    const slots = [];
    for (let m = open; m <= close - step; m += step) {
      if (offset === 0 && m < now.minutes + leadMinutes) continue;
      slots.push(minutesToTime(m));
    }
    if (!slots.length) continue;

    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    days.push({
      offset,
      dow,
      ymd: date.toISOString().slice(0, 10),
      dateLabel: `${dd}/${mm}`,
      shortLabel: offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : WEEKDAY_SHORT[dow],
      fullLabel: `${WEEKDAY_LABELS[dow]}, ${dd}/${mm}${offset === 0 ? ' (hoje)' : offset === 1 ? ' (amanhã)' : ''}`,
      slots,
    });
  }
  return days;
}
