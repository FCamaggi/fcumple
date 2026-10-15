import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/cameraStudioApi', () => ({ getStickerPreviewUrl: vi.fn() }));

import { getStickerPreviewUrl, type EventSticker } from '../../lib/cameraStudioApi';
import { isSingleEmoji } from '../../lib/cameraAssets/stickers';
import StickerManager, { EMOJI_PALETTE } from './StickerManager';

const sticker = (over: Partial<EventSticker> = {}): EventSticker => ({
  id: 's1', eventId: 'ev-1', kind: 'emoji', emoji: '🎉', storagePath: null, enabled: true, sortOrder: 0, ...over,
});

function setup(stickers: EventSticker[] = []) {
  const props = {
    stickers,
    onAddEmoji: vi.fn().mockResolvedValue(undefined),
    onAddImage: vi.fn().mockResolvedValue(undefined),
    onToggle: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
  };
  render(<StickerManager {...props} />);
  return props;
}

beforeEach(() => {
  vi.mocked(getStickerPreviewUrl).mockReset().mockResolvedValue('https://x/preview.webp');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('StickerManager', () => {
  it('todos los emojis de la paleta son emojis válidos y no se repiten', () => {
    expect(EMOJI_PALETTE.every((e) => isSingleEmoji(e))).toBe(true);
    expect(new Set(EMOJI_PALETTE).size).toBe(EMOJI_PALETTE.length);
  });

  it('agrega un emoji de la paleta con un toque', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar 🥳' }));
    expect(props.onAddEmoji).toHaveBeenCalledWith('🥳');
  });

  it('deshabilita los emojis de la paleta que el evento ya tiene', () => {
    setup([sticker({ emoji: '🎉' })]);
    expect(screen.getByRole('button', { name: 'Agregar 🎉' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Agregar 🎂' })).toBeEnabled();
  });

  it('acepta cualquier emoji pegado y rechaza texto', async () => {
    const props = setup();
    const input = screen.getByLabelText('Otro emoji');

    await userEvent.type(input, 'hola');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('un solo emoji');
    expect(props.onAddEmoji).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, '🦖');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(props.onAddEmoji).toHaveBeenCalledWith('🦖'));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('sube una imagen elegida y limpia el selector', async () => {
    const props = setup();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Elegir imagen'), { target: { files: [file] } });
    await waitFor(() => expect(props.onAddImage).toHaveBeenCalledWith(file));
  });

  it('muestra el error si la imagen no sirve', async () => {
    const props = setup();
    props.onAddImage.mockRejectedValue(new Error('La imagen es muy pesada.'));
    fireEvent.change(screen.getByLabelText('Elegir imagen'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('muy pesada');
  });

  it('lista los stickers con su estado y cuenta los activos', () => {
    setup([sticker(), sticker({ id: 's2', emoji: '🎂', enabled: false })]);
    expect(screen.getByText('En la cámara (1 activos de 2)')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Activo: 🎉' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Activo: 🎂' })).not.toBeChecked();
  });

  it('activa o apaga un sticker sin borrarlo', async () => {
    const props = setup([sticker()]);
    await userEvent.click(screen.getByRole('switch', { name: 'Activo: 🎉' }));
    expect(props.onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), false);
  });

  it('borra solo tras confirmar', async () => {
    const props = setup([sticker()]);
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar 🎉' }));
    expect(props.onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Borrar 🎉' }));
    await waitFor(() => expect(props.onDelete).toHaveBeenCalled());
  });

  it('las imágenes se muestran con una URL firmada', async () => {
    setup([sticker({ id: 's9', kind: 'image', emoji: null, storagePath: 'ev-1/stickers/a.webp' })]);
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'https://x/preview.webp'));
    expect(getStickerPreviewUrl).toHaveBeenCalledWith('ev-1/stickers/a.webp');
  });

  it('sin stickers invita a agregar algunos', () => {
    setup();
    expect(screen.getByText(/Todavía no hay stickers/)).toBeInTheDocument();
  });
});
