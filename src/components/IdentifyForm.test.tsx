import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/platformApi', async () => {
  class EnrollmentAnswersError extends Error {
    constructor(readonly code: string) {
      super('Revisa tus respuestas e intenta de nuevo.');
    }
  }
  return { registerGuest: vi.fn(), loginGuest: vi.fn(), EnrollmentAnswersError };
});

import { EnrollmentAnswersError, loginGuest, registerGuest, type EventPublic } from '../lib/platformApi';
import { emptyEnrollment, resolveEnrollmentConfig } from '../lib/enrollmentConfig';
import IdentifyForm from './IdentifyForm';

const baseEvent: EventPublic = {
  id: 'ev-1',
  name: 'Cumple de Fabrizio',
  startsAt: null,
  location: null,
  rsvpDeadline: null,
  accessMode: 'open',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  photosRevealed: false,
  enrollment: emptyEnrollment(),
};

const ok = { outcome: 'ok' as const, guestToken: 'tok', guestId: 'g1', guestName: 'Ana Rojas' };
const none = { guestToken: null, guestId: null, guestName: null };

beforeEach(() => {
  vi.mocked(registerGuest).mockReset();
  vi.mocked(loginGuest).mockReset();
});

async function fillRegister(name: string, pin: string, repeat = pin) {
  await userEvent.type(screen.getByLabelText('Nombre y apellido'), name);
  await userEvent.type(screen.getByLabelText(/Elige un PIN/), pin);
  await userEvent.type(screen.getByLabelText('Repite tu PIN'), repeat);
}

describe('IdentifyForm: inscribirme', () => {
  it('se inscribe con nombre, apellido y PIN, y entrega la sesión', async () => {
    vi.mocked(registerGuest).mockResolvedValueOnce(ok);
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="fiesta-abcd" event={baseEvent} onIdentified={onIdentified} />);

    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    await waitFor(() => expect(onIdentified).toHaveBeenCalledWith({ token: 'tok', guestName: 'Ana Rojas' }));
    expect(registerGuest).toHaveBeenCalledWith('fiesta-abcd', 'Ana Rojas', '4821', {});
    expect(loginGuest).not.toHaveBeenCalled();
  });

  it('no consulta con una sola palabra en el nombre', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu nombre y tu apellido.');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it('exige un PIN de 4 a 6 números', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '12');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('El PIN debe tener entre 4 y 6 números.');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it('solo acepta números en el PIN', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    const pin = screen.getByLabelText(/Elige un PIN/);
    await userEvent.type(pin, '12ab34');
    expect(pin).toHaveValue('1234');
  });

  it('avisa si los dos PIN no coinciden, sin consultar', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821', '4822');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Los dos PIN no coinciden.');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it.each([
    ['name_taken', /Ya hay alguien inscrito/],
    ['not_found', /No te encontramos en la lista/],
    ['ambiguous', /más de una persona/],
  ] as const)('muestra el mensaje para %s, vacía los PIN y no deja entrar', async (outcome, message) => {
    vi.mocked(registerGuest).mockResolvedValueOnce({ outcome, ...none });
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="s" event={{ ...baseEvent, accessMode: 'list_requests' }} onIdentified={onIdentified} />);

    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onIdentified).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Elige un PIN/)).toHaveValue('');
    expect(screen.getByLabelText('Repite tu PIN')).toHaveValue('');
  });

  it('una solicitud pendiente se muestra como aviso de estado, no como error', async () => {
    vi.mocked(registerGuest).mockResolvedValueOnce({ outcome: 'pending_approval', ...none });
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="s" event={{ ...baseEvent, accessMode: 'list_requests' }} onIdentified={onIdentified} />);

    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/solicitud quedó pendiente/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onIdentified).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Elige un PIN/)).toHaveValue('');
  });

  it('conserva lo escrito si falla la red o hay demasiados intentos, para reintentar', async () => {
    vi.mocked(registerGuest).mockRejectedValueOnce(new Error('Demasiados intentos seguidos. Espera unos minutos.'));
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);

    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos seguidos.');
    expect(screen.getByLabelText(/Elige un PIN/)).toHaveValue('4821');
  });
});

