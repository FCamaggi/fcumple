import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnrollmentSettings from './EnrollmentSettings';
import type { OrganizerEvent } from '../lib/organizerApi';
import { emptyEnrollment, resolveEnrollmentConfig } from '../lib/enrollmentConfig';

const event: OrganizerEvent = {
  id: 'ev-1',
  slug: 'fiesta-abcd',
  name: 'Fiesta',
  startsAt: null,
  location: null,
  accessMode: 'open',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  framesEnabled: true,
  stickersEnabled: true,
  defaultFrameId: null,
  photosRevealedAt: null,
  subtitle: null,
  theme: {},
  activationCode: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  defaultPhotoQuota: 5,
  enrollment: emptyEnrollment(),
  createdAt: '2026-10-15T00:00:00Z',
};

const save = () => screen.getByRole('button', { name: 'Guardar inscripción' });

describe('EnrollmentSettings', () => {
  it('con todo apagado guarda una configuración vacía', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EnrollmentSettings event={event} onSave={onSave} />);
    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith({ enrollment: emptyEnrollment() });
    expect(await screen.findByRole('status')).toHaveTextContent('Inscripción guardada.');
  });

  it('activa los acompañantes con un máximo', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EnrollmentSettings event={event} onSave={onSave} />);
    expect(screen.queryByLabelText('Máximo de acompañantes')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Permitir acompañantes (+1)'));
    await userEvent.selectOptions(screen.getByLabelText('Máximo de acompañantes'), '3');
    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith({ enrollment: { ...emptyEnrollment(), plusOnes: { max: 3 } } });
  });

  it('activa el comentario con su pregunta y si es obligatorio', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EnrollmentSettings event={event} onSave={onSave} />);
    await userEvent.click(screen.getByLabelText('Pedir un comentario'));
    const label = screen.getByLabelText('Pregunta del comentario');
    expect(label).toHaveValue('Comentario');
    await userEvent.clear(label);
    await userEvent.type(label, '¿Alguna alergia?');
    await userEvent.click(screen.getByLabelText('El comentario es obligatorio'));
    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith({
      enrollment: { ...emptyEnrollment(), comment: { label: '¿Alguna alergia?', required: true } },
    });
  });

  it('el comentario muestra el máximo de caracteres', async () => {
    render(<EnrollmentSettings event={event} onSave={vi.fn()} />);
    await userEvent.click(screen.getByLabelText('Pedir un comentario'));
    expect(screen.getByText(/280 caracteres/)).toBeInTheDocument();
  });

  it('agrega hasta 3 preguntas propias y las puede quitar', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EnrollmentSettings event={event} onSave={onSave} />);
    const add = screen.getByRole('button', { name: 'Agregar pregunta' });

    await userEvent.click(add);
    await userEvent.type(screen.getByLabelText('Pregunta 1'), '¿De qué te disfrazas?');
    await userEvent.click(screen.getByLabelText('Pregunta 1 obligatoria'));
    await userEvent.click(add);
    await userEvent.type(screen.getByLabelText('Pregunta 2'), 'Canción');
    await userEvent.click(add);
    await userEvent.type(screen.getByLabelText('Pregunta 3'), 'Bebida');
    expect(add).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar pregunta 2' }));
    expect(screen.getByLabelText('Pregunta 2')).toHaveValue('Bebida');
    expect(add).toBeEnabled();

    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith({
      enrollment: {
        ...emptyEnrollment(),
        questions: [
          { id: 'q1', label: '¿De qué te disfrazas?', required: true },
          // Conserva su id: las respuestas que ya dieron los invitados siguen atadas a su pregunta.
          { id: 'q3', label: 'Bebida', required: false },
        ],
      },
    });
  });

  it('una pregunta nueva toma un id que no esté en uso', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const withQ2 = {
      ...event,
      enrollment: resolveEnrollmentConfig({ questions: [{ id: 'q2', label: 'Canción', required: false }] }),
    };
    render(<EnrollmentSettings event={withQ2} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar pregunta' }));
    await userEvent.type(screen.getByLabelText('Pregunta 2'), 'Bebida');
    await userEvent.click(save());
    const ids = onSave.mock.calls[0][0].enrollment.questions.map((q: { id: string }) => q.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('una pregunta nueva no reutiliza el id de una con respuestas ya guardadas', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EnrollmentSettings event={event} onSave={onSave} usedQuestionIds={['q1']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar pregunta' }));
    await userEvent.type(screen.getByLabelText('Pregunta 1'), 'Bebida');
    await userEvent.click(save());
    expect(onSave.mock.calls[0][0].enrollment.questions).toEqual([{ id: 'q2', label: 'Bebida', required: false }]);
  });

  it('si todos los ids libres tienen respuestas, no deja agregar y lo explica', () => {
    render(<EnrollmentSettings event={event} onSave={vi.fn()} usedQuestionIds={['q1', 'q2', 'q3']} />);
    expect(screen.getByRole('button', { name: 'Agregar pregunta' })).toBeDisabled();
    expect(screen.getByText(/ya respondieron las preguntas que quitaste/)).toBeInTheDocument();
  });

  it('no deja guardar una pregunta que pide RUT, correo, teléfono o claves', async () => {
    const onSave = vi.fn();
    render(<EnrollmentSettings event={event} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar pregunta' }));
    await userEvent.type(screen.getByLabelText('Pregunta 1'), '¿Cuál es tu RUT?');
    await userEvent.click(save());
    expect(screen.getByRole('alert')).toHaveTextContent(/pide un dato personal/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('tampoco el comentario puede pedir un dato personal', async () => {
    const onSave = vi.fn();
    render(<EnrollmentSettings event={event} onSave={onSave} />);
    await userEvent.click(screen.getByLabelText('Pedir un comentario'));
    const label = screen.getByLabelText('Pregunta del comentario');
    await userEvent.clear(label);
    await userEvent.type(label, 'Tu teléfono');
    await userEvent.click(save());
    expect(screen.getByRole('alert')).toHaveTextContent(/pide un dato personal/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('carga la configuración actual', () => {
    const configured = {
      ...event,
      enrollment: resolveEnrollmentConfig({
        welcome: 'Vengan disfrazadas',
        plus_ones: { max: 2 },
        comment: { label: '¿Alergias?', required: false },
        questions: [{ id: 'q1', label: 'Disfraz', required: true }],
      }),
    };
    render(<EnrollmentSettings event={configured} onSave={vi.fn()} />);
    expect(screen.getByLabelText(/Texto de bienvenida/)).toHaveValue('Vengan disfrazadas');
    expect(screen.getByLabelText('Máximo de acompañantes')).toHaveValue('2');
    expect(screen.getByLabelText('Pregunta del comentario')).toHaveValue('¿Alergias?');
    expect(screen.getByLabelText('Pregunta 1')).toHaveValue('Disfraz');
    expect(screen.getByLabelText('Pregunta 1 obligatoria')).toBeChecked();
  });

  it('no deja guardar una pregunta o un comentario sin texto', async () => {
    const onSave = vi.fn();
    render(<EnrollmentSettings event={event} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar pregunta' }));
    await userEvent.click(save());
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el texto de la pregunta 1.');
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar pregunta 1' }));
    await userEvent.click(screen.getByLabelText('Pedir un comentario'));
    await userEvent.clear(screen.getByLabelText('Pregunta del comentario'));
    await userEvent.click(save());
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe la pregunta del comentario.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('avisa que no se puede pedir RUT, correo ni teléfono', () => {
    render(<EnrollmentSettings event={event} onSave={vi.fn()} />);
    expect(screen.getByText(/No se pueden pedir RUT, correo ni teléfono/)).toBeInTheDocument();
  });

  it('muestra el error si guardar falla', async () => {
    render(
      <EnrollmentSettings
        event={event}
        onSave={vi.fn().mockRejectedValue(new Error('No pudimos guardar los ajustes del evento.'))}
      />,
    );
    await userEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar');
  });

  it('agrupa las preguntas propias en un grupo con nombre', () => {
    render(<EnrollmentSettings event={event} onSave={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Preguntas propias' });
    expect(within(group).getByRole('button', { name: 'Agregar pregunta' })).toBeInTheDocument();
  });
});
