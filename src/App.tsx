import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GuestPage from './pages/GuestPage';
import EventHubPage from './pages/EventHubPage';
import HowToGetTherePage from './pages/HowToGetTherePage';
import EventEntryPage from './pages/EventEntryPage';
import RequireAuth from './components/RequireAuth';
import OrganizerLogin from './components/OrganizerLogin';

// /admin (y todo lo que solo se usa desde ahí: DoorList, GuestEditModal,
// CreateGuestModal, adminApi) queda en un chunk aparte — la ruta pública
// /i/:token, la que la mayoría abre desde el celular, no debe pagar ese peso.
const AdminPage = lazy(() => import('./pages/AdminPage'));
// Panel del organizador de la Fase 1 (multi-tenant): también en su propio chunk.
const OrganizerEventsPage = lazy(() => import('./pages/OrganizerEventsPage'));
const OrganizerEventPage = lazy(() => import('./pages/OrganizerEventPage'));
const OrganizerAccountPage = lazy(() => import('./pages/OrganizerAccountPage'));
// Formulario de opciones para el cliente de un cumpleaños: nadie más lo abre.
const ClientBriefPage = lazy(() => import('./pages/ClientBriefPage'));

function AdminFallback() {
  return (
    <div className="flex min-h-app items-center justify-center bg-ink-950 text-paper-100">
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
        {/* `/e/:slug/a/:code` es el QR impreso de la fiesta: activa la cámara. Una sola ruta, para que la página no se
            reinicie cuando el código se quita de la dirección. */}
        <Route path="/e/:slug/*" element={<EventEntryPage />} />
        <Route
          path="/brief/:slug"
          element={
            <Suspense fallback={null}>
              <ClientBriefPage />
            </Suspense>
          }
        />
        <Route path="/evento" element={<EventHubPage />} />
        <Route path="/como-llegar" element={<HowToGetTherePage />} />
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
        <Route
          path="/panel"
          element={
            <RequireAuth login={<OrganizerLogin />}>
              <Suspense fallback={<AdminFallback />}>
                <OrganizerEventsPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/panel/e/:eventId"
          element={
            <RequireAuth login={<OrganizerLogin />}>
              <Suspense fallback={<AdminFallback />}>
                <OrganizerEventPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/panel/cuenta"
          element={
            <RequireAuth login={<OrganizerLogin />}>
              <Suspense fallback={<AdminFallback />}>
                <OrganizerAccountPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/i/invalido" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
