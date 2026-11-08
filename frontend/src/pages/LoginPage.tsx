import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api';
import { ErrorMessage } from '../components/ErrorMessage';
import { useAuth } from '../useAuth';

const EXPIRED_MESSAGE = 'Tu sesión expiró o no has iniciado sesión. Inicia sesión para continuar.';

export function LoginPage() {
  const { login, expired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/canchas';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm rounded-lg bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold">Iniciar sesión</h1>
      {expired && !error && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">{EXPIRED_MESSAGE}</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Correo electrónico</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
          />
        </label>
        <ErrorMessage message={error} />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Iniciar sesión
        </button>
      </form>
      <p className="mt-4 text-sm">
        ¿No tienes cuenta?{' '}
        <Link to="/registro" state={{ from }} className="font-medium text-emerald-700 hover:underline">
          Regístrate
        </Link>
      </p>
    </section>
  );
}
