import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, getCourts, type Court } from '../api';
import { ErrorMessage } from '../components/ErrorMessage';
import { useAuth } from '../useAuth';

/** Lista pública de las 5 canchas (FR-009). */
export function CourtsPage() {
  const { user } = useAuth();
  const [courts, setCourts] = useState<Court[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [askLogin, setAskLogin] = useState(false);

  useEffect(() => {
    getCourts()
      .then(({ courts }) => setCourts(courts))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Canchas</h1>
      <ErrorMessage message={error} />
      {askLogin && !user && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Inicia sesión o regístrate para ver la disponibilidad.{' '}
          <Link to="/login" className="font-medium underline">
            Iniciar sesión
          </Link>{' '}
          ·{' '}
          <Link to="/registro" className="font-medium underline">
            Registrarse
          </Link>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {courts.map((court) => (
          <li key={court.id}>
            {user ? (
              <Link
                to={`/canchas/${court.id}`}
                className="block rounded-lg border border-slate-200 bg-white px-4 py-4 font-medium shadow-sm hover:border-emerald-500"
              >
                {court.name}
                <span className="block text-sm font-normal text-slate-500">Ver disponibilidad</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setAskLogin(true)}
                className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-left font-medium shadow-sm hover:border-emerald-500"
              >
                {court.name}
                <span className="block text-sm font-normal text-slate-500">Ver disponibilidad</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
