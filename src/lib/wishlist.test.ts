import { describe, expect, it, vi } from 'vitest';
import { fetchLinkPreview, resolveWishlist } from './wishlist';

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
