# Buddha Spa · DHO — Orçamentos & Contratos

React + Vite no front-end, API Express (função serverless na Vercel), **Firebase Authentication** para login e **Firestore** para os dados.

## Como a segurança funciona
- Todo `/api/*` exige um **ID token do Firebase** válido; o servidor o verifica com o Admin SDK.
- O perfil (developer/admin/editor/viewer) é buscado pelo **e-mail verificado** do token no cadastro de usuários. Cabeçalhos enviados pelo navegador (ex.: `x-user-id`) são ignorados.
- E-mail que não está cadastrado e ativo → 403.
- O Firestore tem regras `allow read, write: if false` — só o servidor acessa o banco.
- Gestão de usuários e "apagar dados" exigem, além do perfil Desenvolvedor, a **chave do desenvolvedor** (2º fator, sessão assinada de 2 h).

## Configuração (uma vez)
1. **Firebase Console**
   - *Authentication → Sign-in method*: habilitar **E-mail/senha**. Se disponível, **desabilite o cadastro livre** (sign-up) — usuários só entram se o Desenvolvedor os cadastrar no app.
   - *Firestore Database*: criar o banco (modo produção) e publicar `firestore.rules` (`firebase deploy --only firestore:rules`, ou colar o conteúdo na aba Regras).
   - *Configurações do projeto → Seus apps → Web*: copiar a config para `VITE_FIREBASE_*`.
   - *Contas de serviço → Gerar nova chave privada*: copiar `project_id`, `client_email` e `private_key` para `FIREBASE_*`.
   - *Authentication → Configurações → Domínios autorizados*: adicionar o domínio da Vercel.
2. **`.env.local`**: preencher (modelo em `.env.example`). `BOOTSTRAP_DEVELOPER_EMAIL` = e-mail do primeiro desenvolvedor.
3. Criar a conta do primeiro desenvolvedor:
   `npm run bootstrap:dev -- email@dominio.com "senha-com-12-ou-mais-caracteres"`

## Rodar localmente
```
npm install
npm run dev      # http://localhost:3000
```

## Publicar na Vercel
1. Importar o repositório na Vercel (framework Vite — `vercel.json` já configura rotas e cabeçalhos).
2. Em *Settings → Environment Variables*, cadastrar **todas** as variáveis do `.env.local`.
   `FIREBASE_PRIVATE_KEY`: colar com os `\n` literais, entre aspas.
3. Deploy. Depois, atualizar `APP_URL` e o domínio autorizado no Firebase.

## Novos usuários
O Desenvolvedor cadastra o usuário em *Usuários* (cria a conta no Firebase). A pessoa abre o app e usa **"Primeiro acesso / esqueci a senha"** para definir a senha pelo e-mail.

## Observações
- Atualização dos dados: o app consulta o servidor a cada 15 s (e ao voltar para a aba), em vez de SSE.
- Alterações simultâneas: se duas pessoas gravarem ao mesmo tempo, a segunda recebe aviso de conflito para recarregar.
