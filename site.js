// Comportamentos da página que não dependem do Supabase: animação ao rolar,
// menu do celular, galeria ampliada e ano do rodapé. Roda sempre, mesmo se
// o banco falhar (as seções começam com opacity:0 no CSS e só aparecem
// quando este script marca .in).

function initReveal() {
  const revealEls = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach((el) => io.observe(el));
}

function initMobileNav() {
  const nav = document.querySelector('nav');
  const toggle = document.querySelector('.nav-toggle');
  if (!nav || !toggle) return;

  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.querySelectorAll('.nav-links a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

function initLightbox() {
  const dialog = document.getElementById('lightbox');
  const grid = document.getElementById('gallery-grid');
  if (!dialog || !grid) return;

  const img = dialog.querySelector('img');
  const caption = dialog.querySelector('.lightbox-caption');
  let index = 0;

  const items = () => [...grid.querySelectorAll('.gallery-item')];

  function show(i) {
    const list = items();
    if (!list.length) return;
    index = (i + list.length) % list.length;
    const item = list[index];
    img.src = item.dataset.full;
    img.alt = item.querySelector('img')?.alt || '';
    caption.textContent = item.dataset.caption || '';
    if (!dialog.open) dialog.showModal();
  }

  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.gallery-item');
    if (item) show(items().indexOf(item));
  });
  dialog.querySelector('[data-prev]').addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-next]').addEventListener('click', () => show(index + 1));
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
}

// Mapa do Google sob demanda: só carrega (e só envia dados ao Google) quando o
// visitante toca em "Ver mapa aqui".
function initMap() {
  const card = document.getElementById('loc-map');
  const button = card?.querySelector('[data-load-map]');
  if (!card || !button) return;
  button.addEventListener('click', () => {
    const src = card.dataset.mapSrc || '';
    if (!/^https:\/\/www\.google\.com\/maps\?/.test(src)) return;
    const frame = document.createElement('iframe');
    frame.id = 'loc-map';
    frame.title = 'Mapa com a localização da Tonsorium';
    frame.src = src;
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.allowFullscreen = true;
    card.replaceWith(frame);
  });
}

function initYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = String(new Date().getFullYear());
}

// Abas do cardápio (Clássicos | Especiais), com setas do teclado.
function initMenuTabs() {
  const tabs = [...document.querySelectorAll('.menu-tabs [role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const visible = tabs.filter((t) => !t.hidden);
      const next = visible[(visible.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length];
      select(next);
      next.focus();
    });
    void i;
  });
}

// Setas dos carrosséis (no celular é só arrastar).
function initCarousels() {
  document.querySelectorAll('[data-carousel]').forEach((nav) => {
    const track = document.getElementById(nav.dataset.carousel);
    if (!track) return;
    nav.querySelectorAll('[data-dir]').forEach((btn) => {
      btn.addEventListener('click', () => {
        track.scrollBy({ left: Number(btn.dataset.dir) * track.clientWidth * 0.8, behavior: 'smooth' });
      });
    });
  });
}

// Barra "Agendar | WhatsApp" do celular: aparece depois que o topo sai da tela.
function initMobileBar() {
  const bar = document.getElementById('mobile-bar');
  const hero = document.querySelector('.hero');
  if (!bar || !hero) return;
  let shown = null;
  const update = () => {
    const show = hero.getBoundingClientRect().bottom < 80;
    if (show === shown) return;
    shown = show;
    bar.classList.toggle('show', show);
    bar.setAttribute('aria-hidden', String(!show));
    bar.querySelectorAll('a').forEach((a) => { a.tabIndex = show ? 0 : -1; });
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// Janela "Deixar minha avaliação".
function initReviewDialog() {
  const dialog = document.getElementById('review-dialog');
  if (!dialog) return;
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-review]')) {
      e.preventDefault();
      if (!dialog.open) dialog.showModal();
    }
  });
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) dialog.close();
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initReveal();
  initMobileNav();
  initLightbox();
  initMap();
  initYear();
  initMenuTabs();
  initCarousels();
  initMobileBar();
  initReviewDialog();
});
