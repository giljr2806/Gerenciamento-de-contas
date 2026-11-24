import { AlertCircle, CheckCircle2, LogIn } from 'lucide-react';
import { FormEvent, useState } from 'react';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  configured: boolean;
}

export function LoginView({ onLogin, onResetPassword, configured }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Informe seu e-mail para receber o link de definição de senha.');
      return;
    }
    setBusy(true);
    try {
      await onResetPassword(email.trim());
    } catch {
      // resposta neutra de propósito: não revela se o e-mail existe
    } finally {
      setBusy(false);
      setInfo('Se este e-mail estiver cadastrado, você receberá um link para definir a senha.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 max-w-sm w-full space-y-5"
      >
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Buddha Spa · DHO
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Orçamentos &amp; Contratos — acesso restrito
          </p>
        </div>

        {!configured && (
          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>Firebase não configurado. Preencha as variáveis VITE_FIREBASE_* no .env.local.</span>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="login-email" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            E-mail
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="login-password" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Senha
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {info && (
          <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{info}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !configured}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors"
        >
          <LogIn className="w-4 h-4" aria-hidden="true" />
          <span>{busy ? 'Aguarde...' : 'Entrar'}</span>
        </button>

        <button
          type="button"
          onClick={reset}
          disabled={busy || !configured}
          className="w-full text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline disabled:opacity-60"
        >
          Primeiro acesso / esqueci a senha
        </button>
      </form>
    </div>
  );
}