describe('IdentifyForm: ya me inscribí', () => {
  async function openLogin() {
    await userEvent.click(screen.getByRole('button', { name: 'Ya me inscribí' }));
  }

  it('entra con nombre y PIN, sin pedir repetirlo', async () => {
    vi.mocked(loginGuest).mockResolvedValueOnce(ok);
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="fiesta-abcd" event={baseEvent} onIdentified={onIdentified} />);
    await openLogin();

    expect(screen.queryByLabelText('Repite tu PIN')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.type(screen.getByLabelText('Tu PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(onIdentified).toHaveBeenCalledWith({ token: 'tok', guestName: 'Ana Rojas' }));
    expect(loginGuest).toHaveBeenCalledWith('fiesta-abcd', 'Ana Rojas', '4821');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', /Nombre o PIN incorrectos/],
    ['ambiguous', /más de una persona/],
    ['locked', /Espera 10 minutos/],
    ['needs_registration', /Todavía no te inscribes/],
  ] as const)('muestra el mensaje para %s', async (outcome, message) => {
    vi.mocked(loginGuest).mockResolvedValueOnce({ outcome, ...none });
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await openLogin();

    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.type(screen.getByLabelText('Tu PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Tu PIN')).toHaveValue('');
  });

  it('una solicitud que sigue pendiente se muestra como aviso de estado', async () => {
    vi.mocked(loginGuest).mockResolvedValueOnce({ outcome: 'pending_approval', ...none });
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await openLogin();
    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.type(screen.getByLabelText('Tu PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/sigue pendiente/);
  });

  it('cambiar de pestaña limpia el mensaje y los PIN', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '12');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await openLogin();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tu PIN')).toHaveValue('');
  });

  it('el PIN es un campo de contraseña (no queda a la vista)', () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    expect(screen.getByLabelText(/Elige un PIN/)).toHaveAttribute('type', 'password');
  });
});

describe('IdentifyForm: el evento', () => {
  it('muestra el nombre del evento como título, con el lugar y la fecha', () => {
    render(
      <IdentifyForm
        slug="s"
        event={{ ...baseEvent, name: 'PUTI HALLOWEEN', location: 'Los Pozos 6855', startsAt: '2026-10-30T23:30:00Z' }}
        onIdentified={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'PUTI HALLOWEEN' })).toBeInTheDocument();
    expect(screen.getByText('Los Pozos 6855')).toBeInTheDocument();
    expect(screen.getByText(/octubre/i)).toBeInTheDocument();
  });

  it('sin fecha ni lugar no deja huecos', () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Cumple de Fabrizio' })).toBeInTheDocument();
  });

  it('muestra la bienvenida al inscribirse y la oculta al entrar', async () => {
    const event = { ...baseEvent, enrollment: resolveEnrollmentConfig({ welcome: 'Vengan disfrazadas' }) };
    render(<IdentifyForm slug="s" event={event} onIdentified={vi.fn()} />);
    expect(screen.getByText('Vengan disfrazadas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ya me inscribí' }));
    expect(screen.queryByText('Vengan disfrazadas')).not.toBeInTheDocument();
  });
});

