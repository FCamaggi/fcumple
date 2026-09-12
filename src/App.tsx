import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GuestPage from './pages/GuestPage';
import EventHubPage from './pages/EventHubPage';
import RequireAuth from './components/RequireAuth';

// /admin (y todo lo que solo se usa desde ahí: DoorList, GuestEditModal,
// CreateGuestModal, adminApi) queda en un chunk aparte — la ruta pública
// /i/:token, la que la mayoría abre desde el celular, no debe pagar ese peso.
const AdminPage = lazy(() => import('./pages/AdminPage'));

function AdminFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 text-paper-100">
      <span className="font-mono text-xs uppercase tracking-widest text-acid-400">Cargando consola...</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/i/invalido" replace />} />
        <Route path="/i/:token" element={<GuestPage />} />
        <Route path="/evento" element={<EventHubPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Suspense fallback={<AdminFallback />}>
                <AdminPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/i/invalido" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
