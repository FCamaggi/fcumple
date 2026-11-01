import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCtx } from '../../test/mockCanvas';
import { installPointerEventPolyfill } from '../../test/pointerEvents';
import { MAX_LAYERS, validateLayers, type FrameLayer } from '../../lib/cameraAssets/layers';
import LayerEditor from './LayerEditor';

installPointerEventPolyfill();

// Konva no corre en jsdom: el doble expone sus callbacks (selección, vista en vivo y confirmación) como botones.
vi.mock('./KonvaCanvasStage', () => ({
  default: (props: {
    layers: { x?: number }[];
    selected: number;
    onSelect: (i: number) => void;
    onPreviewLayer?: (i: number, layer: unknown) => void;
    onChangeLayer: (i: number, layer: unknown) => void;
  }) => (
    <div data-testid="konva-stub" data-selected={props.selected}>
      <button type="button" onClick={() => props.onSelect(0)}>stub-seleccionar</button>
      <button type="button" onClick={() => props.onSelect(-1)}>stub-deseleccionar</button>
      <button type="button" onClick={() => props.onPreviewLayer?.(0, { type: 'text', text: 'EN VIVO', x: 0.3, y: 0.5, font: 'sans', color: '#ffffff' })}>
        stub-vista
      </button>
      <button type="button" onClick={() => props.onPreviewLayer?.(0, null)}>stub-fin-vista</button>
      <button type="button" onClick={() => props.onChangeLayer(0, { ...props.layers[0], x: 0.3 })}>stub-soltar</button>
    </div>
  ),
}));

const EVENT = '123e4567-e89b-42d3-a456-426614174000';