describe('IdentifyForm: inscripción configurable', () => {
  const full = resolveEnrollmentConfig({
    plus_ones: { max: 2 },
    comment: { label: '¿Alguna alergia?', required: false },
    questions: [{ id: 'q1', label: '¿De qué te disfrazas?', required: true }],
  });
  const eventWith = { ...baseEvent, enrollment: full };

  it('sin configuración no pide nada más y envía solo nombre y PIN', async () => {
    vi.mocked(registerGuest).mockResolvedValueOnce(ok);
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    expect(screen.queryByText(/acompañantes/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /alergia/i })).not.toBeInTheDocument();

    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    await waitFor(() => expect(registerGuest).toHaveBeenCalledWith('s', 'Ana Rojas', '4821', {}));
  });

  it('avisa que los acompañantes son una solicitud que aprueba quien organiza', () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    expect(screen.getByText(/Es una solicitud: quien organiza la revisa y la aprueba/)).toBeInTheDocument();
  });

  it('pide los nombres de los acompañantes según la cantidad elegida', async () => {
    vi.mocked(registerGuest).mockResolvedValueOnce(ok);
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);

    expect(screen.queryByLabelText(/Nombre del acompañante/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('2'));
    await userEvent.type(screen.getByLabelText('Nombre del acompañante 1'), 'Luis Pérez');
    await userEvent.type(screen.getByLabelText('Nombre del acompañante 2'), 'Marta Soto');

    await fillRegister('Ana Rojas', '4821');
    await userEvent.type(screen.getByLabelText(/De qué te disfrazas/), 'Regina George');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    await waitFor(() =>
      expect(registerGuest).toHaveBeenCalledWith('s', 'Ana Rojas', '4821', {
        plus_ones: ['Luis Pérez', 'Marta Soto'],
        q1: 'Regina George',
      }),
    );
  });

  it('al bajar la cantidad conserva los nombres que ya estaban', async () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await userEvent.click(screen.getByLabelText('2'));
    await userEvent.type(screen.getByLabelText('Nombre del acompañante 1'), 'Luis Pérez');
    await userEvent.click(screen.getByLabelText('1'));
    expect(screen.getByLabelText('Nombre del acompañante')).toHaveValue('Luis Pérez');
    await userEvent.click(screen.getByLabelText('Ninguno'));
    expect(screen.queryByLabelText(/Nombre del acompañante/)).not.toBeInTheDocument();
  });

  it('avisa si falta el nombre de un acompañante, sin consultar, y enfoca ese campo', async () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821');
    await userEvent.type(screen.getByLabelText(/De qué te disfrazas/), 'Regina');
    await userEvent.click(screen.getByLabelText('1'));
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el nombre de cada acompañante.');
    expect(screen.getByLabelText('Nombre del acompañante')).toHaveFocus();
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it('la pregunta obligatoria sin responder bloquea el envío y deja el error junto al campo', async () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    const field = screen.getByLabelText(/De qué te disfrazas/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(/De qué te disfrazas/);
    expect(field).toHaveAccessibleDescription(/De qué te disfrazas/);
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it('marca como opcional lo que no es obligatorio', () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    expect(screen.getByText('¿Alguna alergia?').parentElement).toHaveTextContent(/opcional/i);
    expect(screen.getByText('¿De qué te disfrazas?').parentElement).not.toHaveTextContent(/opcional/i);
  });

  it('el comentario muestra el contador y respeta el máximo de 280', async () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    const comment = screen.getByLabelText(/Alguna alergia/);
    expect(comment).toHaveAttribute('maxlength', '280');
    await userEvent.type(comment, 'vegana');
    expect(screen.getByText('6 de 280 caracteres')).toBeInTheDocument();
  });

  it('un comentario obligatorio vacío bloquea el envío', async () => {
    const event = {
      ...baseEvent,
      enrollment: resolveEnrollmentConfig({ comment: { label: 'Cuéntanos algo', required: true } }),
    };
    render(<IdentifyForm slug="s" event={event} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cuéntanos algo');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it('si la base rechaza las respuestas, lo dice junto al campo y conserva lo escrito', async () => {
    vi.mocked(registerGuest).mockRejectedValueOnce(new EnrollmentAnswersError('question_required:q1'));
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821');
    await userEvent.type(screen.getByLabelText(/De qué te disfrazas/), 'Regina');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/De qué te disfrazas/);
    expect(screen.getByLabelText('Nombre y apellido')).toHaveValue('Ana Rojas');
  });

  it('hay un solo anuncio de error aunque falten varios campos', async () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/nombre y tu apellido/);
    expect(screen.getByRole('alert')).toHaveTextContent(/PIN debe tener/);
  });

  it('un error de un campo que ya no existe se muestra en el aviso general, no se pierde', async () => {
    vi.mocked(registerGuest).mockRejectedValueOnce(new EnrollmentAnswersError('question_unknown:q2'));
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821');
    await userEvent.type(screen.getByLabelText(/De qué te disfrazas/), 'Regina');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/organizador haya cambiado el formulario/);
  });

  it('un acompañante de más que ya no cabe también llega al aviso general', async () => {
    vi.mocked(registerGuest).mockRejectedValueOnce(new EnrollmentAnswersError('plus_ones_too_many'));
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821');
    await userEvent.type(screen.getByLabelText(/De qué te disfrazas/), 'Regina');
    await userEvent.click(screen.getByLabelText('1'));
    await userEvent.type(screen.getByLabelText('Nombre del acompañante'), 'Luis Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Puedes traer hasta 2|cambiado el formulario/);
  });

  it('al corregir un campo con error, su error desaparece', async () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    const name = screen.getByLabelText('Nombre y apellido');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(name, 'Ana Rojas');
    expect(name).toHaveAttribute('aria-invalid', 'false');
  });

  it('avisa que no se escriban datos personales en las respuestas libres', () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    expect(screen.getByText(/No escribas aquí RUT, correo, teléfono ni claves/)).toBeInTheDocument();
  });

  it('sin comentario ni preguntas no muestra ese aviso', () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    expect(screen.queryByText(/No escribas aquí RUT/)).not.toBeInTheDocument();
  });

  it('al iniciar sesión no pide acompañantes, comentario ni preguntas', async () => {
    render(<IdentifyForm slug="s" event={eventWith} onIdentified={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ya me inscribí' }));
    expect(screen.queryByText(/acompañantes/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/De qué te disfrazas/)).not.toBeInTheDocument();
  });

  it('el botón queda deshabilitado mientras se envía', async () => {
    let finish: (v: typeof ok) => void = () => {};
    vi.mocked(registerGuest).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('button', { name: 'Un momento...' })).toBeDisabled();
    await act(async () => finish(ok));
  });
});
