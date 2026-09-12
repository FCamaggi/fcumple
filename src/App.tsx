import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import GuestPage from './pages/GuestPage';
import AdminPage from './pages/AdminPage';
import RequireAuth from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/i/mafe-8842" replace />} />
        <Route path="/i/:token" element={<GuestPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/i/invalido" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
