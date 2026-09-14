import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GuestPage from './GuestPage';
import type { Guest } from '../types';

vi.mock('../lib/guestApi', () => ({
  getGuestByToken: vi.fn(),
  submitRsvp: vi.fn(),
}));

vi.mock('../lib/eventApi', () => ({
  getEventConfig: vi.fn(),
}));

vi.mock('../lib/photosApi', () => ({
  getPhotoQuota: vi.fn(),
}));

// DevPanel se carga lazy solo para DEV_GUEST_TOKEN -- estos mocks cubren
// sus dependencias (qrcode dibuja sobre un <canvas> real que jsdom no
// implementa, igual criterio que QrScanner.test.tsx con jsQR).
vi.mock('../lib/devApi', () => ({
  devCheckIn: vi.fn(),
  devResetGuest: vi.fn(),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake') },
}));

import { getGuestByToken, submitRsvp } from '../lib/guestApi';
import { getEventConfig } from '../lib/eventApi';
import { getPhotoQuota } from '../lib/photosApi';

const pendingGuest: Guest = {
  id: 'g1',
  token: 'mafe-8842',
  fullName: 'Maria Fernanda Contreras',
  status: 'pending',
  plusOnesAllowed: 2,
  plusOnesConfirmed: 0,
  guestNote: null,
  respondedAt: null,
  checkedInAt: null,
};

const confirmedGuest: Guest = {
  ...pendingGuest,
  status: 'confirmed',
  plusOnesConfirmed: 1,
  guestNote: 'llego un poco tarde',
  respondedAt: '2026-05-01T00:00:00Z',
};

const declinedGuest: Guest = {
  ...pendingGuest,
  status: 'declined',
  plusOnesConfirmed: 0,
  guestNote: 'no puedo ir',
  respondedAt: '2026-05-01T00:00:00Z',
};

const checkedInGuest: Guest = {
  ...confirmedGuest,
  checkedInAt: '2026-05-20T23:00:00Z',
};

