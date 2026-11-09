import { supabase } from './supabase-client.js';
import { DEFAULT_WHATSAPP, escapeHtml, safeUrl, waLink } from './utils.js';
import { DEFAULT_HOURS, WEEKDAY_LABELS, hhmm, nowInSaoPaulo, toMinutes } from './hours.js';
import { siteData } from './site-data.js';

const ICONS = {
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>`,
  shield: `<path d="M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7l-9-5Z"/>`,
  home: `<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-6h6v6"/>`,
  chart: `<path d="M3 12h4l3 8 4-16 3 8h4"/>`,
  calendar: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>`,
  heart: `<path d="M12 21s-7-4.35-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.65-9.5 9-9.5 9Z"/>`,
};

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el && value != null && value !== '') el.textContent = value;
}

/** Mostra uma seção (e o link dela no menu) que começa escondida. */
function showSection(id) {
  document.getElementById(id)?.removeAttribute('hidden');
  document.querySelectorAll(`[data-section-link="${id}"]`).forEach((a) => a.removeAttribute('hidden'));
}

/** Esconde uma seção (e o link dela no menu) desativada no painel. */
function hideSection(id) {
  document.getElementById(id)?.setAttribute('hidden', '');
  document.querySelectorAll(`[data-section-link="${id}"]`).forEach((a) => a.setAttribute('hidden', ''));
}

const pad2 = (i) => String(i + 1).padStart(2, '0');

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// ---------- "Aberto agora" (sempre no fuso de São Paulo) ----------
function renderOpenNow(hours) {
  const el = document.getElementById('open-now');
  if (!el || !hours.length) return;
  const byDay = new Map(hours.map((h) => [h.day_of_week, h]));
  const { dow: day, minutes } = nowInSaoPaulo();
  const today = byDay.get(day);

  if (today && !today.is_closed && minutes >= toMinutes(today.open_time) && minutes < toMinutes(today.close_time)) {
    el.textContent = `Aberto agora · fecha às ${hhmm(today.close_time)}`;
    el.className = 'open-now is-open';
    return;
  }

  let message = 'Fechado agora';
  for (let i = 0; i < 7; i++) {
    const d = (day + i) % 7;
    const h = byDay.get(d);
    if (!h || h.is_closed) continue;
    if (i === 0 && minutes >= toMinutes(h.open_time)) continue;
    const when = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : WEEKDAY_LABELS[d].toLowerCase();
    message = `Fechado agora · abre ${when} às ${hhmm(h.open_time)}`;
    break;
  }
  el.textContent = message;
  el.className = 'open-now is-closed';
}

function renderHours(hours) {
  const el = document.getElementById('loc-hours-list');
  if (!el) return;
  // Semana começando na segunda (domingo por último), como no balcão.
  const sorted = [...hours].sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7));
  const describe = (d) => (d.is_closed ? 'Fechado' : `${hhmm(d.open_time)} — ${hhmm(d.close_time)}`);

  // Agrupa dias seguidos com o mesmo horário (ex: "Segunda a Sexta").
  const groups = [];
  for (const day of sorted) {
    const desc = describe(day);
    const last = groups[groups.length - 1];
    if (last && last.desc === desc && day.day_of_week === last.lastDay + 1) {
      last.lastDay = day.day_of_week;
    } else {
      groups.push({ desc, firstDay: day.day_of_week, lastDay: day.day_of_week });
    }
  }

  el.innerHTML = groups
    .map((g) => {
      const label = g.firstDay === g.lastDay
        ? WEEKDAY_LABELS[g.firstDay]
        : `${WEEKDAY_LABELS[g.firstDay]} a ${WEEKDAY_LABELS[g.lastDay]}`;
      return `<div class="hours-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(g.desc)}</span></div>`;
    })
    .join('');
}

