import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCtx } from '../../test/mockCanvas';
import { maxCaptureScale } from '../../lib/cameraAssets/capture';
import type { FrameParams } from '../../lib/cameraAssets/frames';
import FrameEditor from './FrameEditor';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCtx().ctx);
});

const rect = { type: 'shape', shape: 'rect', x: 0.5, y: 0.5, w: 0.5, h: 0.2, fill: '#111111' } as const;
const text = { type: 'text', text: 'Cumpleaños Martina', x: 0.5, y: 0.9, size: 0.08, font: 'display', color: '#ff4fa3' } as const;

function setup(params: FrameParams) {
  const onSave = vi.fn();
  render(<FrameEditor template="capas" initialLabel="Mi marco" initialParams={params} onSave={onSave} onCancel={vi.fn()} />);
  const save = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    return onSave.mock.calls[0][1] as FrameParams;
  };
  return { onSave, save };
}

const ratioButton = (ratio: string) => screen.getByRole('button', { name: new RegExp(`^Proporción ${ratio}`) });

describe('FrameEditor: un diseño por proporción', () => {
  it('ofrece las cuatro proporciones, con 3:4 elegida por defecto', () => {
    setup({ layers: [rect] });
    for (const ratio of ['3:4', '4:3', '1:1', '9:16']) expect(ratioButton(ratio)).toBeInTheDocument();
    expect(ratioButton('3:4')).toHaveAttribute('aria-pressed', 'true');
    expect(ratioButton('1:1')).toHaveAttribute('aria-pressed', 'false');
  });

  it('el Estudio muestra una sola barra de proporción (la del marco, no la del lienzo)', () => {
    setup({ layers: [rect] });
    expect(screen.getAllByRole('button', { name: /^Proporción 3:4/ })).toHaveLength(1);
  });

  it('empieza en la primera proporción con diseño si 3:4 no tiene', () => {
    setup({ variants: { '1:1': { layers: [rect] } } });
    expect(ratioButton('1:1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Lienzo del marco')).toBeInTheDocument();
  });

  it('marca en el nombre del botón las proporciones sin diseño', () => {
    setup({ variants: { '3:4': { layers: [rect] } } });
    expect(ratioButton('3:4')).toHaveAccessibleName('Proporción 3:4');
    expect(ratioButton('4:3')).toHaveAccessibleName('Proporción 4:3, sin diseño');
  });

  it('un marco de antes (solo layers) se edita en cualquier proporción y se reparte en las cuatro al guardar', async () => {
    const { save } = setup({ layers: [rect] });
    await userEvent.click(ratioButton('1:1'));
    expect(screen.getByLabelText('Lienzo del marco')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar texto' }));

    const params = await save();
    expect(Object.keys(params.variants ?? {}).sort()).toEqual(['1:1', '3:4', '4:3', '9:16']);
    expect(params.variants?.['1:1']?.layers).toHaveLength(2);
    for (const ratio of ['3:4', '4:3', '9:16'] as const) expect(params.variants?.[ratio]?.layers).toEqual([rect]);
    expect(params.layers).toEqual([rect]); // espejo de 3:4
  });

  it('editar una proporción no cambia las demás', async () => {
    const { save } = setup({ layers: [rect], variants: { '3:4': { layers: [rect] }, '4:3': { layers: [text] } } });
    await userEvent.click(ratioButton('4:3'));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar texto' }));

    const params = await save();
    expect(params.variants?.['3:4']?.layers).toEqual([rect]);
    expect(params.variants?.['4:3']?.layers).toHaveLength(2);
    expect(params.layers).toEqual([rect]);
  });

  it('editar 3:4 actualiza también el espejo layers', async () => {
    const { save } = setup({ layers: [rect], variants: { '3:4': { layers: [rect] } } });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar texto' }));
    const params = await save();
    expect(params.variants?.['3:4']?.layers).toHaveLength(2);
    expect(params.layers).toHaveLength(2);
  });
});

describe('FrameEditor: subida de imagen que termina tras cambiar de proporción', () => {
  it('no escribe la imagen en la proporción que ya se abandonó', async () => {
    let finish: (path: string) => void = () => undefined;
    const uploadImage = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    const onSave = vi.fn();
    render(
      <FrameEditor
        template="capas"
        initialLabel="Mi marco"
        initialParams={{ layers: [rect] }}
        onSave={onSave}
        onCancel={vi.fn()}
        uploadImage={uploadImage}
        resolveImageUrl={async (p) => `https://cdn/${p}`}
      />,
    );
    await userEvent.upload(screen.getByLabelText('Elegir imagen'), new File(['x'], 'a.png', { type: 'image/png' }));
    expect(uploadImage).toHaveBeenCalledTimes(1);

    await userEvent.click(ratioButton('1:1'));
    await act(async () => finish('123e4567-e89b-42d3-a456-426614174000/frames/abc.webp'));

    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    const params = onSave.mock.calls[0][1] as FrameParams;
    expect(params.variants).toBeUndefined();
    expect(params.layers).toEqual([rect]);
  });
});

describe('FrameEditor: proporción sin diseño', () => {
  const only34: FrameParams = { layers: [rect], variants: { '3:4': { layers: [rect, text] } } };

  it('avisa «Sin diseño para 4:3» y no muestra el lienzo', async () => {
    setup(only34);
    await userEvent.click(ratioButton('4:3'));
    expect(screen.getByText('Sin diseño para 4:3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Lienzo del marco')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Empezar vacía' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar desde 3:4' })).toBeInTheDocument();
  });

  it('«Empezar vacía» crea una variante sin capas y abre el lienzo', async () => {
    const { save } = setup(only34);
    await userEvent.click(ratioButton('4:3'));
    await userEvent.click(screen.getByRole('button', { name: 'Empezar vacía' }));
    expect(screen.getByLabelText('Lienzo del marco')).toBeInTheDocument();
    expect(ratioButton('4:3')).toHaveAccessibleName('Proporción 4:3');

    const params = await save();
    expect(params.variants?.['4:3']).toEqual({ layers: [] });
    expect(params.variants?.['3:4']?.layers).toEqual([rect, text]);
  });

  it('«Copiar desde 3:4» copia las capas una vez, sin quedar enlazadas', async () => {
    const { save } = setup(only34);
    await userEvent.click(ratioButton('4:3'));
    await userEvent.click(screen.getByRole('button', { name: 'Copiar desde 3:4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar texto' }));

    const params = await save();
    expect(params.variants?.['4:3']?.layers).toHaveLength(3);
    expect(params.variants?.['3:4']?.layers).toEqual([rect, text]);
  });

  it('si no existe 3:4 la copia sale de la primera proporción con diseño', async () => {
    setup({ variants: { '1:1': { layers: [rect] } } });
    await userEvent.click(ratioButton('9:16'));
    expect(screen.getByRole('button', { name: 'Copiar desde 1:1' })).toBeInTheDocument();
  });

  it('un marco sin ningún diseño solo ofrece empezar vacía', () => {
    setup({});
    expect(screen.getByText('Sin diseño para 3:4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Empezar vacía' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Copiar desde/ })).not.toBeInTheDocument();
  });

  it('una proporción sin diseño que no se toca queda sin variante al guardar', async () => {
    const { save } = setup(only34);
    await userEvent.click(ratioButton('9:16'));
    const params = await save();
    expect(params.variants?.['9:16']).toBeUndefined();
  });
});

