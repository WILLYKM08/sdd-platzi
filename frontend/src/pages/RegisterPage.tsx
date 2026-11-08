import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api';
import { ErrorMessage } from '../components/ErrorMessage';
import { useAuth } from '../useAuth';

// Validación de conveniencia; la definitiva es la del backend (mismos mensajes del catálogo).
function validate(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Ingresa un correo electrónico válido.';
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (password.length > 128) return 'La contraseña no puede tener más de 128 caracteres.';
  return null;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/canchas';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validationError = validate(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm rounded-lg bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold">Crear cuenta</h1>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Correo electrónico</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-500">Mínimo 8 caracteres</span>
        </label>
        <ErrorMessage message={error} />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Crear cuenta
        </button>
      </form>
      <p className="mt-4 text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" state={{ from }} className="font-medium text-emerald-700 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </section>
  );
}
