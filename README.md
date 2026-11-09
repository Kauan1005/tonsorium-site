# Tonsorium — Site da barbearia

Site público de uma barbearia real em Itapevi/SP, no ar em
[tonsorium.netlify.app](https://tonsorium.netlify.app). Todo o conteúdo vem do
banco e é editado pelo dono no painel; o cliente escolhe serviço, barbeiro, dia e
horário, vê na hora quais horários já estão ocupados e envia o pedido pronto
pelo WhatsApp.

- Painel administrativo: [tonsorium-admin](https://github.com/Kauan1005/tonsorium-admin)
- Stack: HTML, CSS e JavaScript (módulos ES, sem framework e sem build) · Supabase · Netlify

## Destaques

- **Sem build, sem framework.** Páginas estáticas com módulos ES; o conteúdo
  padrão já vem no HTML (bom para o Google e para quando o banco não responde) e
  é substituído pelo conteúdo do banco ao carregar.
- **Agendamento com horários ocupados.** O site cruza o horário de atendimento
  com a agenda dos barbeiros e risca o que está ocupado. Com "sem preferência",
  um horário só aparece ocupado se todos os barbeiros estiverem. O site recebe
  só início e fim de cada horário, nada sobre os clientes.
- **Fuso de São Paulo em tudo.** Horários calculados no fuso da barbearia, não
  no do aparelho de quem visita.
- **Avaliações em tempo real** com login pelo Google, moderação e limite contra
  spam aplicados no banco.
- **Privacidade desde o primeiro acesso.** Nenhum cookie próprio; fontes e
  biblioteca servidas pelo próprio site; o mapa do Google só carrega quando o
  visitante pede. Por isso o site não precisa de banner de cookies. Política de
  Privacidade e Termos de Uso conforme a LGPD.
- **Segurança.** Content-Security-Policy restrita ao próprio domínio, tudo que
  vem do banco é escapado antes de ir para a tela e links externos são validados.
- **Acessibilidade.** Navegação por teclado, contraste revisado e áreas de toque
  pensadas para o celular.

## Direitos

© 2026 Kauan ([@Kauan1005](https://github.com/Kauan1005)). Código publicado para
fins de portfólio: você pode ler e estudar, mas **todos os direitos são
reservados** e o código não pode ser copiado nem reutilizado sem autorização. A
marca, o logotipo, as fotos e os textos da Tonsorium pertencem à barbearia. As
fontes (licença SIL OFL 1.1) e a biblioteca do Supabase (licença MIT) seguem as
licenças de seus autores.

---

# Guia técnico

## Arquivos
- `index.html` — estrutura da página (já com o conteúdo padrão, que aparece
  mesmo se o banco estiver fora do ar e ajuda no Google)
- `style.css` — todo o visual
- `config.js` — URL/chave pública do Supabase, endereço do site e captcha
- `supabase-client.js` — conexão com o Supabase
- `vendor/supabase-js-2.112.4.js` — a biblioteca do Supabase, servida pelo
  próprio site (sem CDN de terceiros; a CSP só aceita scripts deste endereço)
- `content-loader.js` — preenche a página com o conteúdo do banco
- `reviews.js` — contas de clientes (e-mail ou Google), avaliações em tempo
  real, avaliações do Google e a nota em destaque no topo
- `booking.js` — "Agendar horário": escolhe serviço, barbeiro, dia e horário e
  abre o WhatsApp com a mensagem pronta. Os horários que os barbeiros marcaram
  na agenda do painel aparecem **ocupados** (riscados); o site recebe só início
  e fim de cada horário, nada sobre o cliente. Se a agenda não responder, todos
  os horários aparecem livres, como antes.
- `hours.js` — horários, "Aberto agora" e dias/horários do agendamento
  (sempre no fuso de São Paulo)
- `site-data.js` — dados do banco compartilhados entre os scripts
- `site.js` — menu do celular, animações, galeria ampliada
- `utils.js` — funções compartilhadas (escape de HTML, links do WhatsApp)
- `privacidade.html` — Política de Privacidade (LGPD) e `termos.html` — Termos de
  Uso. Quando houver CNPJ, inclua a razão social e o CNPJ nos dois (há um
  comentário marcando o lugar) e no rodapé do `index.html`.
- `fonts/` — fontes servidas pelo próprio site (sem Google Fonts, que recebia o
  IP de cada visitante)
- O mapa do Google na seção Contato só carrega quando o visitante toca em "Ver
  mapa aqui" (antes disso, nenhum dado vai para o Google e nenhum cookie de
  terceiro é gravado). Por isso o site não precisa de banner de cookies.
- `404.html` — página de "não encontrada" (Netlify/Vercel usam sozinhos)
- `og-image.jpg` — imagem da prévia do link (WhatsApp, Instagram, Facebook)
- `favicon-*.png`, `apple-touch-icon.png`, `icon-*.png`, `site.webmanifest` —
  ícones da aba, da tela inicial do celular e do "instalar app"
- `_headers` / `vercel.json` — cabeçalhos de segurança (CSP etc.)
- `robots.txt`, `logo.jpg`

## Configuração
1. Siga o passo a passo do README do admin (schema, admin, Auth, Google,
   agenda e logins dos barbeiros).
2. Em `config.js`, preencha `SITE_URL` com o endereço final do site.
3. Quando tiver o domínio próprio, troque `tonsorium.netlify.app` em `og:url` e
   `og:image` (no `index.html`) pelo domínio novo.
4. Se trocar de projeto do Supabase, atualize também o `preconnect` no topo do
   `index.html`.
5. `EMAIL_AUTH_ENABLED` no `config.js`: deixe `false` até o domínio estar
   verificado no Resend (os clientes entram com Google); depois, `true`.

## Atualizar a biblioteca do Supabase (raro)
Na pasta do admin (que já tem o pacote no `node_modules`), troque a versão do
pacote e gere o arquivo novo:
```
echo export { createClient } from '@supabase/supabase-js'; | npx esbuild --bundle --format=esm --platform=browser --target=es2020 --minify --outfile="../Tonsorium Publico/vendor/supabase-js-NOVA.js"
```
Depois atualize o nome do arquivo em `supabase-client.js` e no `modulepreload`
do `index.html`.

## Rodar local
Precisa de um servidor (os scripts são módulos e não abrem com duplo clique),
por exemplo: `npx serve .`

## Publicar
Netlify ou Vercel, conectado ao GitHub. Os cabeçalhos de segurança já estão em
`_headers` (Netlify) e `vercel.json` (Vercel) — mantenha os dois iguais. Não
esqueça a pasta `vendor/`.