const text: FrameLayer = { type: 'text', text: 'Cumpleaños Martina', x: 0.5, y: 0.5, size: 0.08, w: 1.2, font: 'anton', color: '#ffffff' };
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

    await user.click(within(screen.getAllByRole('listitem')[0]).getByRole('button', { name: /Cumpleaños Martina/ }));
    expect(screen.getByLabelText('Texto')).toHaveValue('Cumpleaños Martina');
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
    await user.type(screen.getByLabelText('Texto'), 'Martina');
    await user.selectOptions(screen.getByLabelText('Tipografía'), 'pacifico');
    fireEvent.change(screen.getByLabelText('Color del texto'), { target: { value: '#ff4fa3' } });

    expect(latest[0]).toMatchObject({ text: 'Martina', font: 'pacifico', color: '#ff4fa3' });
    expect(validateLayers(latest)).toEqual({ ok: true });
  });

  it('texto: ofrece solo el catálogo corto de siete tipografías', async () => {
    await select(0, [text]);
    const options = within(screen.getByLabelText('Tipografía')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      'Afiche (Anton)',
      'Rosa (Pacifico)',
      'Marcador (Permanent Marker)',
      'Máquina vieja (Special Elite)',
      'Grabada (Cinzel)',
      'Caligrafía (Great Vibes)',
      'Editorial (Cormorant)',
    ]);
  });

  it('texto: una capa con una tipografía antigua la conserva y la rotula «(antigua)», sin cambiarla en silencio', async () => {
    await select(0, [{ ...text, font: 'display' } as FrameLayer]);
    const select_ = screen.getByLabelText('Tipografía') as HTMLSelectElement;
    const options = within(select_).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      'Afiche (Anton)',
      'Rosa (Pacifico)',
      'Marcador (Permanent Marker)',
      'Máquina vieja (Special Elite)',
      'Grabada (Cinzel)',
      'Caligrafía (Great Vibes)',
      'Editorial (Cormorant)',
      'Titular (antigua)',
    ]);
    expect(select_.value).toBe('display');
  });

  it('texto: los estilos de texto ya diseñados usan solo tipografías del catálogo', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Texto' }));

    await user.click(screen.getByRole('button', { name: /Subtítulo boleto/ }));
    expect(latest.at(-1)).toMatchObject({ type: 'text', font: 'elite' });
    await user.click(screen.getByRole('button', { name: /Título cursiva/ }));
    expect(latest.at(-1)).toMatchObject({ type: 'text', font: 'pacifico' });
    await user.click(screen.getByRole('button', { name: /Título neón/ }));
    expect(latest.at(-1)).toMatchObject({ type: 'text', font: 'anton' });
    await user.click(screen.getByRole('button', { name: /Sello Burn Book/ }));
    expect(latest.at(-1)).toMatchObject({ type: 'text', font: 'marker' });
    expect(validateLayers(latest)).toEqual({ ok: true });
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
  it('el lienzo interactivo selecciona y deselecciona capas', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[rect]} />);
    expect(await screen.findByTestId('konva-stub')).toHaveAttribute('data-selected', '-1');

    await user.click(screen.getByRole('button', { name: 'stub-seleccionar' }));
    expect(screen.getByLabelText('Relleno')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'stub-deseleccionar' }));
    expect(screen.queryByLabelText('Relleno')).not.toBeInTheDocument();
  });

  it('soltar una capa confirma el cambio una sola vez y se puede deshacer', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[rect]} />);
    await user.click(await screen.findByRole('button', { name: 'stub-soltar' }));

    expect(latest[0].x).toBeCloseTo(0.3, 3);
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(latest[0].x).toBeCloseTo(0.5, 3);
  });

  it('durante el gesto dibuja la capa donde quedaría, sin confirmarla', async () => {
    const user = userEvent.setup();
    const m = createMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(m.ctx);
    render(<Harness initial={[text]} />);

    await user.click(await screen.findByRole('button', { name: 'stub-vista' }));
    expect(m.texts()).toContain('EN VIVO');
    expect(latest[0]).toMatchObject({ text: 'Cumpleaños Martina' }); // nada confirmado todavía

    m.calls.length = 0;
    await user.click(screen.getByRole('button', { name: 'stub-fin-vista' }));
    expect(m.texts()).toContain('Cumpleaños Martina');
    expect(m.texts()).not.toContain('EN VIVO');
  });

  it('ya no hay asas DOM: el escalado y el giro los hace el Transformer', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[rect]} />);
    await user.click(await screen.findByRole('button', { name: 'stub-seleccionar' }));
    expect(screen.queryByTestId('handle-scale')).not.toBeInTheDocument();
    expect(screen.queryByTestId('handle-rotate')).not.toBeInTheDocument();
  });

  it('las flechas mueven la capa seleccionada y Suprimir la borra', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness initial={[rect]} />);
    await user.click(await screen.findByRole('button', { name: 'stub-seleccionar' }));

    stage().focus();
    await user.keyboard('{ArrowRight}');
    expect(latest[0].x).toBeCloseTo(0.51, 3);
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(latest[0].y).toBeCloseTo(0.55, 3);

    await user.keyboard('{Delete}');
    expect(latest).toEqual([]);
  });

  it('Ctrl+D duplica y Ctrl+Z deshace', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[rect]} />);
    await user.click(await screen.findByRole('button', { name: 'stub-seleccionar' }));

    stage().focus();
    await user.keyboard('{Control>}d{/Control}');
    expect(latest).toHaveLength(2);
    await user.keyboard('{Control>}z{/Control}');
    expect(latest).toHaveLength(1);
  });

  it('en jsdom el lienzo mide 270×360 (sin ResizeObserver) y lo cambia la proporción', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(stage()).toHaveStyle({ width: '270px', height: '360px' });
    await user.click(screen.getByRole('button', { name: 'Proporción 9:16' }));
    expect(stage()).toHaveStyle({ width: '270px', height: '480px' });
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

  it('una imagen puede alternarse a pantalla completa', async () => {
    const user = userEvent.setup();
    const src = `${EVENT}/frames/abc.webp`;
    render(<Harness initial={[{ type: 'image', src, x: 0.5, y: 0.5, w: 0.5, h: 0.5 }]} />);
    await user.click(within(screen.getAllByRole('listitem')[0]).getAllByRole('button')[0]);

    await user.click(screen.getByLabelText('Cubrir toda la foto'));
    expect(latest[0]).toMatchObject({ full: true });

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

describe('LayerEditor: Estudio Fase 1.5 (packs, paleta, proporción, undo/redo, bloqueo)', () => {
  it('no ofrece presets: la biblioteca arranca en Elementos con Texto y Subidas', async () => {
    render(<Harness />);

    expect(screen.queryByRole('tab', { name: 'Presets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aplicar preset/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Elementos', 'Texto', 'Subidas']);
    expect(screen.getByRole('tab', { name: 'Elementos' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Buscar elementos')).toBeInTheDocument();
  });

  it('la paleta de 3 roles recolorea en bloque lo ya insertado', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: /Insertar Murciélago neón/i }));
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ type: 'asset', asset: 'pack:halloween-neon/murcielago' });

    // Cambiar a la paleta Ácido Lima actualiza los colores de acento/fondo/texto en bloque
    const paletteBtn = screen.getByRole('button', { name: /Paleta Ácido Lima/i });
    await user.click(paletteBtn);
    expect(validateLayers(latest)).toEqual({ ok: true });
    expect(
      latest.some(
        (l) =>
          (l.type === 'asset' && l.tint === '#c8f23a') ||
          (l.type === 'shape' && (l.stroke === '#c8f23a' || l.fill === '#c8f23a')),
      ),
    ).toBe(true);
  });

  it('filtra e inserta elementos vectoriales (asset) y permite cambiar su tinte', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('tab', { name: 'Elementos' }));
    const searchInput = await screen.findByLabelText('Buscar elementos');
    await user.type(searchInput, 'murciélago');

    const assetBtn = await screen.findByRole('button', { name: /Insertar Murciélago neón/i });
    await user.click(assetBtn);

    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({
      type: 'asset',
      asset: 'pack:halloween-neon/murcielago',
    });

    fireEvent.change(screen.getByLabelText('Color del recurso'), { target: { value: '#00ff88' } });
    expect(latest[0]).toMatchObject({
      type: 'asset',
      tint: '#00ff88',
    });
    expect(validateLayers(latest)).toEqual({ ok: true });
  });

  it('alterna la proporción en vivo (3:4, 4:3, 9:16, 1:1) y soporta Undo/Redo y bloqueo de capa', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(layerButton('Agregar texto'));
    expect(latest).toHaveLength(1);

    // Deshacer / Rehacer
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(latest).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Rehacer' }));
    expect(latest).toHaveLength(1);

    // Conmutador de proporción
    const ratio43 = screen.getByRole('button', { name: 'Proporción 4:3' });
    await user.click(ratio43);
    expect(ratio43).toHaveAttribute('aria-pressed', 'true');

    // Bloquear capa desde las propiedades
    const lockCheckbox = screen.getByLabelText('Bloquear capa');
    await user.click(lockCheckbox);
    expect(latest[0].locked).toBe(true);
  });
});

