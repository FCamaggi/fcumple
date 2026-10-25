import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCtx } from '../../test/mockCanvas';
import { defaultFrameParams } from '../../lib/cameraAssets/frames';
import FrameEditor from './FrameEditor';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCtx().ctx);
});

function setup(template: Parameters<typeof FrameEditor>[0]['template'], params = defaultFrameParams(template, { eventName: 'Cumple de Ana', eventDate: '05/12/2026' })) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(<FrameEditor template={template} initialLabel="Mi marco" initialParams={params} onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

describe('FrameEditor', () => {
  it('exige un nombre para el marco y no guarda sin él', async () => {
    const { onSave } = setup('capas');
    await userEvent.clear(screen.getByLabelText(/Nombre del marco/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(screen.getByRole('alert')).toHaveTextContent('nombre al marco');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('limita el nombre a 60 caracteres', () => {
    setup('capas');
    expect(screen.getByLabelText(/Nombre del marco/)).toHaveAttribute('maxLength', '60');
  });

  it('capas: muestra el editor visual y guarda las capas', async () => {
    const { onSave } = setup('capas');
    expect(screen.getByLabelText('Lienzo del marco')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Vista previa del marco' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Agregar texto' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const params = onSave.mock.calls[0][1];
    expect(params.layers).toHaveLength(2); // el nombre del evento y el texto nuevo
  });

  it('capas: avisa si el marco tiene demasiados datos y no lo guarda', async () => {
    const path = { type: 'shape', shape: 'path', w: 0.3, h: 0.3, d: `M0 0${' L10 10'.repeat(80)}`, fill: '#000000', stroke: '#ffffff', strokeWidth: 0.01 } as const;
    const { onSave } = setup('capas', { layers: Array.from({ length: 30 }, () => path) });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(screen.getByRole('alert')).toHaveTextContent('demasiados datos');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('capas: pasa la subida y la firma de imágenes al editor visual', async () => {
    const uploadImage = vi.fn().mockResolvedValue('123e4567-e89b-42d3-a456-426614174000/frames/abc.webp');
    render(
      <FrameEditor
        template="capas"
        initialLabel="Mi marco"
        initialParams={{ layers: [] }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        uploadImage={uploadImage}
        resolveImageUrl={async (p) => `https://cdn/${p}`}
      />,
    );
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Elegir imagen'), file);
    expect(uploadImage).toHaveBeenCalledWith(file);
  });

  it('cancelar no guarda', async () => {
    const { onSave, onCancel } = setup('capas');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('la vista previa usa la misma función de dibujo que la cámara', () => {
    const m = createMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(m.ctx);
    setup('capas');
    expect(screen.getAllByRole('img', { name: 'Vista previa del marco' })[0]).toBeInTheDocument();
    expect(m.texts()).toContain('Cumple de Ana');
  });
});
