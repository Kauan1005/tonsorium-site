// =========================================================
// Avaliações: contas de cliente (Google ou e-mail), perfil com foto,
// avaliações em tempo real e avaliações do Google. Toda a segurança de
// verdade está no banco (RLS + triggers em supabase/schema.sql); aqui é
// só a interface.
// =========================================================
import { supabase, initialAuthHash } from './supabase-client.js';
import { escapeHtml, isBackdropClick, safeUrl, starsHtml, showToast } from './utils.js';
import { askConfirm } from './confirm-dialog.js';

const PAGE_SIZE = 6;
const SITE_URL = window.SITE_URL || `${window.location.origin}${window.location.pathname}`;
const TURNSTILE_KEY = window.TURNSTILE_SITE_KEY || '';
// Cadastro/login por e-mail: só liga quando o envio de e-mails estiver pronto (config.js).
const EMAIL_AUTH = window.EMAIL_AUTH_ENABLED === true;
const AVATAR_SIZE = 320;

const els = {
  list: document.getElementById('reviews-list'),
  more: document.getElementById('reviews-more'),
  compose: document.getElementById('review-compose'),
  summarySite: document.getElementById('summary-site'),
  summaryGoogle: document.getElementById('summary-google'),
  googleBlock: document.getElementById('google-reviews-block'),
  googleList: document.getElementById('google-reviews-list'),
  googleLink: document.getElementById('google-all-link'),
  dialog: document.getElementById('auth-dialog'),
};

const state = {
  user: null,
  profile: null, // { full_name, avatar_url, avatar_choice }
  isAdmin: false,
  reviews: [],
  shown: PAGE_SIZE,
  editingId: null,
  justPosted: false,
  siteStats: null,
  google: null,
  googleWriteUrl: '',
  googleEnabled: false,
};

