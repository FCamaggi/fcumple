import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuestListPanel from './GuestListPanel';
import type { OrganizerGuest } from '../lib/organizerApi';
import { emptyEnrollment, resolveEnrollmentConfig } from '../lib/enrollmentConfig';

vi.mock('../lib/downloadCsv', () => ({ downloadCsv: vi.fn() }));
import { downloadCsv } from '../lib/downloadCsv';

function guest(overrides: Partial<OrganizerGuest> = {}): OrganizerGuest {
  return {
    id: 'g1',
    eventId: 'ev-1',
    fullName: 'Ana Rojas',
    token: 'tok',
    approvalStatus: 'approved',
    status: 'pending',
    plusOnesAllowed: 0,
    plusOnesConfirmed: 0,
    photoQuota: 5,
    answers: {},
    plusOnesRequested: 0,
    checkedInAt: null,
    claimedAt: null,
    lastSeenAt: null,
    ...overrides,
  };
}

function setup(guests: OrganizerGuest[], overrides: Record<string, unknown> = {}) {
  const props = {
    guests,
    enrollment: emptyEnrollment(),
    slug: 'fiesta-abcd',
    onAdd: vi.fn().mockResolvedValue({ created: [], failed: [] }),
    onReview: vi.fn().mockResolvedValue(undefined),
    onReviewPlusOnes: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onRegenerate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<GuestListPanel {...props} />);
  return props;
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(downloadCsv).mockReset();
});

const configured = resolveEnrollmentConfig({
  plus_ones: { max: 2 },
  comment: { label: '¿Alguna alergia?', required: false },
  questions: [{ id: 'q1', label: '¿De qué te disfrazas?', required: true }],
});

describe('GuestListPanel: respuestas de la inscripción', () => {
  it('marca como SOLICITUD los acompañantes que todavía no se aprobaron', () => {
    setup([guest({ plusOnesRequested: 2, answers: { plus_ones: ['Luis Pérez', 'Marta Soto'] } })], {
      enrollment: configured,
    });
    expect(screen.getByText('Solicita +2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar +2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No aprobar' })).toBeInTheDocument();
  });

  it('los acompañantes aprobados se muestran como +N, sin botones', () => {
    setup([guest({ plusOnesRequested: 1, plusOnesConfirmed: 1, plusOnesAllowed: 1 })], { enrollment: configured });
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprobar \+/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Solicita/)).not.toBeInTheDocument();
  });

  it('aprobar y no aprobar llaman al panel con la decisión', async () => {
    const props = setup([guest({ plusOnesRequested: 2 })], { enrollment: configured });
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar +2' }));
    expect(props.onReviewPlusOnes).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }), true);
    await userEvent.click(screen.getByRole('button', { name: 'No aprobar' }));
    expect(props.onReviewPlusOnes).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'g1' }), false);
  });

  it('una solicitud de acceso pendiente también muestra que pide acompañantes', () => {
    setup([guest({ approvalStatus: 'pending', plusOnesRequested: 1 })], { enrollment: configured });
    expect(screen.getByText('Solicita +1')).toBeInTheDocument();
  });

  it('despliega los acompañantes, el comentario y las respuestas con las preguntas del organizador', async () => {
    setup(
      [
        guest({
          plusOnesRequested: 1,
          answers: { plus_ones: ['Luis Pérez'], comment: 'Vegana', q1: 'Regina George' },
        }),
      ],
      { enrollment: configured },
    );
    await userEvent.click(screen.getByText(/Ver respuestas/));
    expect(screen.getByText('Acompañantes')).toBeInTheDocument();
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.getByText('¿Alguna alergia?')).toBeInTheDocument();
    expect(screen.getByText('Vegana')).toBeInTheDocument();
    expect(screen.getByText('¿De qué te disfrazas?')).toBeInTheDocument();
    expect(screen.getByText('Regina George')).toBeInTheDocument();
  });

  it('un invitado sin respuestas no muestra el desplegable', () => {
    setup([guest()], { enrollment: configured });
    expect(screen.queryByText(/Ver respuestas/)).not.toBeInTheDocument();
  });

  it('las solicitudes pendientes también muestran sus respuestas, para decidir con ellas', async () => {
    setup([guest({ approvalStatus: 'pending', answers: { q1: 'Gretchen' } })], { enrollment: configured });
    await userEvent.click(screen.getByText(/Ver respuestas/));
    expect(screen.getByText('Gretchen')).toBeInTheDocument();
  });

  it('no esconde la respuesta a una pregunta que el organizador ya quitó', async () => {
    setup([guest({ answers: { q2: 'Respuesta vieja' } })], { enrollment: configured });
    await userEvent.click(screen.getByText(/Ver respuestas/));
    expect(screen.getByText('Respuesta vieja')).toBeInTheDocument();
    expect(screen.getByText(/pregunta que ya no está/i)).toBeInTheDocument();
  });

  it('exporta el CSV con el nombre del evento y el BOM para Excel', async () => {
    setup([guest({ answers: { q1: 'Regina George' } })], { enrollment: configured });
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, content, options] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toBe('invitados-fiesta-abcd.csv');
    expect(content).toContain('Ana Rojas');
    expect(content).toContain('Regina George');
    expect(content).not.toContain('tok');
    expect(options).toEqual({ bom: true });
  });

  it('sin invitados no ofrece exportar', () => {
    setup([]);
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });
});

