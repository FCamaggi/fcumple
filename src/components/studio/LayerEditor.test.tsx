import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCtx } from '../../test/mockCanvas';
import { installPointerEventPolyfill } from '../../test/pointerEvents';
import { MAX_LAYERS, validateLayers, type FrameLayer } from '../../lib/cameraAssets/layers';
import LayerEditor, { STAGE_HEIGHT, STAGE_WIDTH } from './LayerEditor';

installPointerEventPolyfill();

const EVENT = '123e4567-e89b-42d3-a456-426614174000';

const text: FrameLayer = { type: 'text', text: 'Cumpleaños Fran', x: 0.5, y: 0.5, size: 0.08, w: 1.2, font: 'anton', color: '#ffffff' };
const rect: FrameLayer = { type: 'shape', shape: 'rect', x: 0.5, y: 0.5, w: 0.4, h: 0.2, fill: '#ff4fa3' };

let latest: FrameLayer[] = [];

function Harness({ initial = [], ...props }: { initial?: FrameLayer[] } & Partial<Parameters<typeof LayerEditor>[0]>) {
  const [layers, setLayers] = useState<FrameLayer[]>(initial);
  latest = layers;
  return <LayerEditor layers={layers} onChange={setLayers} {...props} />;
}

beforeEach(() => {
  latest = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCtx().ctx);
});

const stage = () => screen.getByLabelText('Lienzo del marco');
const layerButton = (name: RegExp | string) => screen.getByRole('button', { name });

describe('LayerEditor: agregar y seleccionar', () => {
  it('agrega capas desde la botonera y deja seleccionada la nueva', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText(/Sin capas/i)).toBeInTheDocument();

    await user.click(layerButton('Agregar texto'));
    await user.click(layerButton('Agregar corazón'));
    await user.click(layerButton('Agregar emoji'));

    expect(latest.map((l) => (l.type === 'shape' ? l.shape : l.type))).toEqual(['text', 'path', 'emoji']);
    expect(validateLayers(latest)).toEqual({ ok: true });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(within(screen.getAllByRole('listitem')[2]).getByRole('button', { name: /Emoji/ })).toHaveAttribute('aria-current', 'true');
  });

  it('cada tipo de forma tiene su botón', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    for (const name of ['Agregar rectángulo', 'Agregar elipse', 'Agregar línea']) await user.click(layerButton(name));
    expect(latest.map((l) => l.type === 'shape' && l.shape)).toEqual(['rect', 'ellipse', 'line']);
  });

  it('elegir una capa de la lista muestra sus propiedades', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[text, rect]} />);
    expect(screen.getByText(/Elige una capa/i)).toBeInTheDocument();

    await user.click(within(screen.getAllByRole('listitem')[0]).getByRole('button', { name: /Cumpleaños Fran/ }));
    expect(screen.getByLabelText('Texto')).toHaveValue('Cumpleaños Fran');
  });

  it('con el tope de capas no deja agregar y lo explica', () => {
    render(<Harness initial={Array.from({ length: MAX_LAYERS }, () => rect)} />);
    expect(layerButton('Agregar texto')).toBeDisabled();
    expect(screen.getByText(new RegExp(`${MAX_LAYERS} capas`))).toBeInTheDocument();
  });
});

