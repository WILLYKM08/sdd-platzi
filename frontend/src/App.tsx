import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CourtAvailabilityPage } from './pages/CourtAvailabilityPage';
import { CourtsPage } from './pages/CourtsPage';
import { LoginPage } from './pages/LoginPage';
import { MyReservationsPage } from './pages/MyReservationsPage';
import { RegisterPage } from './pages/RegisterPage';
import { AuthProvider, useAuth } from './useAuth';

/** Conveniencia de UI: la protección real está en el backend (Principio III). */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="text-slate-500">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`;

function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout().catch(() => undefined);
    navigate('/login');
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link to="/canchas" className="text-lg font-semibold text-emerald-700">
          Reservas de Pádel
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          <NavLink to="/canchas" className={navLinkClass}>
            Canchas
          </NavLink>
          {user ? (
            <>
              <NavLink to="/mis-reservas" className={navLinkClass}>
                Mis Reservas
              </NavLink>
              <span className="hidden px-2 text-sm text-slate-500 sm:inline">{user.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navLinkClass}>
                Iniciar sesión
              </NavLink>
              <NavLink to="/registro" className={navLinkClass}>
                Registrarse
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <NavBar />
        <main className="mx-auto max-w-4xl px-4 py-6">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/canchas" element={<CourtsPage />} />
            <Route
              path="/canchas/:courtId"
              element={
                <RequireAuth>
                  <CourtAvailabilityPage />
                </RequireAuth>
              }
            />
            <Route
              path="/mis-reservas"
              element={
                <RequireAuth>
                  <MyReservationsPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/canchas" replace />} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}
