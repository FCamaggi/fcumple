import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from './supabaseClient';
import { submitClientBrief } from './briefApi';

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const answers = { ambiente: { pregunta: '¿Ambiente?', elegidas: ['Club de noche'], nota: 'algo oscuro' } };

beforeEach(() => {
  rpc.mockReset();
});

describe('submitClientBrief', () => {
  it('llama al RPC con el slug, el nombre y las respuestas y devuelve el id', async () => {
    rpc.mockResolvedValueOnce({ data: 'brief-1', error: null });

    const id = await submitClientBrief('francisca', 'Francisca', answers);

    expect(rpc).toHaveBeenCalledWith('submit_client_brief', {
      p_slug: 'francisca',
      p_respondent: 'Francisca',
      p_answers: answers,
    });
    expect(id).toBe('brief-1');
  });

  it('explica con claridad que se alcanzó el tope de respuestas', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '54000', message: 'too many briefs' } });

    await expect(submitClientBrief('francisca', '', answers)).rejects.toThrow(/máximo de respuestas/);
  });

  it('envuelve cualquier otro error en un mensaje en español', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(submitClientBrief('francisca', '', answers)).rejects.toThrow(
      'No pudimos enviar tus respuestas: boom',
    );
  });
});