describe('LayerEditor: propiedades', () => {
  async function select(index: number, initial: FrameLayer[]) {
    const user = userEvent.setup();
    render(<Harness initial={initial} />);
    await user.click(within(screen.getAllByRole('listitem')[index]).getAllByRole('button')[0]);
    return user;
  }

  it('texto: cambia el contenido, la tipografía y el color', async () => {
    const user = await select(0, [text]);

    await user.clear(screen.getByLabelText('Texto'));
    await user.type(screen.getByLabelText('Texto'), 'Fran');
    await user.selectOptions(screen.getByLabelText('Tipografía'), 'pacifico');
    fireEvent.change(screen.getByLabelText('Color del texto'), { target: { value: '#ff4fa3' } });

    expect(latest[0]).toMatchObject({ text: 'Fran', font: 'pacifico', color: '#ff4fa3' });
    expect(validateLayers(latest)).toEqual({ ok: true });
  });

  it('texto: ofrece las tipografías de Francisca', async () => {
    await select(0, [text]);
    const options = within(screen.getByLabelText('Tipografía')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(['Afiche (Anton)', 'Glam (Playfair)', 'Rosa (Pacifico)', 'Marcador (Permanent Marker)', 'Máquina vieja (Special Elite)']));
  });

  it('forma: cambia relleno, borde y radio', async () => {
    await select(0, [rect]);
    fireEvent.change(screen.getByLabelText('Relleno'), { target: { value: '#111111' } });
    fireEvent.change(screen.getByLabelText('Color del borde'), { target: { value: '#00ff00' } });
    fireEvent.change(screen.getByLabelText('Grosor del borde'), { target: { value: '0.02' } });
    fireEvent.change(screen.getByLabelText('Redondeo'), { target: { value: '0.1' } });

    expect(latest[0]).toMatchObject({ fill: '#111111', stroke: '#00ff00', strokeWidth: 0.02, radius: 0.1 });
    expect(validateLayers(latest)).toEqual({ ok: true });
  });

  it('cualquier capa: opacidad, rotación, ancla y sombra', async () => {
    const user = await select(0, [rect]);
    fireEvent.change(screen.getByLabelText('Opacidad'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('Rotación'), { target: { value: '-30' } });
    await user.selectOptions(screen.getByLabelText('Ancla'), 'tl');
    await user.click(screen.getByLabelText('Sombra'));

    expect(latest[0]).toMatchObject({ opacity: 0.5, rotation: -30, anchor: 'tl', shadow: { color: '#000000' } });
    expect(validateLayers(latest)).toEqual({ ok: true });

    await user.click(screen.getByLabelText('Sombra'));
    expect(latest[0]).not.toHaveProperty('shadow');
  });

  it('emoji: acepta uno solo y rechaza texto', async () => {
    const user = await select(0, [{ type: 'emoji', emoji: '✨', x: 0.5, y: 0.5, size: 0.12 }]);
    await user.clear(screen.getByLabelText('Emoji'));
    await user.type(screen.getByLabelText('Emoji'), '🦇');
    expect(latest[0]).toMatchObject({ emoji: '🦇' });

    await user.clear(screen.getByLabelText('Emoji'));
    await user.type(screen.getByLabelText('Emoji'), 'hola');
    expect(latest[0]).toMatchObject({ emoji: '🦇' });
    expect(screen.getByRole('alert')).toHaveTextContent(/un solo emoji/i);
  });
});

describe('LayerEditor: orden, duplicar y borrar', () => {
  it('sube y baja una capa en el orden de apilado', async () => {
    const user = userEvent.setup();
    const a = { ...rect, x: 0.1 };
    const b = { ...rect, x: 0.2 };
    render(<Harness initial={[a, b]} />);
    await user.click(within(screen.getAllByRole('listitem')[0]).getAllByRole('button')[0]);

    await user.click(layerButton('Subir capa'));
    expect(latest.map((l) => l.x)).toEqual([0.2, 0.1]);
    await user.click(layerButton('Bajar capa'));
    expect(latest.map((l) => l.x)).toEqual([0.1, 0.2]);
  });

  it('duplica la capa seleccionada y borra con confirmación', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness initial={[text]} />);
    await user.click(within(screen.getAllByRole('listitem')[0]).getAllByRole('button')[0]);

    await user.click(layerButton('Duplicar capa'));
    expect(latest).toHaveLength(2);

    await user.click(layerButton('Borrar capa'));
    expect(latest).toHaveLength(1);
    expect(window.confirm).toHaveBeenCalled();
  });

  it('si no confirma, no borra', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness initial={[text]} />);
    await user.click(within(screen.getAllByRole('listitem')[0]).getAllByRole('button')[0]);
    await user.click(layerButton('Borrar capa'));
    expect(latest).toHaveLength(1);
  });
});

