import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WishlistTab from './WishlistTab';
import type { OrganizerEvent } from '../lib/organizerApi';
import * as wishlistLib from '../lib/wishlist';

const mockEvent: OrganizerEvent = {
  id: 'ev-1',
  slug: 'noche-disfraces',
  name: 'Noche de Disfraces',
  startsAt: null,
  location: null,
  accessMode: 'open',
  cameraUnlock: 'on_event_qr',
  rsvpEnabled: false,
  framesEnabled: true,
  stickersEnabled: true,
  defaultFrameId: null,
  photosRevealedAt: null,
  subtitle: null,
  theme: {},
  activationCode: '1234567890abcdef',
  defaultPhotoQuota: 5,
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
  wishlist: {
    enabled: true,
    title: 'Lista de regalos',
    displayMode: 'chip',
    honorees: [],
    items: [
      {
        id: 'w-1',
        url: 'https://paris.cl/instax',
        title: 'Cámara Instax',
        imageUrl: 'https://paris.cl/img.jpg',
        honoreeIds: [],
      },
    ],
  },
  createdAt: '2026-10-15T00:00:00Z',
};

describe('WishlistTab', () => {
  it('renderiza la lista de regalos existentes y su configuración', () => {
    render(<WishlistTab event={mockEvent} onUpdateEvent={vi.fn()} />);

    expect(screen.getByText('Cámara Instax')).toBeInTheDocument();
    expect(screen.getByLabelText(/Mostrar lista de regalos a los invitados/i)).toBeChecked();
    expect(screen.getByLabelText(/Título de la sección/i)).toHaveValue('Lista de regalos');
  });

  it('permite agregar un nuevo regalo manualmente', async () => {
    const user = userEvent.setup();
    render(<WishlistTab event={mockEvent} onUpdateEvent={vi.fn()} />);

    const urlInput = screen.getByLabelText(/Enlace \/ Link del regalo/i);
    const titleInput = screen.getByLabelText(/Título del regalo/i);
    const priceInput = screen.getByLabelText(/Precio estimado/i);

    await user.type(urlInput, 'https://amazon.com/dp/123');
    await user.type(titleInput, 'Lámpara de lava');
    await user.type(priceInput, '$25.000');

    const addBtn = screen.getByRole('button', { name: /\+ Agregar a la lista/i });
    await user.click(addBtn);

    expect(screen.getByText('Lámpara de lava')).toBeInTheDocument();
    expect(screen.getByText('$25.000')).toBeInTheDocument();
  });

  it('extrae automáticamente la vista previa al tocar Cargar preview', async () => {
    const user = userEvent.setup();
    vi.spyOn(wishlistLib, 'fetchLinkPreview').mockResolvedValueOnce({
      title: 'Audífonos Bluetooth Pro',
      imageUrl: 'https://cdn.com/audifonos.jpg',
      description: 'Cancelación activa de ruido',
    });

    render(<WishlistTab event={mockEvent} onUpdateEvent={vi.fn()} />);

    const urlInput = screen.getByLabelText(/Enlace \/ Link del regalo/i);
    await user.type(urlInput, 'https://sony.cl/audifonos');

    const previewBtn = screen.getByRole('button', { name: /Cargar preview/i });
    await user.click(previewBtn);

    expect(wishlistLib.fetchLinkPreview).toHaveBeenCalledWith('https://sony.cl/audifonos');

    const titleInput = screen.getByLabelText(/Título del regalo/i);
    expect(titleInput).toHaveValue('Audífonos Bluetooth Pro');
    expect(screen.getByDisplayValue('https://cdn.com/audifonos.jpg')).toBeInTheDocument();
  });

  it('elimina un ítem al tocar el botón de eliminar', async () => {
    const user = userEvent.setup();
    render(<WishlistTab event={mockEvent} onUpdateEvent={vi.fn()} />);

    expect(screen.getByText('Cámara Instax')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /Eliminar Cámara Instax/i });
    await user.click(deleteBtn);

    expect(screen.queryByText('Cámara Instax')).not.toBeInTheDocument();
  });

  it('guarda los cambios llamando a onUpdateEvent', async () => {
    const user = userEvent.setup();
    const mockSave = vi.fn().mockResolvedValue(undefined);

    render(<WishlistTab event={mockEvent} onUpdateEvent={mockSave} />);

    const saveBtn = screen.getByRole('button', { name: /Guardar lista de regalos/i });
    await user.click(saveBtn);

    expect(mockSave).toHaveBeenCalledWith({
      wishlist: {
        enabled: true,
        title: 'Lista de regalos',
        displayMode: 'chip',
        honorees: [],
        items: wishlistLib.resolveWishlist(mockEvent.wishlist).items,
      },
    });

    expect(await screen.findByText(/✓ Lista de regalos guardada con éxito/i)).toBeInTheDocument();
  });

  describe('festejados', () => {
    async function addHonoree(user: ReturnType<typeof userEvent.setup>, name: string) {
      await user.type(screen.getByLabelText(/Nombre del festejado/i), name);
      await user.click(screen.getByRole('button', { name: /Agregar festejado/i }));
    }

    async function savedWishlist(user: ReturnType<typeof userEvent.setup>, save: ReturnType<typeof vi.fn>) {
      await user.click(screen.getByRole('button', { name: /Guardar lista de regalos/i }));
      return save.mock.calls[0][0].wishlist as wishlistLib.WishlistConfig;
    }

    it('agrega festejados y asigna un regalo existente a uno de ellos', async () => {
      const user = userEvent.setup();
      const save = vi.fn().mockResolvedValue(undefined);
      render(<WishlistTab event={mockEvent} onUpdateEvent={save} />);

      await addHonoree(user, 'Nacho');
      await addHonoree(user, 'Grazia');
      const toggle = screen.getByRole('button', { name: 'Cámara Instax: para Nacho' });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');

      const saved = await savedWishlist(user, save);
      expect(saved.honorees.map((h) => h.name)).toEqual(['Nacho', 'Grazia']);
      expect(saved.items[0].honoreeIds).toEqual([saved.honorees[0].id]);
    });

    it('un regalo nuevo se puede asignar al agregarlo', async () => {
      const user = userEvent.setup();
      const save = vi.fn().mockResolvedValue(undefined);
      render(<WishlistTab event={mockEvent} onUpdateEvent={save} />);

      await addHonoree(user, 'Cata');
      await user.type(screen.getByLabelText(/Enlace \/ Link del regalo/i), 'https://x.cl/libro');
      await user.type(screen.getByLabelText(/Título del regalo/i), 'Libro');
      await user.click(within(screen.getByRole('group', { name: /¿Para quién es\?/i })).getByLabelText('Cata'));
      await user.click(screen.getByRole('button', { name: /\+ Agregar a la lista/i }));

      const saved = await savedWishlist(user, save);
      expect(saved.items[1]).toMatchObject({ title: 'Libro', honoreeIds: [saved.honorees[0].id] });
    });

    it('no acepta un nombre repetido', async () => {
      const user = userEvent.setup();
      render(<WishlistTab event={mockEvent} onUpdateEvent={vi.fn()} />);
      await addHonoree(user, 'Nacho');
      await addHonoree(user, ' nacho ');
      expect(screen.getByText('Ese festejado ya está en la lista.')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^Quitar a / })).toHaveLength(1);
    });

    it('quitar un festejado lo saca también de sus regalos', async () => {
      const user = userEvent.setup();
      const save = vi.fn().mockResolvedValue(undefined);
      render(<WishlistTab event={mockEvent} onUpdateEvent={save} />);

      await addHonoree(user, 'Nacho');
      await user.click(screen.getByRole('button', { name: 'Cámara Instax: para Nacho' }));
      await user.click(screen.getByRole('button', { name: 'Quitar a Nacho' }));

      const saved = await savedWishlist(user, save);
      expect(saved.honorees).toEqual([]);
      expect(saved.items[0].honoreeIds).toEqual([]);
    });
  });
});