function renderAt(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/i/${token}`]}>
      <Routes>
        <Route path="/i/:token" element={<GuestPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getGuestByToken).mockReset();
  vi.mocked(submitRsvp).mockReset();
  vi.mocked(getEventConfig).mockReset();
  vi.mocked(getEventConfig).mockResolvedValue({
    eventName: 'NOCTURNA',
    eventDate: '2026-05-24T02:00:00Z',
    location: 'The Warehouse Club',
    theme: 'All black',
    rsvpDeadline: '2026-05-21T23:59:00Z',
    photosRevealedAt: null,
  });
  vi.mocked(getPhotoQuota).mockReset();
  vi.mocked(getPhotoQuota).mockResolvedValue({ quota: 5, used: 2 });
  localStorage.clear();
});

describe('GuestPage', () => {
  it('shows a loading state while the guest is being fetched', () => {
    vi.mocked(getGuestByToken).mockReturnValue(new Promise(() => {}));

    renderAt('mafe-8842');

    expect(screen.getByText(/verificando invitación/i)).toBeInTheDocument();
  });

  it('renders the guest name once found', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
  });

  it('shows the submit button in español de tú, not voseo, while undecided', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');

    expect(await screen.findByRole('button', { name: /define tu postura en el fader/i })).toBeInTheDocument();
  });

  it('shows the invalid-token screen when no guest matches', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(null);

    renderAt('no-existe');

    expect(await screen.findByText(/no estás en lista/i)).toBeInTheDocument();
  });

  it('shows the invalid-token screen when the fetch fails', async () => {
    vi.mocked(getGuestByToken).mockRejectedValueOnce(new Error('network down'));

    renderAt('mafe-8842');

    expect(await screen.findByText(/no estás en lista/i)).toBeInTheDocument();
  });

  it('submits an rsvp and shows the confirmation screen', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(submitRsvp).mockResolvedValueOnce({ ...pendingGuest, status: 'confirmed', plusOnesConfirmed: 1 });
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    await user.click(screen.getByRole('button', { name: 'Voy' }));
    await user.click(screen.getByRole('button', { name: /confirmar asistencia/i }));

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(submitRsvp).toHaveBeenCalledWith('mafe-8842', 'confirmed', 0, '');
  });

  it('shows the door QR and refreshes the guest when it is closed, unlocking the camera if they got scanned meanwhile', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);
    vi.mocked(getGuestByToken).mockResolvedValueOnce(checkedInGuest);
    vi.mocked(getPhotoQuota).mockResolvedValue({ quota: 5, used: 4 });
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/access granted/i);
    expect(screen.queryByLabelText('Cámara')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mostrar mi qr/i }));
    await screen.findByRole('dialog', { name: /tu qr de puerta/i });

    await user.click(screen.getByRole('button', { name: /^cerrar$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getGuestByToken).toHaveBeenCalledTimes(2);
    // El card de la cámara (CameraSection, con el botón "Abrir cámara") solo
    // aparece cuando checkedInAt no es null -- gateado por check-in real, no
    // por status. Si esto aparece es porque el refresh trajo el guest
    // actualizado (checkedInGuest), no el que ya teníamos. La cámara a
    // pantalla completa en sí (CameraCapture) sólo se monta si además se
    // toca ese botón -- no corresponde a este flujo, que sólo prueba que se
    // desbloqueó.
    expect(await screen.findByLabelText('Cámara')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir cámara/i })).toBeInTheDocument();
  });

  it('degrades gracefully when the event is not configured yet', async () => {
    vi.mocked(getEventConfig).mockResolvedValueOnce(null);
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
    expect(screen.queryByText(/última llamada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rsvp cerrado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it('shows an error toast and keeps the note when submit fails', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(submitRsvp).mockRejectedValueOnce(new Error('Este enlace de invitación ya no es válido.'));
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    await user.type(screen.getByLabelText(/mensaje a puerta/i), 'hola puerta');
    await user.click(screen.getByRole('button', { name: 'Voy' }));
    await user.click(screen.getByRole('button', { name: /confirmar asistencia/i }));

    expect(await screen.findByText(/enlace de invitación ya no es válido/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/mensaje a puerta/i)).toHaveValue('hola puerta'));
  });

  it('lets a confirmed guest edit their rsvp, prefilled with their current answer', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);
    const user = userEvent.setup();

    renderAt('mafe-8842');

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /editar mi respuesta/i }));

    expect(await screen.findByRole('button', { name: 'Voy', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByLabelText(/mensaje a puerta/i)).toHaveValue('llego un poco tarde');
  });

  it('submits a changed answer from edit mode and lands on the fresh terminal screen', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);
    vi.mocked(submitRsvp).mockResolvedValueOnce({ ...confirmedGuest, status: 'declined', plusOnesConfirmed: 0 });
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/access granted/i);
    await user.click(screen.getByRole('button', { name: /editar mi respuesta/i }));

    await user.click(await screen.findByRole('button', { name: 'No voy' }));
    await user.click(screen.getByRole('button', { name: /liberar cupo/i }));

    expect(await screen.findByText(/cupo liberado/i)).toBeInTheDocument();
    expect(submitRsvp).toHaveBeenCalledWith('mafe-8842', 'declined', 1, 'llego un poco tarde');
    expect(screen.queryByRole('button', { name: /confirmar asistencia/i })).not.toBeInTheDocument();
  });

  it('lets a declined guest edit their rsvp and switch to confirmed', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(declinedGuest);
    vi.mocked(submitRsvp).mockResolvedValueOnce({ ...declinedGuest, status: 'confirmed', plusOnesConfirmed: 0 });
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/cupo liberado/i);
    await user.click(screen.getByRole('button', { name: /editar mi respuesta/i }));

    expect(await screen.findByRole('button', { name: 'No voy', pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voy' }));
    await user.click(screen.getByRole('button', { name: /confirmar asistencia/i }));

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(submitRsvp).toHaveBeenCalledWith('mafe-8842', 'confirmed', 0, 'no puedo ir');
  });

  it('stays in edit mode with the error toast when a resubmit from edit mode fails', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);
    vi.mocked(submitRsvp).mockRejectedValueOnce(new Error('Este enlace de invitación ya no es válido.'));
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/access granted/i);
    await user.click(screen.getByRole('button', { name: /editar mi respuesta/i }));

    await user.click(await screen.findByRole('button', { name: 'No voy' }));
    await user.click(screen.getByRole('button', { name: /liberar cupo/i }));

    expect(await screen.findByText(/enlace de invitación ya no es válido/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No voy', pressed: true })).toBeInTheDocument();
    expect(screen.queryByText(/cupo liberado/i)).not.toBeInTheDocument();
  });

  it('shows the real doors time from the event config, not a permanent placeholder', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    // getEventConfig (beforeEach) mocks eventDate as 2026-05-24T02:00:00Z.
    // Format the expected time the same way the component does, instead of
    // hardcoding a timezone-dependent string.
    const expectedTime = new Date('2026-05-24T02:00:00Z').toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(`Puertas ${expectedTime}`, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/puertas por confirmar/i)).not.toBeInTheDocument();
  });

  it('falls back to the placeholder doors time when the event date is not set', async () => {
    vi.mocked(getEventConfig).mockReset();
    vi.mocked(getEventConfig).mockResolvedValueOnce({
      eventName: 'NOCTURNA',
      eventDate: null,
      location: 'The Warehouse Club',
      theme: 'All black',
      rsvpDeadline: null,
      photosRevealedAt: null,
    });
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    expect(screen.getByText(/puertas por confirmar/i)).toBeInTheDocument();
  });

  it('shows a visible link to the shared event hub once the guest is loaded', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    const hubLink = screen.getByRole('link', { name: /cartelera/i });
    expect(hubLink).toHaveAttribute('href', '/evento');
  });

  it('shows the camera section with the remaining shots once checked in at the door', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(checkedInGuest);
    vi.mocked(getPhotoQuota).mockResolvedValueOnce({ quota: 5, used: 4 });

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    expect(await screen.findByLabelText('Cámara')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('opens the full-screen camera only when the guest taps "Abrir cámara", and closes it back to the trigger card', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(checkedInGuest);
    vi.mocked(getPhotoQuota).mockResolvedValueOnce({ quota: 5, used: 4 });
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByRole('button', { name: /abrir cámara/i });
    // La cámara a pantalla completa (CameraCapture, aria-label distinto del
    // card) no se monta de arranque -- sólo el trigger card lo hace.
    expect(screen.queryByLabelText('Cámara de fotos')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /abrir cámara/i }));

    expect(await screen.findByLabelText('Cámara de fotos')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cerrar$/i }));

    expect(screen.queryByLabelText('Cámara de fotos')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir cámara/i })).toBeInTheDocument();
  });

  it('does not break the page when the photo quota fetch fails', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(checkedInGuest);
    vi.mocked(getPhotoQuota).mockRejectedValueOnce(new Error('network down'));

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Cámara')).not.toBeInTheDocument();
  });

  it('hides the camera section until the guest has actually checked in at the door', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);
    vi.mocked(getPhotoQuota).mockResolvedValueOnce({ quota: 5, used: 0 });

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Cámara')).not.toBeInTheDocument();
  });

  it('still shows the camera for a pending guest who was scanned at the door before confirming (check-in is decoupled from RSVP, Etapa 3)', async () => {
    // No es un estado inconsistente: es un caso real y documentado
    // (docs/04-producto/BACKLOG.md, "gateada por check-in real, no por
    // RSVP") -- alguien puede llegar y ser escaneado en la puerta antes de
    // confirmar su RSVP desde el link. La cámara se gatea por checkedInAt,
    // nunca por status. El bug real de "invitación + cámara mostrándose
    // juntas por un status revertido" se resuelve en la base de datos: el
    // trigger de supabase/migrations/20260914090000_reset_checked_in_at_on_status_change.sql
    // limpia checked_in_at atómicamente en cuanto status deja de ser
    // 'confirmed', así que ese estado inconsistente ya no puede llegar al
    // cliente -- no hace falta (ni corresponde) bloquearlo también en la UI.
    vi.mocked(getGuestByToken).mockResolvedValueOnce({ ...pendingGuest, checkedInAt: '2026-05-20T23:00:00Z' });
    vi.mocked(getPhotoQuota).mockResolvedValueOnce({ quota: 5, used: 0 });

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Cámara')).toBeInTheDocument();
  });

  it('tells a confirmed guest the camera unlocks once checked in at the door', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);

    renderAt('mafe-8842');

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(screen.getByText(/cámara se desbloquea/i)).toBeInTheDocument();
    expect(screen.getByText(/te escaneen en la puerta/i)).toBeInTheDocument();
  });

  it('renders the dev panel in addition to the normal guest UI for the dev token', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce({ ...pendingGuest, token: 'dev-preview' });

    renderAt('dev-preview');
    await screen.findByText(/maria fernanda contreras/i);

    // Both the real RSVP UI and the dev panel should be visible at once.
    expect(screen.getByRole('button', { name: /confirmar asistencia|define tu postura/i })).toBeInTheDocument();
    expect(await screen.findByText(/panel dev/i)).toBeInTheDocument();
  });

  it('does not render the dev panel for a regular guest token', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    expect(screen.queryByText(/panel dev/i)).not.toBeInTheDocument();
  });

  it('includes a call to action to the event hub on the confirmed screen', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);

    renderAt('mafe-8842');
    await screen.findByText(/access granted/i);

    const hubLink = screen.getByRole('link', { name: /cartelera/i });
    expect(hubLink).toHaveAttribute('href', '/evento');
  });

  describe('draft persistence', () => {
    it('restores progress left in the fader/+1/nota if the page was left without submitting', async () => {
      vi.mocked(getGuestByToken).mockResolvedValue(pendingGuest);
      const user = userEvent.setup();

      const first = renderAt('mafe-8842');
      await screen.findByText(/maria fernanda contreras/i);

      await user.click(screen.getByRole('button', { name: 'Voy' }));
      await user.click(screen.getByRole('button', { name: '+' }));
      await user.type(screen.getByLabelText(/mensaje a puerta/i), 'llego en auto');

      first.unmount();

      renderAt('mafe-8842');
      await screen.findByText(/maria fernanda contreras/i);

      expect(await screen.findByRole('button', { name: 'Voy', pressed: true })).toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
      expect(screen.getByLabelText(/mensaje a puerta/i)).toHaveValue('llego en auto');
    });

    it('does not restore a draft saved under a different token', async () => {
      vi.mocked(getGuestByToken).mockImplementation((t) =>
        Promise.resolve({ ...pendingGuest, token: t }),
      );
      const user = userEvent.setup();

      const first = renderAt('mafe-8842');
      await screen.findByText(/maria fernanda contreras/i);
      await user.click(screen.getByRole('button', { name: 'Voy' }));
      first.unmount();

      renderAt('otro-token');
      await screen.findByText(/maria fernanda contreras/i);

      expect(await screen.findByRole('button', { name: 'Voy', pressed: false })).toBeInTheDocument();
    });

    it('clears the saved draft once the rsvp is submitted successfully', async () => {
      vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
      vi.mocked(submitRsvp).mockResolvedValueOnce({ ...pendingGuest, status: 'confirmed', plusOnesConfirmed: 0 });
      const user = userEvent.setup();

      const first = renderAt('mafe-8842');
      await screen.findByText(/maria fernanda contreras/i);
      await user.click(screen.getByRole('button', { name: 'Voy' }));
      await user.click(screen.getByRole('button', { name: /confirmar asistencia/i }));
      await screen.findByText(/access granted/i);
      first.unmount();

      expect(localStorage.getItem('fcumple:draft:mafe-8842')).toBeNull();
    });
  });
});
