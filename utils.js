export const DEFAULT_WHATSAPP = '5511912369764';

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

/** Só aceita https:// — bloqueia "javascript:" e afins vindos do banco. */
export function safeUrl(url) {
  const s = String(url ?? '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

export function waLink(number, message) {
  const digits = String(number || DEFAULT_WHATSAPP).replace(/\D/g, '') || DEFAULT_WHATSAPP;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function starsHtml(rating) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `<span class="stars" role="img" aria-label="${n} de 5 estrelas">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(5 - n)}</span></span>`;
}

/**
 * Clique no fundo escurecido, fora da caixa do <dialog>. (Só comparar
 * e.target com o dialog também fecharia ao clicar no espaço interno dele.)
 */
export function isBackdropClick(dialog, e) {
  if (e.target !== dialog) return false;
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

let toastTimer;
export function showToast(message, kind = 'ok') {
  const el = document.getElementById('site-toast');
  if (!el) return;
  el.textContent = message;
  el.className = `site-toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'site-toast'; }, 5000);
}