// ---------- Dados que o Google lê (JSON-LD) acompanham o painel ----------
const SCHEMA_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function updateStructuredData({ location, settings, hours, wa, logo }) {
  const el = document.querySelector('script[type="application/ld+json"]');
  if (!el) return;
  let data;
  try {
    data = JSON.parse(el.textContent);
  } catch {
    return;
  }

  if (location?.address) data.address.streetAddress = location.address;
  // "Vila Aurora — Itapevi, SP" -> cidade "Itapevi", estado "SP"
  const cityState = String(location?.neighborhood_city || '').split(/\s[—–-]\s/).pop();
  const [city, state] = cityState.split(',').map((s) => s.trim());
  if (city) data.address.addressLocality = city;
  if (state) data.address.addressRegion = state;
  if (wa) data.telephone = `+${String(wa).replace(/\D/g, '')}`;
  if (logo) data.image = logo;

  const handle = String(settings?.instagram_handle || '').replace(/[^A-Za-z0-9._]/g, '');
  if (handle) data.sameAs = [`https://instagram.com/${handle}`];

  if (hours && hours.length) {
    const groups = new Map();
    for (const h of hours) {
      if (h.is_closed) continue;
      const key = `${hhmm(h.open_time)}-${hhmm(h.close_time)}`;
      if (!groups.has(key)) groups.set(key, { opens: hhmm(h.open_time), closes: hhmm(h.close_time), dayOfWeek: [] });
      groups.get(key).dayOfWeek.push(SCHEMA_DAYS[h.day_of_week]);
    }
    data.openingHoursSpecification = [...groups.values()].map((g) => ({ '@type': 'OpeningHoursSpecification', ...g }));
  }

  el.textContent = JSON.stringify(data);
}

