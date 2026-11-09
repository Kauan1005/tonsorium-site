// Cliente único do Supabase, compartilhado pelo conteúdo, avaliações e agenda.
// A biblioteca fica no próprio site (vendor/), com versão fixa: nenhuma CDN
// de terceiros executa código aqui e uma atualização nunca muda o site sem
// você saber.
import { createClient } from './vendor/supabase-js-2.112.4.js';

// Guardado antes de o Supabase ler e limpar a URL — usado para avisar
// "e-mail confirmado" ou "link expirado" quando o cliente volta do e-mail.
export const initialAuthHash = window.location.hash;

export const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