const GOOGLE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// ---------- Mensagens de erro em português ----------
function translateError(error) {
  const msg = String(error?.message || error || '');
  const code = error?.code || '';
  const orGoogle = state.googleEnabled ? ' Se preferir, entre com sua conta Google.' : '';
  // E-mail ainda sem servidor próprio configurado no Supabase (o padrão só envia para a equipe).
  if (code === 'email_address_not_authorized' || /email address not authorized/i.test(msg)) {
    return 'O cadastro por e-mail está temporariamente indisponível.' + orGoogle;
  }
  if (/error sending .*email/i.test(msg)) return 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.' + orGoogle;
  if (/email rate limit/i.test(msg)) return 'Muitos e-mails enviados agora. Tente de novo em alguns minutos.' + orGoogle;
  if (code === 'TS429' || /review rate limit/i.test(msg)) return 'Você já avaliou nas últimas 24 horas. Volte amanhã para deixar uma nova avaliação.';
  if (/admin accounts/i.test(msg)) return 'Contas de administrador não podem ser excluídas pelo site.';
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar — veja sua caixa de entrada (e o spam).';
  if (/already registered|already exists/i.test(msg)) return 'Já existe uma conta com este e-mail. Entre ou recupere a senha.';
  if (/password should be at least|weak password|password is too/i.test(msg)) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
  if (/rate limit|too many|for security purposes/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (/captcha/i.test(msg)) return 'Confirme que você não é um robô e tente de novo.';
  if (/same.*password|different from the old/i.test(msg)) return 'A nova senha precisa ser diferente da anterior.';
  if (code === '42501' || /row-level security/i.test(msg)) return 'Confirme seu e-mail antes de avaliar.';
  if (/failed to fetch|network/i.test(msg)) return 'Sem conexão. Verifique sua internet e tente de novo.';
  return 'Não foi possível concluir. Tente novamente em instantes.';
}

function photoError(error) {
  const msg = String(error?.message || error || '');
  if (msg === 'decode') return 'Não conseguimos abrir essa foto. Use uma imagem JPG ou PNG.';
  if (/maximum allowed size|too large/i.test(msg)) return 'Foto muito grande. Use uma imagem menor.';
  if (/mime|format/i.test(msg)) return 'Formato não suportado. Use JPG, PNG ou WEBP.';
  if (/failed to fetch|network/i.test(msg)) return 'Sem conexão. Verifique sua internet e tente de novo.';
  return 'Não foi possível atualizar a foto. Tente novamente.';
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "kauan almeida" -> "Kauan A." — o mesmo formato que o banco usa nas avaliações. */
function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  const cap = (w) => w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR');
  if (!parts.length) return 'Cliente';
  if (parts.length === 1) return cap(parts[0]).slice(0, 40);
  return `${cap(parts[0]).slice(0, 40)} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('pt-BR')}.`;
}

function displayName() {
  const meta = state.user?.user_metadata || {};
  return (state.profile?.full_name || meta.full_name || meta.name || '').trim();
}

function avatarHtml(url, name, cls = 'review-avatar') {
  const photo = safeUrl(url);
  if (photo) {
    return `<img class="${cls}" src="${escapeHtml(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" width="40" height="40">`;
  }
  const initial = String(name || '').trim().charAt(0) || '?';
  return `<span class="${cls}" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

// ---------- Captcha (Cloudflare Turnstile), opcional ----------
let turnstilePromise = null;
const widgets = new Map();

function loadTurnstile() {
  if (!TURNSTILE_KEY) return Promise.resolve(null);
  turnstilePromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => reject(new Error('captcha'));
    document.head.appendChild(s);
  });
  return turnstilePromise;
}

async function mountCaptcha(form) {
  const box = form.querySelector('.captcha');
  if (!box || !TURNSTILE_KEY || widgets.has(form)) return;
  const turnstile = await loadTurnstile().catch(() => null);
  if (!turnstile) return;
  widgets.set(form, turnstile.render(box, { sitekey: TURNSTILE_KEY, theme: 'dark', language: 'pt-br' }));
}

function captchaToken(form) {
  if (!TURNSTILE_KEY) return undefined;
  const id = widgets.get(form);
  return id != null ? window.turnstile.getResponse(id) || undefined : undefined;
}

function resetCaptcha(form) {
  const id = widgets.get(form);
  if (id != null) window.turnstile.reset(id);
}

// ---------- Janela de login / cadastro / conta ----------
function openAuth(view) {
  const dialog = els.dialog;
  dialog.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== view; });
  dialog.querySelectorAll('.form-msg').forEach((m) => { m.textContent = ''; m.className = 'form-msg'; });
  if (view === 'account') renderAccount();
  if (!dialog.open) dialog.showModal();
  const active = dialog.querySelector(`[data-view="${view}"]`);
  const form = active.querySelector('form');
  if (form) mountCaptcha(form);
  [...active.querySelectorAll('input:not([type=hidden]):not([type=file]), button')].find((el) => el.offsetParent !== null)?.focus();
}

function closeAuth() {
  if (els.dialog.open) els.dialog.close();
}

function setFormMessage(form, text, kind = 'error') {
  const box = form.querySelector('.form-msg');
  box.textContent = text;
  box.className = `form-msg ${kind}`;
}

function setBusy(form, busy) {
  form.querySelectorAll('button, input, textarea').forEach((el) => { el.disabled = busy; });
}

async function handleLogin(form) {
  const email = form.email.value.trim();
  const password = form.password.value;
  const { error } = await supabase.auth.signInWithPassword({
    email, password, options: { captchaToken: captchaToken(form) },
  });
  if (error) throw error;
  closeAuth();
  showToast('Você entrou na sua conta.');
}

async function handleSignup(form) {
  const name = form.full_name.value.trim().replace(/\s+/g, ' ');
  const email = form.email.value.trim();
  const password = form.password.value;
  if (name.length < 2) throw new Error('name');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('weak password');
  }
  if (!form.consent.checked) throw new Error('consent');

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name.slice(0, 60) }, emailRedirectTo: SITE_URL, captchaToken: captchaToken(form) },
  });
  if (error) throw error;
  form.reset();
  // Mesma tela mesmo se o e-mail já tiver conta (não revela quem é cliente).
  document.getElementById('check-email-address').textContent = email;
  openAuth('check-email');
}

async function handleForgot(form) {
  const email = form.email.value.trim();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: SITE_URL, captchaToken: captchaToken(form),
  });
  if (error) throw error;
  setFormMessage(form, 'Se houver uma conta com esse e-mail, você vai receber um link para criar uma nova senha.', 'ok');
}

async function handleReset(form) {
  const password = form.password.value;
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('weak password');
  if (password !== form.confirm.value) throw new Error('mismatch');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  closeAuth();
  showToast('Senha alterada com sucesso.');
}

async function handleProfile(form) {
  const name = form.full_name.value.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (name.length < 2) throw new Error('name');
  const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', state.user.id);
  if (error) throw error;
  await loadProfile();
  renderCompose();
  loadReviews(); // o banco já atualizou o nome nas avaliações
  setFormMessage(form, 'Nome salvo.', 'ok');
}

const FORM_HANDLERS = {
  login: handleLogin,
  signup: handleSignup,
  forgot: handleForgot,
  reset: handleReset,
  profile: handleProfile,
};

function wireAuthDialog() {
  const dialog = els.dialog;

  dialog.addEventListener('click', (e) => {
    if (isBackdropClick(dialog, e)) closeAuth();
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      e.preventDefault();
      openAuth(goto.dataset.goto);
    }
    if (e.target.closest('[data-close]')) closeAuth();
  });

  dialog.querySelectorAll('form[data-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const handler = FORM_HANDLERS[form.dataset.form];
      setBusy(form, true);
      try {
        await handler(form);
      } catch (err) {
        const msg = String(err?.message || '');
        const text =
          msg === 'name' ? 'Informe seu nome (pelo menos 2 letras).'
          : msg === 'consent' ? 'Para criar a conta, aceite a Política de Privacidade.'
          : msg === 'mismatch' ? 'As senhas não conferem.'
          : translateError(err);
        setFormMessage(form, text);
      } finally {
        setBusy(form, false);
        resetCaptcha(form);
      }
    });
  });

  // Prévia de como o nome aparece nas avaliações.
  const profileForm = dialog.querySelector('form[data-form="profile"]');
  profileForm?.full_name.addEventListener('input', () => {
    document.getElementById('account-name-preview').textContent = shortName(profileForm.full_name.value);
  });

  // Foto de perfil
  const photoInput = document.getElementById('account-photo-input');
  document.getElementById('account-photo-change')?.addEventListener('click', () => photoInput.click());
  photoInput?.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    photoInput.value = '';
    if (file) changePhoto(file);
  });
  document.getElementById('account-photo-remove')?.addEventListener('click', removePhoto);

  document.getElementById('account-signout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    closeAuth();
    showToast('Você saiu da sua conta.');
  });

  document.getElementById('account-delete')?.addEventListener('click', (e) => deleteAccount(e.currentTarget));
}

// ---------- Perfil (nome e foto) ----------
async function loadProfile() {
  if (!state.user) {
    state.profile = null;
    state.isAdmin = false;
    return;
  }
  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle(),
    supabase.rpc('is_admin'),
  ]);
  state.profile = profile || { full_name: '', avatar_url: '', avatar_choice: 'auto' };
  state.isAdmin = isAdmin === true;
}

function renderAccount() {
  if (!state.user) return;
  const name = displayName();
  document.getElementById('account-avatar').innerHTML = avatarHtml(state.profile?.avatar_url, name, 'account-avatar-img');
  document.getElementById('account-photo-remove').hidden = !safeUrl(state.profile?.avatar_url);
  const form = els.dialog.querySelector('form[data-form="profile"]');
  form.full_name.value = name;
  document.getElementById('account-name-preview').textContent = shortName(name);
  document.getElementById('account-email').textContent = state.user.email || '';
  document.getElementById('account-delete').hidden = state.isAdmin;
  document.getElementById('account-admin-note').hidden = !state.isAdmin;
}

function setPhotoMessage(text, kind = 'error') {
  const box = document.getElementById('account-photo-msg');
  box.textContent = text;
  box.className = text ? `form-msg ${kind}` : 'form-msg';
}

function setPhotoBusy(busy) {
  ['account-photo-change', 'account-photo-remove'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = busy;
  });
}

/** Corta no centro, reduz para 320x320 e salva em JPEG (também remove dados de GPS da foto). */
async function squareJpeg(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file).catch(() => null);
  }
  if (!bitmap) throw new Error('decode');
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  canvas.getContext('2d').drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, AVATAR_SIZE, AVATAR_SIZE
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('decode'))), 'image/jpeg', 0.86);
  });
}

/** Apaga as fotos antigas da pasta do cliente (mantém só a atual). */
async function removeAvatarFiles(keepPath = null) {
  const folder = state.user.id;
  const { data: files } = await supabase.storage.from('avatars').list(folder, { limit: 100 });
  const paths = (files || []).map((f) => `${folder}/${f.name}`).filter((p) => p !== keepPath);
  if (paths.length) await supabase.storage.from('avatars').remove(paths);
}

async function afterProfileChange() {
  await loadProfile();
  renderAccount();
  renderCompose();
  loadReviews(); // o banco já trocou a foto nas avaliações
}

async function changePhoto(file) {
  if (file.type && !/^image\/(jpeg|png|webp)$/.test(file.type)) {
    setPhotoMessage('Formato não suportado. Use JPG, PNG ou WEBP.');
    return;
  }
  setPhotoBusy(true);
  setPhotoMessage('Enviando foto...', 'ok');
  try {
    const blob = await squareJpeg(file);
    const path = `${state.user.id}/${Date.now()}.jpg`;
    const { error: upError } = await supabase.storage.from('avatars').upload(path, blob, {
      contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
    });
    if (upError) throw upError;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error } = await supabase.from('profiles')
      .update({ avatar_url: data.publicUrl, avatar_choice: 'custom' })
      .eq('id', state.user.id);
    if (error) {
      await supabase.storage.from('avatars').remove([path]);
      throw error;
    }
    await removeAvatarFiles(path).catch(() => {});
    await afterProfileChange();
    setPhotoMessage('Foto atualizada.', 'ok');
  } catch (err) {
    setPhotoMessage(photoError(err));
  } finally {
    setPhotoBusy(false);
  }
}

async function removePhoto() {
  setPhotoBusy(true);
  try {
    const { error } = await supabase.from('profiles')
      .update({ avatar_url: '', avatar_choice: 'none' })
      .eq('id', state.user.id);
    if (error) throw error;
    await removeAvatarFiles().catch(() => {});
    await afterProfileChange();
    setPhotoMessage('Foto removida.', 'ok');
  } catch (err) {
    setPhotoMessage(photoError(err));
  } finally {
    setPhotoBusy(false);
  }
}

async function deleteAccount(button) {
  if (!state.user || state.isAdmin) return;
  const ok = await askConfirm({
    title: 'Excluir sua conta?',
    text: 'Suas avaliações e sua foto também serão apagadas. Não dá para desfazer.',
    confirmLabel: 'Excluir conta',
  });
  if (!ok) return;
  button.disabled = true;
  try {
    // As fotos precisam sair antes: o Supabase não exclui contas que ainda têm arquivos.
    await removeAvatarFiles().catch(() => {});
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    await supabase.auth.signOut({ scope: 'local' });
    closeAuth();
    showToast('Sua conta foi excluída.');
  } catch (err) {
    showToast(translateError(err), 'error');
  } finally {
    button.disabled = false;
  }
}

// ---------- Lista de avaliações do site (tempo real) ----------
let loadSeq = 0;

async function loadReviews() {
  const seq = ++loadSeq;
  let query = supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(60);
  // Quem está logado vê também as próprias avaliações ocultadas pela barbearia.
  query = state.user ? query.or(`status.eq.published,user_id.eq.${state.user.id}`) : query.eq('status', 'published');

  const [{ data: rows, error }, { data: stats }] = await Promise.all([
    query,
    supabase.from('review_stats').select('*').maybeSingle(),
  ]);
  if (seq !== loadSeq) return; // chegou uma resposta mais nova
  if (error) {
    console.warn('Avaliações indisponíveis:', error.message);
    if (!state.reviews.length) {
      els.summarySite.innerHTML = '<span class="summary-label">Avaliações indisponíveis no momento.</span>';
      els.list.innerHTML = '<p class="reviews-empty">Não foi possível carregar as avaliações agora. Tente novamente em instantes.</p>';
    }
    return;
  }
  state.reviews = rows || [];
  if (state.editingId && !state.reviews.some((r) => r.id === state.editingId)) state.editingId = null;
  renderSummarySite(stats);
  renderReviewList();
}

function renderSummarySite(stats) {
  const total = stats?.total ?? state.reviews.length;
  const avg = Number(stats?.average ?? 0);
  state.siteStats = { total, average: avg };
  updateHeroRating();
  els.summarySite.innerHTML = total
    ? `<span class="summary-score">${avg.toFixed(1).replace('.', ',')}</span>
       ${starsHtml(avg)}
       <span class="summary-label">${total} ${total === 1 ? 'avaliação' : 'avaliações'} no site</span>`
    : `<span class="summary-label">Seja o primeiro a avaliar a Tonsorium.</span>`;
}

function starInputHtml(selected, prefix) {
  return `
    <fieldset class="star-input">
      <legend>Sua nota</legend>
      <div class="star-input-row">
        ${[5, 4, 3, 2, 1].map((n) => `
          <input type="radio" id="star-${prefix}-${n}" name="rating" value="${n}" ${n === selected ? 'checked' : ''} required>
          <label for="star-${prefix}-${n}" title="${n} ${n === 1 ? 'estrela' : 'estrelas'}"><span aria-hidden="true">★</span><span class="sr-only">${n} ${n === 1 ? 'estrela' : 'estrelas'}</span></label>
        `).join('')}
      </div>
    </fieldset>`;
}

function reviewHtml(r) {
  const mine = state.user && r.user_id === state.user.id;
  if (mine && state.editingId === r.id) return editFormHtml(r);
  return `
    <article class="review${mine ? ' is-mine' : ''}">
      <header class="review-head">
        ${avatarHtml(r.author_avatar_url, r.author_name)}
        <div class="review-who">
          <p class="review-author">${escapeHtml(r.author_name)}${mine ? ' <span class="review-you">você</span>' : ''}</p>
          <p class="review-meta">${starsHtml(r.rating)} <time datetime="${escapeHtml(r.created_at)}">${formatDate(r.created_at)}</time>${r.edited_at ? ' <span class="review-edited">· editada</span>' : ''}</p>
        </div>
        ${mine ? `
          <div class="review-actions">
            <button type="button" class="link-btn" data-edit-review="${escapeHtml(r.id)}">Editar</button>
            <button type="button" class="link-btn danger" data-delete-review="${escapeHtml(r.id)}">Excluir</button>
          </div>` : ''}
      </header>
      ${mine && r.status === 'hidden' ? '<p class="review-hidden-note">Ocultada pela barbearia — só você vê esta avaliação.</p>' : ''}
      ${r.comment ? `<p class="review-text">${escapeHtml(r.comment)}</p>` : ''}
      ${r.admin_reply ? `<div class="review-reply"><span>Resposta da Tonsorium</span><p>${escapeHtml(r.admin_reply)}</p></div>` : ''}
    </article>`;
}

function editFormHtml(r) {
  return `
    <article class="review is-mine is-editing">
      <form class="review-edit-form" data-review-id="${escapeHtml(r.id)}" novalidate>
        <p class="review-edit-title">Editar avaliação</p>
        ${starInputHtml(r.rating, `edit-${r.id}`)}
        <label class="field">
          <span>Comentário (opcional)</span>
          <textarea name="comment" rows="3" maxlength="1000">${escapeHtml(r.comment)}</textarea>
        </label>
        <p class="form-msg" role="alert"></p>
        <div class="compose-actions">
          <button type="submit" class="btn-primary">Salvar</button>
          <button type="button" class="btn-ghost" data-cancel-edit>Cancelar</button>
        </div>
      </form>
    </article>`;
}

function readEditDraft() {
  const form = els.list.querySelector('.review-edit-form');
  if (!form) return null;
  return {
    id: form.dataset.reviewId,
    rating: form.querySelector('input[name="rating"]:checked')?.value || '',
    comment: form.comment.value,
  };
}

function renderReviewList() {
  const draft = readEditDraft();
  const visible = state.reviews.slice(0, state.shown);
  // A avaliação em edição continua aberta mesmo se ficaria fora da página atual.
  if (state.editingId && !visible.some((r) => r.id === state.editingId)) {
    const editing = state.reviews.find((r) => r.id === state.editingId);
    if (editing) visible.unshift(editing);
  }
  els.list.innerHTML = visible.length
    ? visible.map(reviewHtml).join('')
    : '<p class="reviews-empty">Ainda não há avaliações por aqui. Entre na sua conta e conte como foi sua experiência.</p>';
  els.more.hidden = state.reviews.length <= state.shown;

  // Atualizações em tempo real não apagam o que o cliente está editando.
  if (draft && draft.id === state.editingId) {
    const form = els.list.querySelector('.review-edit-form');
    if (form) {
      if (draft.rating) {
        const radio = form.querySelector(`input[name="rating"][value="${draft.rating}"]`);
        if (radio) radio.checked = true;
      }
      form.comment.value = draft.comment;
    }
  }
}

function wireReviewList() {
  els.list.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit-review]');
    const remove = e.target.closest('[data-delete-review]');
    if (edit) {
      state.editingId = edit.dataset.editReview;
      renderReviewList();
      els.list.querySelector('.review-edit-form textarea')?.focus();
    } else if (e.target.closest('[data-cancel-edit]')) {
      state.editingId = null;
      renderReviewList();
    } else if (remove) {
      deleteReview(remove.dataset.deleteReview, remove);
    }
  });

  els.list.addEventListener('submit', (e) => {
    const form = e.target.closest('.review-edit-form');
    if (!form) return;
    e.preventDefault();
    saveEdit(form);
  });
}

async function saveEdit(form) {
  const rating = Number(form.querySelector('input[name="rating"]:checked')?.value);
  const comment = form.comment.value.trim().slice(0, 1000);
  if (!rating) {
    setFormMessage(form, 'Escolha uma nota de 1 a 5 estrelas.');
    return;
  }
  setBusy(form, true);
  const { error } = await supabase.from('reviews').update({ rating, comment }).eq('id', form.dataset.reviewId);
  setBusy(form, false);
  if (error) {
    setFormMessage(form, translateError(error));
    return;
  }
  state.editingId = null;
  showToast('Avaliação atualizada.');
  await loadReviews();
}

async function deleteReview(id, button) {
  const ok = await askConfirm({
    title: 'Apagar avaliação?',
    text: 'Ela sai do site na hora. Não dá para desfazer.',
    confirmLabel: 'Apagar',
  });
  if (!ok) return;
  button.disabled = true;
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  button.disabled = false;
  if (error) {
    showToast(translateError(error), 'error');
    return;
  }
  if (state.editingId === id) state.editingId = null;
  showToast('Avaliação excluída.');
  await loadReviews();
}

let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(loadReviews, 400);
}

function subscribeRealtime() {
  supabase
    .channel('public-reviews')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, scheduleRefresh)
    .subscribe();
  // Rede de segurança se a conexão em tempo real cair.
  setInterval(() => { if (!document.hidden) scheduleRefresh(); }, 2 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
}

// ---------- Caixa "Nova avaliação" ----------
function readComposeDraft() {
  const form = els.compose.querySelector('#review-form');
  if (!form) return null;
  return {
    rating: form.querySelector('input[name="rating"]:checked')?.value || '',
    comment: form.comment.value,
  };
}

function renderCompose() {
  const box = els.compose;
  const draft = readComposeDraft();

  if (!state.user) {
    const google = state.googleEnabled;
    if (!google && !EMAIL_AUTH) {
      box.innerHTML = `
        <h3>Deixe sua avaliação</h3>
        <p class="muted">Em breve você poderá avaliar por aqui.</p>`;
      return;
    }
    box.innerHTML = `
      <h3>Deixe sua avaliação</h3>
      <p class="muted">Para avaliar, entre na sua conta. Assim só clientes reais avaliam.</p>
      ${google ? `<button type="button" class="btn-google compose-google" data-oauth="google">${GOOGLE_ICON} Entrar com Google</button>` : ''}
      ${EMAIL_AUTH ? `
      <div class="compose-actions">
        <button type="button" class="${google ? 'btn-ghost' : 'btn-primary'}" data-open-auth="login">${google ? 'Entrar com e-mail' : 'Entrar'}</button>
        <button type="button" class="btn-ghost" data-open-auth="signup">Criar conta</button>
      </div>` : ''}`;
    return;
  }

  const name = displayName();
  const firstName = name.split(' ')[0] || 'cliente';
  box.innerHTML = `
    <div class="compose-user">
      ${avatarHtml(state.profile?.avatar_url, name, 'compose-avatar')}
      <span class="compose-hello">Olá, <strong>${escapeHtml(firstName)}</strong></span>
      <button type="button" class="link-btn" data-open-auth="account">Minha conta</button>
    </div>
    <h3>Nova avaliação</h3>
    <form id="review-form" novalidate>
      ${starInputHtml(0, 'new')}
      <label class="field">
        <span>Comentário (opcional)</span>
        <textarea name="comment" rows="4" maxlength="1000" placeholder="Como foi o atendimento, o corte, o ambiente..."></textarea>
        <small class="char-count"><span>0</span>/1000</small>
      </label>
      <p class="form-msg" role="alert"></p>
      <button type="submit" class="btn-primary">Publicar avaliação</button>
    </form>
    ${state.justPosted && state.googleWriteUrl ? `
      <div class="google-nudge">
        <p>Obrigado! Se puder, deixe também sua avaliação no Google — ajuda a barbearia a ser encontrada.</p>
        <a class="btn-ghost" href="${escapeHtml(state.googleWriteUrl)}" target="_blank" rel="noopener">Avaliar no Google</a>
      </div>` : ''}`;

  const form = box.querySelector('#review-form');
  const counter = form.querySelector('.char-count span');
  if (draft) {
    if (draft.rating) {
      const radio = form.querySelector(`input[name="rating"][value="${draft.rating}"]`);
      if (radio) radio.checked = true;
    }
    form.comment.value = draft.comment;
    counter.textContent = draft.comment.length;
  }
  form.comment.addEventListener('input', () => { counter.textContent = form.comment.value.length; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitReview(form);
  });
}

async function submitReview(form) {
  const rating = Number(form.querySelector('input[name="rating"]:checked')?.value);
  const comment = form.comment.value.trim().slice(0, 1000);
  if (!rating) {
    setFormMessage(form, 'Escolha uma nota de 1 a 5 estrelas.');
    return;
  }

  setBusy(form, true);
  const { error } = await supabase.from('reviews').insert({ rating, comment });
  setBusy(form, false);

  if (error) {
    setFormMessage(form, translateError(error));
    return;
  }
  showToast('Obrigado! Sua avaliação foi publicada.');
  state.justPosted = true;
  form.reset();
  renderCompose();
  loadReviews();
}

// ---------- Nota em destaque no topo do site ----------
function formatScore(n) {
  return Number(n).toFixed(1).replace('.', ',');
}

function updateHeroRating() {
  const el = document.getElementById('hero-rating');
  if (!el) return;
  const g = state.google;
  const s = state.siteStats;
  let html = '';
  if (g && g.show_on_site && g.rating != null && g.user_rating_count) {
    html = `${starsHtml(g.rating)} <strong>${formatScore(g.rating)}</strong> no Google · ${g.user_rating_count} avaliações`;
  } else if (s && s.total >= 3) {
    html = `${starsHtml(s.average)} <strong>${formatScore(s.average)}</strong> · ${s.total} avaliações de clientes`;
  }
  el.innerHTML = html;
  el.hidden = !html;
}

// ---------- Avaliações do Google ----------
async function loadGoogle() {
  const [{ data: place }, { data: rows }] = await Promise.all([
    supabase.from('google_place').select('place_id, show_on_site, rating, user_rating_count, maps_uri').eq('id', 1).maybeSingle(),
    supabase.from('google_reviews').select('*').order('publish_time', { ascending: false }),
  ]);
  if (!place) return;

  // Link direto para a janela "escrever avaliação" do Google.
  if (/^[A-Za-z0-9_-]+$/.test(place.place_id || '')) {
    state.googleWriteUrl = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(place.place_id)}`;
    const write = document.getElementById('google-write-link');
    if (write) {
      write.href = state.googleWriteUrl;
      write.hidden = false;
    }
  }

  state.google = place;
  updateHeroRating();
  if (!place.show_on_site || place.rating == null) return;

  const mapsUri = safeUrl(place.maps_uri);
  els.summaryGoogle.innerHTML = `
    <span class="summary-score">${String(place.rating).replace('.', ',')}</span>
    ${starsHtml(place.rating)}
    <span class="summary-label">${place.user_rating_count ?? 0} avaliações no Google</span>`;
  if (mapsUri) els.summaryGoogle.href = mapsUri;
  els.summaryGoogle.hidden = false;

  if (rows && rows.length) {
    els.googleList.innerHTML = rows.map((g) => {
      const authorUri = safeUrl(g.author_uri);
      const name = escapeHtml(g.author_name);
      return `
        <article class="review google">
          <header class="review-head">
            ${avatarHtml(g.author_photo_url, g.author_name)}
            <div class="review-who">
              <p class="review-author">${authorUri ? `<a href="${escapeHtml(authorUri)}" target="_blank" rel="noopener nofollow">${name}</a>` : name}</p>
              <p class="review-meta">${starsHtml(g.rating)} <span>${escapeHtml(g.relative_time)}</span></p>
            </div>
          </header>
          ${g.text ? `<p class="review-text">${escapeHtml(g.text)}</p>` : ''}
        </article>`;
    }).join('');
    if (mapsUri) els.googleLink.href = mapsUri;
    else els.googleLink.hidden = true;
    els.googleBlock.hidden = false;
  }
}

