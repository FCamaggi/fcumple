import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/briefApi', () => ({
  submitClientBrief: vi.fn(),
}));

import * as api from '../lib/briefApi';
import ClientBriefPage from './ClientBriefPage';

const submit = api.submitClientBrief as unknown as ReturnType<typeof vi.fn>;

function renderPage(slug = 'francisca') {
  return render(
    <MemoryRouter initialEntries={[`/brief/${slug}`]}>
      <Routes>
        <Route path="/brief/:slug" element={<ClientBriefPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  submit.mockReset();
  window.localStorage.clear();
});

describe('ClientBriefPage', () => {
  it('muestra un aviso cuando el formulario no existe', () => {
    renderPage('no-existe');
    expect(screen.getByText('Este formulario no existe.')).toBeInTheDocument();
  });

  it('muestra el formulario de francisca con sus preguntas', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Tu cumpleaños, tu estilo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Club de noche/ })).toBeInTheDocument();
  });

  it('no deja enviar sin responder nada', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Enviar mis respuestas' })).toBeDisabled();
  });

  it('marca una opción única y permite cambiarla', async () => {
    const user = userEvent.setup();
    renderPage();

    const rosa = screen.getByRole('button', { name: /Rosa chicle y negro/ });
    const vino = screen.getByRole('button', { name: /Rojo vino y dorado/ });
    await user.click(rosa);
    expect(rosa).toHaveAttribute('aria-pressed', 'true');

    await user.click(vino);
    expect(vino).toHaveAttribute('aria-pressed', 'true');
    expect(rosa).toHaveAttribute('aria-pressed', 'false');
  });

  it('permite varias opciones donde la pregunta es múltiple', async () => {
    const user = userEvent.setup();
    renderPage();

    const club = screen.getByRole('button', { name: /Club de noche/ });
    const gala = screen.getByRole('button', { name: /Gala de terror glam/ });
    await user.click(club);
    await user.click(gala);
    expect(club).toHaveAttribute('aria-pressed', 'true');
    expect(gala).toHaveAttribute('aria-pressed', 'true');
  });

  it('envía las opciones con sus etiquetas y las notas libres', async () => {
    const user = userEvent.setup();
    submit.mockResolvedValueOnce('brief-1');
    renderPage();

    await user.type(screen.getByLabelText('Tu nombre'), 'Francisca');
    await user.click(screen.getByRole('button', { name: /Club de noche/ }));
    await user.type(document.getElementById('brief-note-evitar') as HTMLElement, 'nada de globos');
    await user.click(screen.getByRole('button', { name: 'Enviar mis respuestas' }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const [slug, respondent, answers] = submit.mock.calls[0];
    expect(slug).toBe('francisca');
    expect(respondent).toBe('Francisca');
    expect(answers.ambiente).toEqual({
      pregunta: '¿Qué ambiente tiene que tener la fiesta?',
      elegidas: ['Club de noche'],
      nota: '',
    });
    expect(answers.evitar).toEqual({
      pregunta: '¿Qué NO quieres que se vea?',
      elegidas: [],
      nota: 'nada de globos',
    });
    expect(await screen.findByText('Listo, recibido')).toBeInTheDocument();
  });

  it('muestra el error y conserva lo respondido si el envío falla', async () => {
    const user = userEvent.setup();
    submit.mockRejectedValueOnce(new Error('No pudimos enviar tus respuestas: boom'));
    renderPage();

    const club = screen.getByRole('button', { name: /Club de noche/ });
    await user.click(club);
    await user.click(screen.getByRole('button', { name: 'Enviar mis respuestas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos enviar tus respuestas: boom');
    expect(club).toHaveAttribute('aria-pressed', 'true');
  });

  it('copia las respuestas como texto', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();

    await user.click(screen.getByRole('button', { name: /Club de noche/ }));
    await user.click(screen.getByRole('button', { name: 'Copiar mis respuestas' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('Elegí: Club de noche');
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });

  it('recupera el borrador al volver a abrir el formulario', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await user.click(screen.getByRole('button', { name: /Club de noche/ }));
    first.unmount();

    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Club de noche/ })).toHaveAttribute('aria-pressed', 'true'),
    );
  });
});
