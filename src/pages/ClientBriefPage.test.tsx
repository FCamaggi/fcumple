import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/briefApi', () => ({
  submitClientBrief: vi.fn(),
}));

// El canvas real no existe en jsdom: el doble expone la plantilla y el texto que recibiría.
vi.mock('../components/studio/FramePreview', () => ({
  default: ({ template, params }: { template: string; params: Record<string, string> }) => (
    <div
      data-testid={`frame-${template}`}
      data-title={params.title ?? ''}
      data-subtitle={params.subtitle ?? ''}
      data-caption={params.caption ?? ''}
      data-primary={params.primaryColor ?? ''}
    />
  ),
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

const option = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  submit.mockReset();
  window.localStorage.clear();
});

describe('ClientBriefPage', () => {
  it('muestra un aviso cuando el formulario no existe', () => {
    renderPage('no-existe');
    expect(screen.getByText('Este formulario no existe.')).toBeInTheDocument();
  });

  it('muestra el formulario de francisca con la paleta primero y el ambiente después', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Tu cumpleaños, tu estilo' })).toBeInTheDocument();

    const titles = screen.getAllByText(/^¿/).map((el) => el.textContent);
    expect(titles.indexOf('¿Qué paleta de colores te late?')).toBeLessThan(
      titles.indexOf('¿Qué ambiente tiene que tener la fiesta?'),
    );
    expect(titles.indexOf('¿Qué dicen los marcos?')).toBeLessThan(titles.indexOf('¿Qué marcos para las fotos?'));
  });

  it('no deja enviar sin responder nada', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Enviar mis respuestas' })).toBeDisabled();
  });

  it('marca una opción única y permite cambiarla', async () => {
    const user = userEvent.setup();
    renderPage();

    const rosa = option(/Rosa chicle y negro/);
    const vino = option(/Rojo vino y dorado/);
    await user.click(rosa);
    expect(rosa).toHaveAttribute('aria-pressed', 'true');

    await user.click(vino);
    expect(vino).toHaveAttribute('aria-pressed', 'true');
    expect(rosa).toHaveAttribute('aria-pressed', 'false');
  });

  it('aplica la paleta elegida a las vistas previas de los ambientes', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    expect(container.querySelector('svg [fill="#ff5fa2"]')).toBeNull();
    await user.click(option(/Rosa chicle y negro/));
    expect(container.querySelector('svg [fill="#ff5fa2"]')).not.toBeNull();
  });

  it('muestra las letras con la tipografía real de la cámara', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    const serif = option(/Clásica/);
    const sample = serif.querySelector('span[style*="font-family"]') as HTMLElement;
    expect(sample.textContent).toContain('Ana');
    expect(sample.style.fontFamily).toContain('Georgia');
  });

  it('lleva el nombre y la fecha escritos a la vista previa del marco', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nombre'), 'Fran');
    await user.type(screen.getByLabelText('Fecha'), '31 de octubre');

    const banner = screen.getByTestId('frame-banner');
    expect(banner).toHaveAttribute('data-title', 'Fran');
    expect(banner).toHaveAttribute('data-subtitle', '31 de octubre');
    expect(screen.getByTestId('frame-polaroid')).toHaveAttribute('data-caption', 'Fran');
  });

  it('ofrece los dos marcos conversados y una opción para conversarlo en privado', () => {
    renderPage();
    expect(option(/Mi cumpleaños/)).toBeInTheDocument();
    expect(option(/Halloween estilo Mean Girls/)).toBeInTheDocument();
    expect(option(/Lo conversamos en privado/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /orejas de conejita/ })).toBeInTheDocument();
  });

  it('"Lo conversamos en privado" reemplaza a los demás marcos y viceversa', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(option(/Mi cumpleaños/));
    await user.click(option(/Halloween estilo Mean Girls/));
    expect(option(/Mi cumpleaños/)).toHaveAttribute('aria-pressed', 'true');
    expect(option(/Halloween estilo Mean Girls/)).toHaveAttribute('aria-pressed', 'true');

    await user.click(option(/Lo conversamos en privado/));
    expect(option(/Lo conversamos en privado/)).toHaveAttribute('aria-pressed', 'true');
    expect(option(/Mi cumpleaños/)).toHaveAttribute('aria-pressed', 'false');
    expect(option(/Halloween estilo Mean Girls/)).toHaveAttribute('aria-pressed', 'false');

    await user.click(option(/Polaroid/));
    expect(option(/Lo conversamos en privado/)).toHaveAttribute('aria-pressed', 'false');
    expect(option(/Polaroid/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('respeta el tope de dos ambientes soltando el más antiguo', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(option(/Club de noche/));
    await user.click(option(/Gala de terror glam/));
    await user.click(option(/Mascarada/));

    expect(option(/Club de noche/)).toHaveAttribute('aria-pressed', 'false');
    expect(option(/Gala de terror glam/)).toHaveAttribute('aria-pressed', 'true');
    expect(option(/Mascarada/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('envía opciones con etiquetas, campos de texto y notas libres', async () => {
    const user = userEvent.setup();
    submit.mockResolvedValueOnce('brief-1');
    renderPage();

    await user.type(screen.getByLabelText('Tu nombre'), 'Francisca');
    await user.type(screen.getByLabelText('Nombre'), 'Fran');
    await user.click(option(/Club de noche/));
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
    expect(answers.textos).toEqual({
      pregunta: '¿Qué dicen los marcos?',
      elegidas: [],
      nota: '',
      campos: { nombre: 'Fran' },
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

    const club = option(/Club de noche/);
    await user.click(club);
    await user.click(screen.getByRole('button', { name: 'Enviar mis respuestas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos enviar tus respuestas: boom');
    expect(club).toHaveAttribute('aria-pressed', 'true');
  });

  it('copia las respuestas como texto, con los campos escritos', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();

    await user.type(screen.getByLabelText('Nombre'), 'Fran');
    await user.click(option(/Club de noche/));
    await user.click(screen.getByRole('button', { name: 'Copiar mis respuestas' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('Elegí: Club de noche');
    expect(writeText.mock.calls[0][0]).toContain('nombre: Fran');
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });

  it('recupera el borrador, con los textos, al volver a abrir el formulario', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await user.click(option(/Club de noche/));
    await user.type(screen.getByLabelText('Nombre'), 'Fran');
    first.unmount();

    renderPage();
    await waitFor(() => expect(option(/Club de noche/)).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByLabelText('Nombre')).toHaveValue('Fran');
  });
});
