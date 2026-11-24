import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function init() {
  if (getApps().length > 0) return getApps()[0];

  // Remove aspas que às vezes vêm junto ao colar/importar o valor em painéis de hospedagem.
  const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, '').trim();

  const projectId = clean(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL);
  // A chave privada costuma chegar com "\n" literais (arquivo .env / painel da Vercel).
  const privateKey = clean(process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Credenciais do Firebase Admin ausentes. Defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.'
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function adminAuth() {
  return getAuth(init());
}

export function adminDb() {
  return getFirestore(init());
}