async function loadSite() {
  const results = await Promise.all([
    supabase.from('site_hero').select('*').eq('id', 1).maybeSingle(),
    supabase.from('site_concept').select('*').eq('id', 1).maybeSingle(),
    supabase.from('site_pillars').select('*').order('position'),
    supabase.from('services_special').select('*').eq('active', true).order('position'),
    supabase.from('services_classic').select('*').eq('active', true).order('position'),
    supabase.from('differentiators').select('*').eq('active', true).order('position'),
    supabase.from('barbers').select('*').eq('active', true).order('position'),
    supabase.from('gallery_photos').select('*').eq('active', true).order('position'),
    supabase.from('business_hours').select('*').order('day_of_week'),
    supabase.from('products').select('*').eq('active', true).order('position'),
    supabase.from('site_location').select('*').eq('id', 1).maybeSingle(),
    supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('site_visagism').select('*').eq('id', 1).maybeSingle(),
    supabase.from('visagism_points').select('*').eq('active', true).order('position'),
    supabase.from('experience_steps').select('*').eq('active', true).order('position'),
    supabase.from('faq_items').select('*').eq('active', true).order('position'),
  ]);

  const failed = results.find((r) => r.error);
  if (failed) console.warn('Parte do conteúdo não carregou:', failed.error.message);

  const [hero, concept, pillars, specials, classics, differentiators, barbers, galleryPhotos, businessHours, products, location, settings,
    visagism, visagismPoints, experienceSteps, faqItems] = results.map((r) => r.data);
  // Para as seções novas: erro = mantém o conteúdo padrão do HTML; lista vazia = esconde a seção.
  const [visagismRes, , stepsRes, faqRes] = results.slice(12);

  const wa = (location && location.whatsapp_number) || (hero && hero.whatsapp_number) || DEFAULT_WHATSAPP;
  siteData.whatsapp = wa;

  // ---- Logo ----
  const logo = safeUrl(settings && settings.logo_url);
  if (logo) document.querySelectorAll('.js-logo').forEach((img) => { img.src = logo; });

  // ---- Todos os botões/links de WhatsApp ----
  document.querySelectorAll('.js-whatsapp-link').forEach((a) => {
    a.href = waLink(wa, 'Olá! Gostaria de agendar um horário na Tonsorium.');
  });

  // ---- Hero ----
  if (hero) {
    setText('#hero-badge-text', hero.badge_text);
    setText('#hero-title', hero.title);
    setText('#hero-tagline', hero.tagline);
    setText('#hero-sub', hero.subtitle);

    const mediaEl = document.getElementById('hero-media');
    const mediaUrl = safeUrl(hero.hero_media_url);
    if (mediaEl && mediaUrl) {
      if (hero.hero_media_type === 'video') {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        mediaEl.innerHTML = `<video src="${escapeHtml(mediaUrl)}" ${reduceMotion ? '' : 'autoplay'} muted loop playsinline preload="metadata" aria-hidden="true"></video>`;
      } else if (hero.hero_media_type === 'image') {
        mediaEl.innerHTML = `<img src="${escapeHtml(mediaUrl)}" alt="" fetchpriority="high">`;
      }
    }
  }

  // ---- Conceito ----
  if (concept) {
    setText('#concept-eyebrow-text', concept.eyebrow);
    const titleEl = document.getElementById('concept-title');
    if (titleEl && concept.title) titleEl.innerHTML = escapeHtml(concept.title).replace(/\n/g, '<br>');
    setText('#concept-p1', concept.paragraph_1);
  }
  // Os "pilares" do Conceito não aparecem nesta versão: repetiam os diferenciais.
  void pillars;

  // ---- Visagismo (faixa dentro de Serviços) ----
  if (!visagismRes.error && visagism) {
    if (visagism.active === false) {
      hideSection('visagism-band');
    } else {
      setText('#visagism-eyebrow', visagism.eyebrow);
      setText('#visagism-title', visagism.title);
      setText('#visagism-intro', visagism.intro);
      const cta = document.getElementById('visagism-cta');
      if (cta) {
        if (visagism.cta_label) cta.textContent = visagism.cta_label;
        if (visagism.service_name) cta.dataset.service = visagism.service_name;
      }
      if (visagismPoints && visagismPoints.length) {
        document.getElementById('visagism-points').innerHTML = visagismPoints.map((p) => `
          <li><strong>${escapeHtml(p.title)}</strong>${p.description ? `<span>${escapeHtml(p.description)}</span>` : ''}</li>
        `).join('');
      }
    }
  }

  // ---- Cardápio de serviços (Clássicos | Especiais) ----
  const menuItem = (s, tag) => `
    <li class="menu-item">
      <div class="menu-text">
        <div class="menu-line">
          <h3 class="menu-name">${escapeHtml(s.title)}</h3>
          ${s.price_label ? `<span class="menu-dots" aria-hidden="true"></span><span class="menu-price">${escapeHtml(s.price_label)}</span>` : ''}
        </div>
        ${s.description || tag ? `<p class="menu-desc">${tag ? `<span class="menu-tag">${escapeHtml(tag)}</span> ` : ''}${escapeHtml(s.description)}</p>` : ''}
      </div>
      <a class="menu-cta" data-booking data-service="${escapeHtml(s.title)}" href="${escapeHtml(waLink(wa, `Olá! Gostaria de agendar: ${s.title}`))}" target="_blank" rel="noopener">Agendar<span class="sr-only"> ${escapeHtml(s.title)}</span></a>
    </li>`;
  if (classics && classics.length) {
    document.getElementById('menu-classics').innerHTML = classics.map((c) => menuItem(c, '')).join('');
  }
  if (specials && specials.length) {
    document.getElementById('menu-specials').innerHTML = specials.map((s) => menuItem(s, s.tag)).join('');
  }
  // Sem itens em uma das abas: esconde a aba.
  if (classics && !classics.length) {
    document.getElementById('tab-classics')?.setAttribute('hidden', '');
    document.getElementById('tab-specials')?.click();
  }
  if (specials && !specials.length) document.getElementById('tab-specials')?.setAttribute('hidden', '');

  // ---- A experiência (passos do atendimento) ----
  if (!stepsRes.error && experienceSteps) {
    const stepsEl = document.getElementById('experience-steps');
    stepsEl.hidden = !experienceSteps.length;
    stepsEl.innerHTML = experienceSteps.map((s, i) => `
      <li class="step"><span class="step-num">${pad2(i)}</span><div><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description)}</p></div></li>
    `).join('');
  }

  // ---- Perguntas frequentes ----
  if (!faqRes.error && faqItems) {
    if (!faqItems.length) {
      hideSection('duvidas');
    } else {
      document.getElementById('faq-list').innerHTML = faqItems.map((f) => `
        <details class="faq-item"><summary>${escapeHtml(f.question)}</summary><p>${escapeHtml(f.answer)}</p></details>
      `).join('');
    }
  }

  // ---- Diferenciais ----
  if (differentiators && differentiators.length) {
    document.getElementById('amenities-grid').innerHTML = differentiators.map((d) => `
      <li class="perk">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[d.icon] || ICONS.clock}</svg>
        <div><h3>${escapeHtml(d.title)}</h3><p>${escapeHtml(d.description)}</p></div>
      </li>
    `).join('');
  }

  // ---- Equipe (só aparece se houver alguém cadastrado) ----
  if (barbers && barbers.length) {
    document.getElementById('team-grid').innerHTML = barbers.map((b) => {
      const photo = safeUrl(b.photo_url);
      return `
        <article class="team-card" data-barber-id="${escapeHtml(b.id)}">
          <div class="team-photo-wrap">
            ${photo
              ? `<img class="team-photo" src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(b.name)}" loading="lazy" decoding="async">`
              : `<div class="team-photo team-initials" aria-hidden="true">${escapeHtml(initials(b.name))}</div>`}
          </div>
          <div class="team-info">
            ${b.role ? `<p class="team-role">${escapeHtml(b.role)}</p>` : ''}
            <h3>${escapeHtml(b.name)}</h3>
            ${b.bio ? `<p class="team-bio">${escapeHtml(b.bio)}</p>` : ''}
            ${b.quote ? `<p class="team-quote">“${escapeHtml(b.quote)}”</p>` : ''}
            <a class="team-cta" data-booking data-barber="${escapeHtml(b.name)}" data-barber-id="${escapeHtml(b.id)}" href="${escapeHtml(waLink(wa, `Olá! Gostaria de agendar com ${b.name}.`))}" target="_blank" rel="noopener">Agendar com ${escapeHtml(b.name.split(' ')[0])} <span aria-hidden="true">→</span></a>
          </div>
        </article>
      `;
    }).join('');
    showSection('equipe');
  }

  // ---- Galeria (só fotos com imagem) ----
  const photos = (galleryPhotos || []).filter((g) => safeUrl(g.image_url));
  if (photos.length) {
    document.getElementById('gallery-grid').innerHTML = photos.map((g, i) => {
      const alt = g.caption ? g.caption : `Corte feito na Tonsorium (${i + 1})`;
      return `
        <button type="button" class="gallery-item" data-full="${escapeHtml(safeUrl(g.image_url))}" data-caption="${escapeHtml(g.caption)}" aria-label="Ampliar foto: ${escapeHtml(alt)}">
          <img class="gallery-photo" src="${escapeHtml(safeUrl(g.image_url))}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
          ${g.caption ? `<span class="gallery-caption">${escapeHtml(g.caption)}</span>` : ''}
        </button>
      `;
    }).join('');
    showSection('galeria');
  }

  // ---- Horários + "Aberto agora" ----
  const hours = businessHours && businessHours.length ? businessHours : DEFAULT_HOURS;
  siteData.hours = hours;
  if (businessHours && businessHours.length) renderHours(hours);
  renderOpenNow(hours);
  setInterval(() => renderOpenNow(hours), 60 * 1000);

  // ---- Produtos (só aparece se houver algum) ----
  if (products && products.length) {
    const formatBRL = (value) => Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('products-grid').innerHTML = products.map((p) => {
      const photo = safeUrl(p.photo_url);
      return `
        <div class="product-card">
          ${photo
            ? `<img class="product-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">`
            : '<div class="product-photo" aria-hidden="true"></div>'}
          <div class="product-info">
            <h3>${escapeHtml(p.name)}</h3>
            ${p.description ? `<p class="product-desc">${escapeHtml(p.description)}</p>` : ''}
            <span class="product-price">${Number(p.price) > 0 ? formatBRL(p.price) : 'Consulte'}</span>
          </div>
        </div>
      `;
    }).join('');
    showSection('produtos');
  }

  // ---- Localização ----
  if (location) {
    const addr = document.getElementById('loc-address');
    if (addr && location.address) {
      addr.innerHTML = `${escapeHtml(location.address)}<br>${escapeHtml(location.neighborhood_city)}`;
    }

    const mapsUrl = safeUrl(location.maps_url);
    const mapsBtn = document.getElementById('loc-maps-btn');
    if (mapsBtn && mapsUrl) mapsBtn.href = mapsUrl;

    // O mapa só carrega depois do toque do visitante (site.js); aqui só
    // atualizamos o endereço que ele vai mostrar.
    const map = document.getElementById('loc-map');
    if (map && location.address) {
      const query = `${location.address}, ${location.neighborhood_city}`.replace(/—/g, '-');
      const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
      if (map.tagName === 'IFRAME') {
        if (map.getAttribute('src') !== src) map.setAttribute('src', src);
      } else {
        map.dataset.mapSrc = src;
      }
    }

    setText('#footer-address-line1', location.address);
    setText('#footer-address-line2', location.neighborhood_city);
    setText('#loc-subtitle-place', location.neighborhood_city);
  }

  // ---- Rodapé: contato ----
  if (settings) {
    const ig = document.getElementById('footer-instagram');
    const handle = String(settings.instagram_handle || '').replace(/[^A-Za-z0-9._]/g, '');
    if (ig && handle) {
      ig.textContent = '@' + handle;
      ig.href = `https://instagram.com/${handle}`;
    }
    setText('#footer-whatsapp', settings.phone_display);
  }

  updateStructuredData({ location, settings, hours: businessHours, wa, logo });
}

loadSite().catch((err) => {
  console.error('Erro ao carregar conteúdo do Supabase:', err);
  renderOpenNow(DEFAULT_HOURS);
});
