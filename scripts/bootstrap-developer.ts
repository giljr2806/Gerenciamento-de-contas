/**
 * Cria (ou atualiza) a conta do primeiro Desenvolvedor no Firebase Authentication,
 * já com e-mail verificado.
 *
 * Uso:  npm run bootstrap:dev -- seu@email.com "SenhaForte-Com-12+Caracteres"
 *
 * O e-mail deve ser o mesmo definido em BOOTSTRAP_DEVELOPER_EMAIL no .env.local / Vercel.
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);
  const email = (emailArg || '').trim().toLowerCase();
  const password = passwordArg || '';

  if (!email || password.length < 12) {
    console.error('Uso: npm run bootstrap:dev -- email@dominio.com "senha com 12+ caracteres"');
    process.exit(1);
  }

  const { adminAuth } = await import('../server/firebaseAdmin');
  const auth = adminAuth();

  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password, emailVerified: true, disabled: false });
    console.log(`Conta atualizada: ${email}`);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    await auth.createUser({ email, password, emailVerified: true, displayName: 'Desenvolvedor DHO' });
    console.log(`Conta criada: ${email}`);
  }
  console.log('Pronto. Faça login no app com este e-mail e senha.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
