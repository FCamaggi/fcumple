import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCtx } from '../../test/mockCanvas';
import { FRAME_TEMPLATES, TEMPLATE_FIELDS, defaultFrameParams } from '../../lib/cameraAssets/frames';
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
  it('muestra solo los controles que usa la plantilla', () => {
    setup('border');
    expect(screen.getByLabelText('Color principal')).toBeInTheDocument();
    expect(screen.getByLabelText('Grosor')).toBeInTheDocument();
    expect(screen.getByLabelText('Redondeo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tipografía')).not.toBeInTheDocument();
  });

  it.each(FRAME_TEMPLATES)('la plantilla %s muestra exactamente los campos que declara', (template) => {
    setup(template);
    const labels: Record<string, string> = {
      primaryColor: 'Color principal',
      secondaryColor: 'Color secundario',
      textColor: 'Color del texto',
      title: 'Título',
      subtitle: 'Subtítulo',
      caption: 'Leyenda',
      font: 'Tipografía',
      thickness: 'Grosor',
      radius: 'Redondeo',
      position: 'Posición',
    };
    for (const [field, label] of Object.entries(labels)) {
      const shown = screen.queryByLabelText(label) !== null;
      expect(shown, `${template}/${field}`).toBe(TEMPLATE_FIELDS[template].includes(field as never));
    }
  });

  it('el banner arranca con el nombre y la fecha del evento y se pueden editar', async () => {
    const { onSave } = setup('banner');
    expect(screen.getByLabelText('Título')).toHaveValue('Cumple de Ana');
    expect(screen.getByLabelText('Subtítulo')).toHaveValue('05/12/2026');

    await userEvent.clear(screen.getByLabelText('Título'));
    await userEvent.type(screen.getByLabelText('Título'), 'Noche de gala');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toBe('Mi marco');
    expect(onSave.mock.calls[0][1]).toMatchObject({ title: 'Noche de gala', subtitle: '05/12/2026', position: 'bottom' });
  });

  it('los colores se cambian con el selector o con los colores sugeridos', async () => {
    const { onSave } = setup('border');
    fireEvent.change(screen.getByLabelText('Color principal'), { target: { value: '#123456' } });
    await userEvent.click(screen.getByRole('button', { name: 'Color principal #3ddc97' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(onSave.mock.calls[0][1].primaryColor).toBe('#3ddc97');
  });

  it('los textos vacíos o solo espacios no se guardan, y se recortan los demás', async () => {
    const { onSave } = setup('polaroid', { primaryColor: '#ffffff', caption: '  Para siempre  ' });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(onSave.mock.calls[0][1].caption).toBe('Para siempre');

    onSave.mockClear();
    await userEvent.clear(screen.getByLabelText('Leyenda'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(onSave.mock.calls[0][1]).not.toHaveProperty('caption');
  });

  it('limita los textos a 60 caracteres', () => {
    setup('banner');
    expect(screen.getByLabelText('Título')).toHaveAttribute('maxLength', '60');
  });

  it('exige un nombre para el marco y no guarda sin él', async () => {
    const { onSave } = setup('border');
    await userEvent.clear(screen.getByLabelText(/Nombre del marco/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(screen.getByRole('alert')).toHaveTextContent('nombre al marco');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('el grosor y el redondeo son deslizadores con rango práctico', () => {
    setup('border');
    expect(screen.getByLabelText('Grosor')).toHaveAttribute('max', '0.3');
    expect(screen.getByLabelText('Redondeo')).toHaveAttribute('max', '0.2');
  });

  it('cambia tipografía y posición', async () => {
    const { onSave } = setup('banner');
    await userEvent.selectOptions(screen.getByLabelText('Tipografía'), 'hand');
    await userEvent.selectOptions(screen.getByLabelText('Posición'), 'top');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(onSave.mock.calls[0][1]).toMatchObject({ font: 'hand', position: 'top' });
  });

  it('cancelar no guarda', async () => {
    const { onSave, onCancel } = setup('border');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('la vista previa usa la misma función de dibujo que la cámara', () => {
    const m = createMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(m.ctx);
    setup('banner');
    expect(screen.getByRole('img', { name: 'Vista previa del marco' })).toBeInTheDocument();
    expect(m.texts()).toContain('Cumple de Ana');
  });
});
