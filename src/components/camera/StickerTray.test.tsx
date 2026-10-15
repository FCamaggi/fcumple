import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StickerTray from './StickerTray';
import type { CameraStickerOption } from './types';

const options: CameraStickerOption[] = [
  { id: 'e1', label: '🎉', asset: { kind: 'emoji', emoji: '🎉' } },
  { id: 'i1', label: 'imagen', asset: { kind: 'image', image: {} as CanvasImageSource }, previewSrc: 'https://x/a.webp' },
];

function setup(over: Partial<React.ComponentProps<typeof StickerTray>> = {}) {
  const props = {
    options,
    count: 0,
    hasSelection: false,
    onAdd: vi.fn(),
    onBigger: vi.fn(),
    onSmaller: vi.fn(),
    onRotate: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
  render(<StickerTray {...props} />);
  return props;
}

describe('StickerTray', () => {
  it('no muestra nada si el evento no tiene stickers', () => {
    const { container } = render(
      <StickerTray options={[]} count={0} hasSelection={false} onAdd={vi.fn()} onBigger={vi.fn()} onSmaller={vi.fn()} onRotate={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lista los stickers (emoji e imagen) y agrega el que se toca', async () => {
    const props = setup();
    expect(screen.getByText('Stickers // 0/5')).toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://x/a.webp');

    await userEvent.click(screen.getByRole('button', { name: 'Agregar sticker 🎉' }));
    expect(props.onAdd).toHaveBeenCalledWith(options[0]);
  });

  it('al llegar al máximo por foto deshabilita la bandeja y avisa', () => {
    setup({ count: 5 });
    expect(screen.getByText('Máximo por foto')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /Agregar sticker/ });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toBeDisabled();
  });

  it('los controles del sticker seleccionado solo aparecen con una selección', async () => {
    const { rerender } = render(
      <StickerTray options={options} count={1} hasSelection={false} onAdd={vi.fn()} onBigger={vi.fn()} onSmaller={vi.fn()} onRotate={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByRole('group', { name: 'Sticker seleccionado' })).not.toBeInTheDocument();

    const handlers = { onBigger: vi.fn(), onSmaller: vi.fn(), onRotate: vi.fn(), onRemove: vi.fn() };
    rerender(<StickerTray options={options} count={1} hasSelection onAdd={vi.fn()} {...handlers} />);

    await userEvent.click(screen.getByRole('button', { name: 'Más grande' }));
    await userEvent.click(screen.getByRole('button', { name: 'Más chico' }));
    await userEvent.click(screen.getByRole('button', { name: 'Girar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(handlers.onBigger).toHaveBeenCalledTimes(1);
    expect(handlers.onSmaller).toHaveBeenCalledTimes(1);
    expect(handlers.onRotate).toHaveBeenCalledTimes(1);
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
  });
});
