import { describe, expect, it, vi } from 'vitest';
import { fetchLinkPreview, groupWishlistItems, resolveWishlist, serializeWishlist } from './wishlist';

describe('resolveWishlist', () => {
  it('devuelve valores por defecto ante null o valores no válidos', () => {
    const res = resolveWishlist(null);
    expect(res.enabled).toBe(false);
    expect(res.displayMode).toBe('chip');
    expect(res.items).toEqual([]);
  });

  it('normaliza un jsonb válido de la base de datos', () => {
    const raw = {
      enabled: true,
      title: 'Regalos para Martina',
      display_mode: 'card',
      items: [
        {
          id: '1',
          url: 'https://paris.cl/1',
          title: 'Cámara',
          image_url: 'https://paris.cl/img.jpg',
          price: '$50.000',
        },
      ],
    };

    const res = resolveWishlist(raw);
    expect(res.enabled).toBe(true);
    expect(res.title).toBe('Regalos para Martina');
    expect(res.displayMode).toBe('card');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toEqual({
      id: '1',
      url: 'https://paris.cl/1',
      title: 'Cámara',
      imageUrl: 'https://paris.cl/img.jpg',
      price: '$50.000',
      notes: null,
      honoreeIds: [],
    });
  });

  it('descarta items incompletos sin url o título', () => {
    const raw = {
      items: [{ id: '1', url: 'https://paris.cl' }, { id: '2', title: 'Solo título' }],
    };
    const res = resolveWishlist(raw);
    expect(res.items).toEqual([]);
  });
});

describe('festejados de la wishlist', () => {
  const raw = {
    enabled: true,
    display_mode: 'chip',
    honorees: [
      { id: 'h1', name: ' Nacho ' },
      { id: 'h2', name: 'Grazia' },
      { id: 'h3', name: 'Cata' },
    ],
    items: [
      { id: 'a', url: 'https://x.cl/a', title: 'Patineta', honoree_ids: ['h1'] },
      { id: 'b', url: 'https://x.cl/b', title: 'Pinturas', honoree_ids: ['h2', 'h3'] },
      { id: 'c', url: 'https://x.cl/c', title: 'Juego de mesa' },
      { id: 'd', url: 'https://x.cl/d', title: 'Torta', honoree_ids: ['h1', 'h2', 'h3'] },
      { id: 'e', url: 'https://x.cl/e', title: 'Libro', honoree_ids: ['h3', 'zz'] },
    ],
  };

  it('lee los festejados y descarta en cada ítem los ids que no existen', () => {
    const res = resolveWishlist(raw);
    expect(res.honorees).toEqual([
      { id: 'h1', name: 'Nacho' },
      { id: 'h2', name: 'Grazia' },
      { id: 'h3', name: 'Cata' },
    ]);
    expect(res.items.map((i) => i.honoreeIds)).toEqual([['h1'], ['h2', 'h3'], [], ['h1', 'h2', 'h3'], ['h3']]);
  });

  it('sin festejados la lista es una sola, sin títulos por persona', () => {
    const res = resolveWishlist({ ...raw, honorees: undefined });
    expect(res.honorees).toEqual([]);
    expect(groupWishlistItems(res)).toEqual([{ label: null, items: res.items }]);
  });

  it('agrupa por persona, después las combinaciones y al final lo que es para todos', () => {
    const groups = groupWishlistItems(resolveWishlist(raw));
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Para Nacho', ['a']],
      ['Para Cata', ['e']],
      ['Para Grazia y Cata', ['b']],
      ['Para todos', ['c', 'd']],
    ]);
  });
});

describe('serializeWishlist', () => {
  it('escribe las claves que acepta la base (snake_case) y omite lo vacío', () => {
    const config = resolveWishlist({
      enabled: true,
      title: 'Regalos',
      display_mode: 'card',
      honorees: [{ id: 'h1', name: 'Nacho' }],
      items: [
        { id: 'a', url: 'https://x.cl/a', title: 'Patineta', image_url: 'https://x.cl/a.jpg', honoree_ids: ['h1'] },
        { id: 'b', url: 'https://x.cl/b', title: 'Pinturas', price: '$5.000', notes: 'Acuarela' },
      ],
    });
    expect(serializeWishlist(config)).toEqual({
      enabled: true,
      title: 'Regalos',
      display_mode: 'card',
      honorees: [{ id: 'h1', name: 'Nacho' }],
      items: [
        { id: 'a', url: 'https://x.cl/a', title: 'Patineta', image_url: 'https://x.cl/a.jpg', honoree_ids: ['h1'] },
        { id: 'b', url: 'https://x.cl/b', title: 'Pinturas', price: '$5.000', notes: 'Acuarela' },
      ],
    });
  });

  it('sin festejados no escribe la clave honorees', () => {
    const out = serializeWishlist(resolveWishlist({ enabled: false, items: [] }));
    expect(out).toEqual({ enabled: false, title: 'Lista de regalos', display_mode: 'chip', items: [] });
  });
});

describe('fetchLinkPreview', () => {
  it('llama al endpoint /api/link-preview y parsea el resultado', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Cámara Instantánea',
        imageUrl: 'https://cdn.com/preview.jpg',
        description: 'Genial para fotos',
      }),
    });

    const result = await fetchLinkPreview('https://tienda.cl/producto', mockFetch as unknown as typeof fetch);
    expect(mockFetch).toHaveBeenCalledWith('/api/link-preview?url=https%3A%2F%2Ftienda.cl%2Fproducto');
    expect(result.title).toBe('Cámara Instantánea');
    expect(result.imageUrl).toBe('https://cdn.com/preview.jpg');
  });

  it('si falla la llamada cae a fallback con el hostname', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchLinkPreview('https://tienda.cl/producto', mockFetch as unknown as typeof fetch);
    expect(result.title).toBe('tienda.cl');
    expect(result.imageUrl).toBeNull();
  });
});