// ---------- Sessão ----------
async function applySession(session) {
  const newId = session?.user?.id || null;
  if (newId !== (state.user?.id || null)) {
    state.editingId = null;
    state.justPosted = false;
  }
  state.user = session?.user ?? null;
  await loadProfile();
  renderCompose();
  if (els.dialog.open && !els.dialog.querySelector('[data-view="account"]').hidden) renderAccount();
  loadReviews();
}

// ---------- Quais jeitos de entrar aparecem (Google e/ou e-mail) ----------
function updateAuthOptions() {
  const google = state.googleEnabled;
  document.documentElement.classList.toggle('no-email-auth', !EMAIL_AUTH);
  document.querySelectorAll('.oauth-block').forEach((b) => { b.hidden = !google; });
  document.querySelectorAll('.oauth-divider').forEach((d) => { d.hidden = !(google && EMAIL_AUTH); });
  document.querySelectorAll('.auth-unavailable').forEach((p) => { p.hidden = google || EMAIL_AUTH; });
  document.querySelectorAll('.auth-intro').forEach((p) => { p.hidden = !(google || EMAIL_AUTH); });
}

// ---------- Login com Google (aparece sozinho quando ativado no Supabase) ----------
async function enableOAuthButtons() {
  try {
    const res = await fetch(`${window.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: window.SUPABASE_ANON_KEY },
    });
    const settings = await res.json();
    if (settings?.external?.google) {
      state.googleEnabled = true;
      updateAuthOptions();
      if (!state.user) renderCompose();
    }
  } catch {
    /* sem o botão do Google, o login por e-mail continua funcionando */
  }
}

async function signInWithProvider(button) {
  button.disabled = true;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: button.dataset.oauth,
    options: { redirectTo: SITE_URL },
  });
  if (error) {
    button.disabled = false;
    showToast(translateError(error), 'error');
  }
}

function handleAuthRedirect() {
  // Volta do link do e-mail (confirmação de conta ou link expirado) ou do Google.
  const params = new URLSearchParams(initialAuthHash.replace(/^#/, ''));
  if (params.get('error_code') || params.get('error')) {
    const expired = /expired|invalid/i.test(params.get('error_code') + params.get('error_description'));
    showToast(expired ? 'Esse link expirou ou já foi usado. Peça um novo.' : 'Não foi possível validar o login.', 'error');
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } else if (params.get('type') === 'signup') {
    openAuth('confirmed');
  } else if (params.get('access_token') && !params.get('type')) {
    // Voltou do login com Google: abre direto a janela de avaliação.
    showToast('Você entrou na sua conta. Já pode avaliar!');
    openReviewDialog();
  }
}

/** A caixa de avaliação fica numa janela (botão "Deixar minha avaliação"). */
function openReviewDialog() {
  const dialog = document.getElementById('review-dialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function init() {
  if (!els.list || !els.dialog) return;

  wireAuthDialog();
  wireReviewList();
  updateAuthOptions();
  document.getElementById('confirmed-continue')?.addEventListener('click', () => {
    closeAuth();
    openReviewDialog();
  });
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-auth]');
    if (trigger) openAuth(trigger.dataset.openAuth);
    const oauth = e.target.closest('[data-oauth]');
    if (oauth) signInWithProvider(oauth);
  });
  enableOAuthButtons();
  els.more.addEventListener('click', () => {
    state.shown += PAGE_SIZE;
    renderReviewList();
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      setTimeout(() => openAuth('reset'), 0);
      return;
    }
    if (event === 'TOKEN_REFRESHED') return;
    // Fora do callback, como recomenda o supabase-js.
    setTimeout(() => applySession(session), 0);
  });

  handleAuthRedirect();
  loadReviews();
  loadGoogle();
  subscribeRealtime();
}

init();