describe('GuestListPanel', () => {
  it('cuenta invitados y quienes ya entraron, y muestra el estado de cada uno', () => {
    setup([
      guest({ id: '1', fullName: 'Ana Rojas', claimedAt: '2026-10-15T20:00:00Z' }),
      guest({ id: '2', fullName: 'Beto Mora' }),
      guest({ id: '3', fullName: 'Carla Diaz', claimedAt: '2026-10-15T20:00:00Z', checkedInAt: '2026-10-15T21:00:00Z' }),
    ]);
    expect(screen.getByText('Invitados: 3 · han entrado: 2')).toBeInTheDocument();
    expect(screen.getByText('Entró')).toBeInTheDocument();
    expect(screen.getByText('Aún no entra')).toBeInTheDocument();
    expect(screen.getByText('Llegó')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay invitados', () => {
    setup([]);
    expect(screen.getByText(/Todavía no hay invitados/)).toBeInTheDocument();
  });

  it('agrega un invitado por línea e ignora líneas vacías', async () => {
    const props = setup([]);
    await userEvent.type(screen.getByLabelText(/Agregar invitados/), 'Ana Rojas{enter}{enter}  Beto Mora  ');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(props.onAdd).toHaveBeenCalledWith(['Ana Rojas', 'Beto Mora']);
  });

  it('deja en el cuadro solo las líneas que fallaron y explica por qué', async () => {
    const props = setup([], {
      onAdd: vi.fn().mockResolvedValue({
        created: [guest()],
        failed: [{ name: 'Madonna', reason: 'Cada invitado necesita nombre y apellido (dos palabras).' }],
      }),
    });
    const box = screen.getByLabelText(/Agregar invitados/);
    await userEvent.type(box, 'Ana Rojas{enter}Madonna');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Agregaste 1; 1 no se pudieron agregar');
    expect(screen.getByRole('alert')).toHaveTextContent('Madonna: Cada invitado necesita nombre y apellido');
    expect(box).toHaveValue('Madonna');
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it('muestra las solicitudes pendientes aparte y permite aprobarlas o rechazarlas', async () => {
    const pending = guest({ id: 'p1', fullName: 'Pedro Pascal', approvalStatus: 'pending' });
    const props = setup([guest(), pending]);

    expect(screen.getByRole('region', { name: 'Solicitudes de acceso' })).toHaveTextContent('Pedro Pascal');
    expect(screen.getByText('Invitados: 1 · han entrado: 0')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(props.onReview).toHaveBeenCalledWith(pending, 'approved');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(props.onReview).toHaveBeenCalledWith(pending, 'rejected');
  });

  it('pide confirmación antes de regenerar el acceso o quitar a alguien', async () => {
    const ana = guest();
    const props = setup([ana]);

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer acceso' }));
    expect(props.onRegenerate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Restablecer acceso' }));
    expect(props.onRegenerate).toHaveBeenCalledWith(ana);

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(props.onRemove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(props.onRemove).toHaveBeenCalledWith(ana);
  });

  it('muestra el error si una acción falla', async () => {
    setup([guest()], { onRemove: vi.fn().mockRejectedValue(new Error('No tienes permiso para modificar este evento.')) });
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso'));
  });
});
