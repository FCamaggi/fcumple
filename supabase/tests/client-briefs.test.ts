import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asAnon, asUser, connect, createUser, resetAndMigrate } from './helpers';

let db: Client;
let alice: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  alice = await createUser(db, 'alice@example.com');
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query('delete from client_briefs');
});

const answers = { ambiente: { pregunta: '¿Ambiente?', elegidas: ['Club de noche'], nota: '' } };

const submit = (slug: string, respondent: string | null, payload: unknown = answers) =>
  db.query('select public.submit_client_brief($1, $2, $3::jsonb) as id', [slug, respondent, JSON.stringify(payload)]);

describe('submit_client_brief', () => {
  it('anon guarda una respuesta y queda en la tabla', async () => {
    const res = await asAnon(db, () => submit('ejemplo', '  Martina  '));
    expect(res.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await db.query('select slug, respondent, answers from client_briefs');
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].slug).toBe('ejemplo');
    expect(rows.rows[0].respondent).toBe('Martina');
    expect(rows.rows[0].answers.ambiente.elegidas).toEqual(['Club de noche']);
  });

  it('un nombre vacio se guarda como null', async () => {
    await asAnon(db, () => submit('ejemplo', '   '));
    const rows = await db.query('select respondent from client_briefs');
    expect(rows.rows[0].respondent).toBeNull();
  });

  it('un usuario autenticado tambien puede enviar', async () => {
    await asUser(db, alice, () => submit('ejemplo', null));
    const rows = await db.query('select count(*)::int as n from client_briefs');
    expect(rows.rows[0].n).toBe(1);
  });

  it.each(['', 'ab', 'Martina', 'con espacios', '-inicio', 'fin-', 'doble--guion', 'x'.repeat(61)])(
    'rechaza el slug invalido %j',
    async (slug) => {
      await expect(asAnon(db, () => submit(slug, null))).rejects.toMatchObject({ code: '22023' });
    },
  );

  it('rechaza respuestas que no son un objeto', async () => {
    await expect(asAnon(db, () => submit('ejemplo', null, ['a']))).rejects.toMatchObject({ code: '22023' });
    await expect(asAnon(db, () => submit('ejemplo', null, 'texto'))).rejects.toMatchObject({ code: '22023' });
  });

  it('rechaza respuestas demasiado grandes', async () => {
    const big = { a: { pregunta: 'x', elegidas: [], nota: 'y'.repeat(25000) } };
    await expect(asAnon(db, () => submit('ejemplo', null, big))).rejects.toMatchObject({ code: '22023' });
  });

  it('rechaza un nombre de mas de 80 caracteres', async () => {
    await expect(asAnon(db, () => submit('ejemplo', 'n'.repeat(81)))).rejects.toMatchObject({ code: '22023' });
  });

  it('pone un tope de 200 respuestas por formulario', async () => {
    await db.query(
      `insert into client_briefs (slug, answers) select 'ejemplo', '{}'::jsonb from generate_series(1, 200)`,
    );
    await expect(asAnon(db, () => submit('ejemplo', null))).rejects.toMatchObject({ code: '54000' });
    // Otro formulario sigue funcionando.
    await asAnon(db, () => submit('otra-fiesta', null));
  });
});

describe('privacidad de las respuestas', () => {
  it('anon y authenticated no pueden leer ni escribir la tabla directamente', async () => {
    await asAnon(db, () => submit('ejemplo', 'Martina'));

    await expect(asAnon(db, () => db.query('select * from client_briefs'))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asUser(db, alice, () => db.query('select * from client_briefs'))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      asAnon(db, () => db.query(`insert into client_briefs (slug, answers) values ('ejemplo', '{}')`)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('la tabla tiene RLS activada', async () => {
    const res = await db.query(`select relrowsecurity from pg_class where oid = 'public.client_briefs'::regclass`);
    expect(res.rows[0].relrowsecurity).toBe(true);
  });
});
