import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Config PÚBLICA do app web (não é segredo): a proteção real vem do Firebase Auth
// e da verificação do token no servidor.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Sem configuração, usa um valor de fachada só para o SDK não lançar erro na carga
// (isso deixaria a tela em branco). A tela de login avisa e bloqueia o acesso.
const app = initializeApp({
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey || 'not-configured',
});
export const auth = getAuth(app);
