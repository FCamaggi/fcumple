import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuestHubView, { type GuestHubViewProps } from './GuestHubView';

vi.mock('./AnnouncementFeed', () => ({
  default: ({ posts }: { posts: Array<{ title: string }> }) => (
    <div data-testid="feed">{posts.map((p) => p.title).join(',')}</div>
  ),
}));
vi.mock('./PhotoCarousel', () => ({
  default: ({ photos }: { photos: unknown[] }) => <div data-testid="carousel">{photos.length}</div>,
}));
vi.mock('./RevealedRoll', () => ({
  default: ({ photos }: { photos: unknown[] }) => <div data-testid="roll">{photos.length}</div>,
}));

function props(overrides: Partial<GuestHubViewProps> = {}): GuestHubViewProps {
  return {
    cameraUnlock: 'on_event_qr',
    cameraUnlocked: false,
    cameraReady: true,
    headcount: null,
    quota: null,
    posts: [],
    revealed: [],
    refreshing: false,
    onOpenCamera: vi.fn(),
    onShowQr: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

describe('GuestHubView', () => {
  it('con el QR de la fiesta y la cámara bloqueada explica cómo activarla y no ofrece el código de la puerta', () => {
    render(<GuestHubView {...props()} />);

    expect(screen.getByLabelText('Cámara bloqueada')).toHaveTextContent(/escanea el código QR de la fiesta/i);
    expect(screen.getByRole('button', { name: 'Ya escaneé el código' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar mi código' })).not.toBeInTheDocument();
  });

  it('con la cámara bloqueada por llegada ofrece mostrar el código de la puerta', async () => {
    const onShowQr = vi.fn();
    render(<GuestHubView {...props({ cameraUnlock: 'on_checkin', onShowQr })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar mi código' }));

    expect(onShowQr).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Ya me escanearon' })).toBeInTheDocument();
  });

  it('el botón de revisar avisa al contenedor y se deshabilita mientras revisa', async () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<GuestHubView {...props({ onRefresh })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ya escaneé el código' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(<GuestHubView {...props({ onRefresh, refreshing: true })} />);
    expect(screen.getByRole('button', { name: 'Revisando...' })).toBeDisabled();
  });

  it('con la cámara activa muestra el cupo y abre la cámara', async () => {
    const onOpenCamera = vi.fn();
    render(
      <GuestHubView
        {...props({ cameraUnlocked: true, quota: { quota: 5, used: 2 }, onOpenCamera })}
      />,
    );

    expect(screen.queryByLabelText('Cámara bloqueada')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir cámara' }));
    expect(onOpenCamera).toHaveBeenCalledTimes(1);
  });

  it('con el cupo agotado avisa que se acabó el rollo y no ofrece abrir la cámara', () => {
    render(<GuestHubView {...props({ cameraUnlocked: true, quota: { quota: 5, used: 5 } })} />);

    expect(screen.getByText(/se acabó tu rollo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir cámara' })).not.toBeInTheDocument();
  });

  it('no muestra la sección de cámara hasta que los marcos están listos', () => {
    render(<GuestHubView {...props({ cameraUnlocked: true, cameraReady: false, quota: { quota: 5, used: 0 } })} />);

    expect(screen.queryByLabelText('Cámara')).not.toBeInTheDocument();
  });

  it('muestra el aforo solo cuando hay inscritos', () => {
    const { rerender } = render(<GuestHubView {...props({ headcount: 12 })} />);
    expect(screen.getByText('Aforo // 12 inscritos')).toBeInTheDocument();

    rerender(<GuestHubView {...props({ headcount: 0 })} />);
    expect(screen.queryByText(/aforo/i)).not.toBeInTheDocument();
  });

  it('pasa los avisos y las fotos publicadas a la cartelera', () => {
    render(
      <GuestHubView
        {...props({
          posts: [
            { id: 'p1', title: 'Hola', subtitle: null, body: 'x', coverImagePath: null, publishedAt: null, createdAt: '' },
          ],
          revealed: [{ storagePath: 'a.jpg', displayStoragePath: null, createdAt: '2026-10-30T22:00:00Z' }],
        })}
      />,
    );

    expect(screen.getByTestId('feed')).toHaveTextContent('Hola');
    expect(screen.getByTestId('carousel')).toHaveTextContent('1');
    expect(screen.getByTestId('roll')).toHaveTextContent('1');
  });
});