describe('FrameEditor: escala de la foto en marcos con ventana (capture)', () => {
  const src = '123e4567-e89b-42d3-a456-426614174000/frames/marco.webp';
  const win34 = { x: 0.2, y: 0.25, w: 0.6, h: 0.5, scale: 1.1 };
  const win43 = { x: 0.1, y: 0.2, w: 0.8, h: 0.6, scale: 1.1 };
  const frameWithCapture: FrameParams = {
    layers: [{ type: 'image', src, full: true, capture: win34 }],
    variants: {
      '3:4': { layers: [{ type: 'image', src, full: true, capture: win34 }] },
      '4:3': { layers: [{ type: 'image', src, full: true, capture: win43 }] },
      '1:1': { layers: [rect] },
    },
  };

  it('muestra el control «Escala de la foto» solo cuando la variante actual tiene capture', async () => {
    setup(frameWithCapture);
    const slider = screen.getByLabelText('Escala de la foto') as HTMLInputElement;
    expect(slider).toBeInTheDocument();
    expect(Number(slider.max)).toBeCloseTo(maxCaptureScale(win34), 6);
    expect(screen.getByText('1,10×')).toBeInTheDocument();
    expect(screen.getByText(/1,00 = la foto calza justo en la ventana/)).toBeInTheDocument();

    // En 1:1 no hay capture: el control se oculta
    await userEvent.click(ratioButton('1:1'));
    expect(screen.queryByLabelText('Escala de la foto')).not.toBeInTheDocument();
  });

  it('cambiar la escala actualiza solo capture.scale de la variante actual', async () => {
    const { save } = setup(frameWithCapture);
    const slider = screen.getByLabelText('Escala de la foto');
    fireEvent.change(slider, { target: { value: '1.35' } });
    expect(screen.getByText('1,35×')).toBeInTheDocument();

    const params = await save();
    expect(params.variants?.['3:4']?.layers[0]).toMatchObject({
      type: 'image',
      full: true,
      capture: { ...win34, scale: 1.35 },
    });
    expect(params.variants?.['4:3']?.layers[0]).toMatchObject({
      type: 'image',
      full: true,
      capture: win43,
    });
    expect(params.variants?.['1:1']?.layers).toEqual([rect]);
  });
});