describe('LayerEditor: lienzo', () => {
  const center = { clientX: STAGE_WIDTH / 2, clientY: STAGE_HEIGHT / 2 };

  it('tocar una capa la selecciona y arrastrarla la mueve', () => {
    render(<Harness initial={[rect]} />);
    fireEvent.pointerDown(stage(), { ...center, pointerId: 1 });
    expect(screen.getByLabelText('Relleno')).toBeInTheDocument();

    fireEvent.pointerMove(stage(), { clientX: center.clientX + STAGE_WIDTH * 0.1, clientY: center.clientY, pointerId: 1 });
    fireEvent.pointerUp(stage(), { pointerId: 1 });
    expect(latest[0].x).toBeCloseTo(0.6, 3);
    expect(latest[0].y).toBeCloseTo(0.5, 3);
  });

  it('tocar una zona vacía deselecciona', () => {
    render(<Harness initial={[rect]} />);
    fireEvent.pointerDown(stage(), { ...center, pointerId: 1 });
    fireEvent.pointerUp(stage(), { pointerId: 1 });
    expect(screen.getByLabelText('Relleno')).toBeInTheDocument();

    fireEvent.pointerDown(stage(), { clientX: 2, clientY: 2, pointerId: 1 });
    fireEvent.pointerUp(stage(), { pointerId: 1 });
    expect(screen.queryByLabelText('Relleno')).not.toBeInTheDocument();
  });

  it('el asa de escala agranda la capa en proporción a la distancia al centro', async () => {
    render(<Harness initial={[rect]} />);
    fireEvent.pointerDown(stage(), { ...center, pointerId: 1 });
    fireEvent.pointerUp(stage(), { pointerId: 1 });

    const handle = await screen.findByTestId('handle-scale');
    const startX = center.clientX + 40;
    fireEvent.pointerDown(handle, { clientX: startX, clientY: center.clientY, pointerId: 2 });
    fireEvent.pointerMove(stage(), { clientX: center.clientX + 80, clientY: center.clientY, pointerId: 2 });
    fireEvent.pointerUp(stage(), { pointerId: 2 });

    expect(latest[0]).toMatchObject({ w: 0.8, h: 0.4 });
  });

  it('el asa de rotación gira la capa hacia el puntero', async () => {
    render(<Harness initial={[rect]} />);
    fireEvent.pointerDown(stage(), { ...center, pointerId: 1 });
    fireEvent.pointerUp(stage(), { pointerId: 1 });

    const handle = await screen.findByTestId('handle-rotate');
    fireEvent.pointerDown(handle, { clientX: center.clientX, clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(stage(), { clientX: center.clientX + 100, clientY: center.clientY, pointerId: 2 });
    fireEvent.pointerUp(stage(), { pointerId: 2 });

    expect(latest[0].rotation).toBe(90);
  });

  it('las flechas mueven la capa seleccionada y Suprimir la borra', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness initial={[rect]} />);
    fireEvent.pointerDown(stage(), { ...center, pointerId: 1 });
    fireEvent.pointerUp(stage(), { pointerId: 1 });

    stage().focus();
    await user.keyboard('{ArrowRight}');
    expect(latest[0].x).toBeCloseTo(0.51, 3);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(latest[0].y).toBeCloseTo(0.55, 3);

    await user.keyboard('{Delete}');
    expect(latest).toEqual([]);
  });
});

describe('LayerEditor: imágenes', () => {
  const file = new File(['x'], 'overlay.png', { type: 'image/png' });

  it('sin función de subida no ofrece agregar imágenes', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Elegir imagen')).not.toBeInTheDocument();
  });

  it('sube la imagen y agrega una capa con la ruta que devuelve', async () => {
    const user = userEvent.setup();
    const uploadImage = vi.fn().mockResolvedValue(`${EVENT}/frames/abc.webp`);
    render(<Harness uploadImage={uploadImage} />);

    await user.upload(screen.getByLabelText('Elegir imagen'), file);

    await waitFor(() => expect(latest).toHaveLength(1));
    expect(uploadImage).toHaveBeenCalledWith(file);
    expect(latest[0]).toMatchObject({ type: 'image', src: `${EVENT}/frames/abc.webp` });
    expect(validateLayers(latest)).toEqual({ ok: true });
  });

  it('una imagen a pantalla completa se puede alternar y no se arrastra', async () => {
    const user = userEvent.setup();
    const src = `${EVENT}/frames/abc.webp`;
    render(<Harness initial={[{ type: 'image', src, x: 0.5, y: 0.5, w: 0.5, h: 0.5 }]} />);
    await user.click(within(screen.getAllByRole('listitem')[0]).getAllByRole('button')[0]);

    await user.click(screen.getByLabelText('Cubrir toda la foto'));
    expect(latest[0]).toMatchObject({ full: true });

    fireEvent.pointerDown(stage(), { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stage(), { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(stage(), { pointerId: 1 });
    expect(latest[0]).toMatchObject({ full: true, x: 0.5 });
    expect(screen.queryByTestId('handle-scale')).not.toBeInTheDocument();
  });

  it('si la subida falla lo avisa y no agrega nada', async () => {
    const user = userEvent.setup();
    const uploadImage = vi.fn().mockRejectedValue(new Error('La imagen es muy pesada.'));
    render(<Harness uploadImage={uploadImage} />);

    await user.upload(screen.getByLabelText('Elegir imagen'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent('La imagen es muy pesada.');
    expect(latest).toEqual([]);
  });
});
