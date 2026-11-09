// Credenciais públicas do Supabase (é seguro isso ficar exposto no site —
// a chave "anon" só funciona dentro das regras de acesso definidas no banco).
// Preencha com os dados do seu projeto: Supabase Dashboard > Project Settings > API.
window.SUPABASE_URL = 'https://zqilpryywspzlholplij.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaWxwcnl5d3Nwemxob2xwbGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2OTcxOTEsImV4cCI6MjEwOTI3MzE5MX0.XKhIWmO717TR9W8gAsrycu5aWkHzLIqaJ77ql_E9ERA';

// Endereço final do site (ex: 'https://www.tonsorium.com.br/'). Usado nos
// links de confirmação de e-mail e de "esqueci minha senha". Se ficar vazio,
// usa o endereço em que o site está aberto.
window.SITE_URL = 'https://tonsorium.netlify.app/';

// Cadastro e login com e-mail e senha. Deixe false até o domínio estar
// verificado no Resend: sem domínio, o Resend só entrega e-mails para o dono
// da conta, e o cliente ficaria sem receber a confirmação. Enquanto isso, os
// clientes entram com Google. Depois do domínio pronto, troque para true.
window.EMAIL_AUTH_ENABLED = false;

// Chave pública ("Site Key") do Cloudflare Turnstile, para bloquear robôs no
// cadastro/login. Deixe vazio até ativar o Captcha no Supabase
// (Authentication > Attack Protection) — os dois precisam ser ligados juntos.
window.TURNSTILE_SITE_KEY = '';
