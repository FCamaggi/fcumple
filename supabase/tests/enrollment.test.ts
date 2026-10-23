import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { cleanEnrollmentAnswers, validateEnrollmentConfig } from '../../src/lib/enrollmentConfig';
import { asAnon, asUser, connect, createEvent, createGuest, createUser, resetAndMigrate } from './helpers';

let db: Client;
let owner: string;
let other: string;

beforeAll(async () => {
  db = await connect();
  await resetAndMigrate(db);
  owner = await createUser(db, 'organizadora@example.com');
  other = await createUser(db, 'otra@example.com');
});

afterAll(async () => {
  await db.end();
});

const full = {
  welcome: 'Bienvenida',
  plus_ones: { max: 2 },
  comment: { label: '¿Alergias?', required: false },
  questions: [
    { id: 'q1', label: '¿De qué te disfrazas?', required: true },
    { id: 'q2', label: 'Canción', required: false },
  ],
};

async function newEvent(config: unknown = {}, extra: Parameters<typeof createEvent>[2] = {}) {
  const ev = await createEvent(db, owner, extra);
  await db.query('update events set enrollment_config = $2 where id = $1', [ev.id, JSON.stringify(config)]);
  return ev;
}

const register = (slug: string, name: string, pin: string, answers?: unknown) =>
  asAnon(db, () =>
    answers === undefined
      ? db.query('select * from register_guest($1, $2, $3)', [slug, name, pin])
      : db.query('select * from register_guest($1, $2, $3, $4::jsonb)', [slug, name, pin, JSON.stringify(answers)]),
  );

describe('paridad cliente-base de la configuración', () => {
  const longText = (n: number) => 'a'.repeat(n);
  const q = (id: string, label = 'Pregunta', required = false) => ({ id, label, required });

  /** La misma tabla se prueba contra `validateEnrollmentConfig` (cliente) y contra la base: no se pueden desalinear. */
  const cases: Array<[string, unknown, boolean]> = [
    ['vacía', {}, true],
    ['completa', full, true],
    ['solo bienvenida', { welcome: 'Hola' }, true],
    ['no es objeto', [], false],
    ['clave ajena', { extra: 1 }, false],
    ['bienvenida de 400', { welcome: longText(400) }, true],
    ['bienvenida de 401', { welcome: longText(401) }, false],
    ['bienvenida de emojis (400)', { welcome: '🦇'.repeat(400) }, true],
    ['bienvenida de emojis (401)', { welcome: '🦇'.repeat(401) }, false],
    ['bienvenida en blanco', { welcome: '   ' }, false],
    ['bienvenida numérica', { welcome: 3 }, false],
    ['+1 máximo 1', { plus_ones: { max: 1 } }, true],
    ['+1 máximo 5', { plus_ones: { max: 5 } }, true],
    ['+1 máximo 0', { plus_ones: { max: 0 } }, false],
    ['+1 máximo 6', { plus_ones: { max: 6 } }, false],
    ['+1 máximo decimal', { plus_ones: { max: 1.5 } }, false],
    ['+1 máximo como texto', { plus_ones: { max: '2' } }, false],
    ['+1 con clave ajena', { plus_ones: { max: 2, extra: true } }, false],
    ['+1 sin máximo', { plus_ones: {} }, false],
    ['comentario válido', { comment: { label: 'x', required: true } }, true],
    ['comentario con etiqueta de 120', { comment: { label: longText(120), required: false } }, true],
    ['comentario con etiqueta de 121', { comment: { label: longText(121), required: false } }, false],
    ['comentario sin required', { comment: { label: 'x' } }, false],
    ['comentario con required como texto', { comment: { label: 'x', required: 'si' } }, false],
    ['tres preguntas', { questions: [q('q1'), q('q2'), q('q3')] }, true],
    ['cuatro preguntas', { questions: [q('q1'), q('q2'), q('q3'), q('q1')] }, false],
    ['pregunta repetida', { questions: [q('q1'), q('q1')] }, false],
    ['pregunta con id ajeno', { questions: [q('q4')] }, false],
    ['pregunta con etiqueta de 80', { questions: [q('q1', longText(80))] }, true],
    ['pregunta con etiqueta de 81', { questions: [q('q1', longText(81))] }, false],
    ['pregunta sin etiqueta', { questions: [{ id: 'q1', required: false }] }, false],
    ['preguntas no es lista', { questions: { id: 'q1' } }, false],
    ['bienvenida con solo NBSP', { welcome: '\u00a0\u00a0' }, false],
    ['bienvenida con solo BOM', { welcome: '\ufeff' }, false],
    ['bienvenida con NBSP alrededor', { welcome: '\u00a0Hola\u00a0' }, true],
    ['etiqueta con solo espacio de ancho fijo', { comment: { label: '\u202f', required: false } }, false],
    ['comentario que pide el teléfono', { comment: { label: 'Tu teléfono', required: false } }, false],
    ['pregunta que pide el RUT', { questions: [q('q1', '¿Cuál es tu RUT?')] }, false],
    ['pregunta que pide un correo', { questions: [q('q1', 'Correo electrónico')] }, false],
    ['pregunta que pide una clave', { questions: [q('q1', 'Elige una clave')] }, false],
    ['pregunta con "pin" dentro de otra palabra', { questions: [q('q1', 'Pintura favorita')] }, true],
    ['pregunta normal', { questions: [q('q1', '¿De qué te disfrazas?')] }, true],
  ];

  it.each(cases)('%s', async (_name, config, ok) => {
    expect(validateEnrollmentConfig(config)).toBe(ok);
    const { rows } = await db.query<{ ok: boolean }>('select valid_enrollment_config($1::jsonb) as ok', [
      JSON.stringify(config),
    ]);
    expect(rows[0].ok).toBe(ok);
  });

  it('la columna rechaza una configuración inválida', async () => {
    const ev = await createEvent(db, owner);
    await expect(
      db.query('update events set enrollment_config = $2 where id = $1', [ev.id, JSON.stringify({ extra: 1 })]),
    ).rejects.toThrow(/events_enrollment_config_valid/);
  });
});

describe('paridad cliente-base de las respuestas', () => {
  type Expected = { ok: true; answers: Record<string, unknown> } | { ok: false; error: string };
  const base = {
    plus_ones: { max: 2 },
    comment: { label: 'c', required: false },
    questions: [{ id: 'q1', label: 'p', required: true }],
  };

  const cases: Array<[string, unknown, unknown, Expected]> = [
    ['sin configuración y sin respuestas', {}, null, { ok: true, answers: {} }],
    ['sin configuración y {}', {}, {}, { ok: true, answers: {} }],
    ['comentario sin configurar', {}, { comment: 'hola' }, { ok: false, error: 'comment_disabled' }],
    ['comentario en blanco sin configurar', {}, { comment: '   ' }, { ok: true, answers: {} }],
    ['+1 sin configurar', {}, { plus_ones: ['Ana'] }, { ok: false, error: 'plus_ones_disabled' }],
    ['+1 vacío sin configurar', {}, { plus_ones: [] }, { ok: true, answers: {} }],
    ['pregunta sin configurar', {}, { q1: 'x' }, { ok: false, error: 'question_unknown:q1' }],
    ['no es objeto', base, 'hola', { ok: false, error: 'answers' }],
    ['clave desconocida', base, { q1: 'x', otra: 'y' }, { ok: false, error: 'unknown_key' }],
    ['q4 no existe', base, { q1: 'x', q4: 'y' }, { ok: false, error: 'unknown_key' }],
    ['normaliza y recorta', base, { q1: '  Regina ', comment: ' ' }, { ok: true, answers: { q1: 'Regina' } }],
    ['falta la obligatoria', base, {}, { ok: false, error: 'question_required:q1' }],
    ['obligatoria en blanco', base, { q1: '  ' }, { ok: false, error: 'question_required:q1' }],
    ['comentario obligatorio', { comment: { label: 'c', required: true } }, {}, { ok: false, error: 'comment_required' }],
    [
      'respuestas completas',
      base,
      { q1: 'x', comment: 'vegana', plus_ones: [' Ana Rojas '] },
      { ok: true, answers: { q1: 'x', comment: 'vegana', plus_ones: ['Ana Rojas'] } },
    ],
    ['dos +1', base, { q1: 'x', plus_ones: ['Ana', 'Luis'] }, { ok: true, answers: { q1: 'x', plus_ones: ['Ana', 'Luis'] } }],
    ['demasiados +1', base, { q1: 'x', plus_ones: ['A', 'B', 'C'] }, { ok: false, error: 'plus_ones_too_many' }],
    ['+1 con nombre en blanco', base, { q1: 'x', plus_ones: [' '] }, { ok: false, error: 'plus_one_name' }],
    ['+1 con nombre de 81', base, { q1: 'x', plus_ones: ['a'.repeat(81)] }, { ok: false, error: 'plus_one_name' }],
    ['+1 con nombre que no es texto', base, { q1: 'x', plus_ones: [5] }, { ok: false, error: 'plus_one_name' }],
    ['+1 que no es lista', base, { q1: 'x', plus_ones: 'Ana' }, { ok: false, error: 'plus_ones_invalid' }],
    [
      'comentario de 280',
      base,
      { q1: 'x', comment: 'a'.repeat(280) },
      { ok: true, answers: { q1: 'x', comment: 'a'.repeat(280) } },
    ],
    ['comentario de 281', base, { q1: 'x', comment: 'a'.repeat(281) }, { ok: false, error: 'comment_too_long' }],
    [
      'comentario de emojis (280)',
      base,
      { q1: 'x', comment: '🦇'.repeat(280) },
      { ok: true, answers: { q1: 'x', comment: '🦇'.repeat(280) } },
    ],
    ['comentario de emojis (281)', base, { q1: 'x', comment: '🦇'.repeat(281) }, { ok: false, error: 'comment_too_long' }],
    ['comentario numérico', base, { q1: 'x', comment: 5 }, { ok: false, error: 'comment_invalid' }],
    ['respuesta de 140', base, { q1: 'a'.repeat(140) }, { ok: true, answers: { q1: 'a'.repeat(140) } }],
    ['respuesta de 141', base, { q1: 'a'.repeat(141) }, { ok: false, error: 'question_too_long:q1' }],
    ['respuesta numérica', base, { q1: 7 }, { ok: false, error: 'question_invalid:q1' }],
    ['pregunta que no está configurada', base, { q1: 'x', q2: 'y' }, { ok: false, error: 'question_unknown:q2' }],
    ['pregunta no configurada en blanco', base, { q1: 'x', q2: ' ' }, { ok: true, answers: { q1: 'x' } }],
    ['comentario con solo NBSP cuenta como vacío', base, { q1: 'x', comment: '\u00a0' }, { ok: true, answers: { q1: 'x' } }],
    ['respuesta con solo BOM cuenta como vacía', base, { q1: '\ufeff' }, { ok: false, error: 'question_required:q1' }],
    ['+1 con solo NBSP', base, { q1: 'x', plus_ones: ['\u00a0'] }, { ok: false, error: 'plus_one_name' }],
    ['recorta NBSP alrededor', base, { q1: '\u00a0Regina\u00a0' }, { ok: true, answers: { q1: 'Regina' } }],
  ];

  it.each(cases)('%s', async (_name, config, answers, expected) => {
    expect(cleanEnrollmentAnswers(config, answers)).toEqual(expected);

    const sql = 'select _clean_enrollment_answers($1::jsonb, $2::jsonb) as r';
    const params = [JSON.stringify(config), answers === null ? null : JSON.stringify(answers)];
    if (expected.ok) {
      const { rows } = await db.query<{ r: unknown }>(sql, params);
      expect(rows[0].r).toEqual(expected.answers);
    } else {
      await expect(db.query(sql, params)).rejects.toThrow(`enrollment_invalid:${expected.error}`);
    }
  });
});

describe('register_guest con respuestas', () => {
  it('sigue funcionando con 3 argumentos y no guarda respuestas', async () => {
    const ev = await newEvent({});
    const { rows } = await register(ev.slug, 'Ana Rojas', '1234');
    expect(rows[0].outcome).toBe('ok');
    const g = await db.query('select guest_answers, plus_ones_requested from guests where id = $1', [rows[0].guest_id]);
    expect(g.rows[0]).toEqual({ guest_answers: {}, plus_ones_requested: 0 });
  });

  it('guarda las respuestas y refleja los +1 en plus_ones_allowed y plus_ones_confirmed', async () => {
    const ev = await newEvent(full);
    const { rows } = await register(ev.slug, 'Ana Rojas', '1234', {
      q1: 'Regina George',
      comment: 'Vegana',
      plus_ones: ['Luis Pérez', 'Marta Soto'],
    });
    expect(rows[0].outcome).toBe('ok');
    const g = await db.query('select * from guests where id = $1', [rows[0].guest_id]);
    expect(g.rows[0].guest_answers).toEqual({
      q1: 'Regina George',
      comment: 'Vegana',
      plus_ones: ['Luis Pérez', 'Marta Soto'],
    });
    expect(g.rows[0].plus_ones_requested).toBe(2);
    expect(g.rows[0].plus_ones_allowed).toBe(2);
    expect(g.rows[0].plus_ones_confirmed).toBe(2);
  });

  it('el aforo público cuenta a los inscritos y sus acompañantes (sin RSVP)', async () => {
    const ev = await newEvent(full);
    await register(ev.slug, 'Ana Rojas', '1234', { q1: 'x', plus_ones: ['Luis Pérez'] });
    await register(ev.slug, 'Bea Soto', '1234', { q1: 'y' });
    const { rows } = await asAnon(db, () => db.query('select get_public_headcount($1) as n', [ev.slug]));
    expect(rows[0].n).toBe(3);
  });

  it('con RSVP activado el aforo solo cuenta a los confirmados', async () => {
    const ev = await newEvent(full, { rsvp_enabled: true });
    await register(ev.slug, 'Ana Rojas', '1234', { q1: 'x', plus_ones: ['Luis Pérez'] });
    const antes = await asAnon(db, () => db.query('select get_public_headcount($1) as n', [ev.slug]));
    expect(antes.rows[0].n).toBe(0);
    await db.query(`update guests set status = 'confirmed' where event_id = $1`, [ev.id]);
    const despues = await asAnon(db, () => db.query('select get_public_headcount($1) as n', [ev.slug]));
    expect(despues.rows[0].n).toBe(2);
  });

  it('rechaza lo obligatorio que falta, sin crear al invitado ni gastar intentos', async () => {
    const ev = await newEvent(full);
    await expect(register(ev.slug, 'Ana Rojas', '1234', {})).rejects.toThrow('enrollment_invalid:question_required:q1');
    const count = await db.query('select count(*)::int as n from guests where event_id = $1', [ev.id]);
    expect(count.rows[0].n).toBe(0);
    const attempts = await db.query('select count(*)::int as n from identify_attempts where event_id = $1', [ev.id]);
    expect(attempts.rows[0].n).toBe(0);
  });

  it('rechaza respuestas a lo que el organizador no configuró', async () => {
    const ev = await newEvent({});
    await expect(register(ev.slug, 'Ana Rojas', '1234', { comment: 'hola' })).rejects.toThrow(
      'enrollment_invalid:comment_disabled',
    );
    await expect(register(ev.slug, 'Ana Rojas', '1234', { plus_ones: ['Luis Pérez'] })).rejects.toThrow(
      'enrollment_invalid:plus_ones_disabled',
    );
  });

  it('en modo lista guarda las respuestas del invitado precargado y conserva su cupo de +1', async () => {
    const ev = await newEvent(full, { access_mode: 'list' });
    const pre = await createGuest(db, ev.id, 'Carla Díaz', { plus_ones_allowed: 3 });
    const { rows } = await register(ev.slug, 'Carla Díaz', '4321', { q1: 'Gretchen', plus_ones: ['Luis Pérez'] });
    expect(rows[0].outcome).toBe('ok');
    const g = await db.query('select * from guests where id = $1', [pre.id]);
    expect(g.rows[0].guest_answers).toEqual({ q1: 'Gretchen', plus_ones: ['Luis Pérez'] });
    expect(g.rows[0].plus_ones_allowed).toBe(3);
    expect(g.rows[0].plus_ones_confirmed).toBe(1);
  });

  it('en modo solicitudes guarda las respuestas de la solicitud pendiente', async () => {
    const ev = await newEvent(full, { access_mode: 'list_requests' });
    const { rows } = await register(ev.slug, 'Dana Vega', '1111', { q1: 'Karen' });
    expect(rows[0].outcome).toBe('pending_approval');
    const g = await db.query('select approval_status, guest_answers from guests where id = $1', [rows[0].guest_id]);
    expect(g.rows[0]).toEqual({ approval_status: 'pending', guest_answers: { q1: 'Karen' } });
  });
});

describe('casos que el cliente no produce pero la base debe aguantar', () => {
  it('un máximo de acompañantes escrito como 2.0 funciona (la base lo aceptó, register_guest no debe romperse)', async () => {
    const ev = await createEvent(db, owner);
    await db.query(`update events set enrollment_config = '{"plus_ones":{"max":2.0}}'::jsonb where id = $1`, [ev.id]);
    const { rows } = await register(ev.slug, 'Ana Rojas', '1234', { plus_ones: ['Luis Pérez', 'Marta Soto'] });
    expect(rows[0].outcome).toBe('ok');
  });

  it('el peor caso legítimo (todo al máximo, en emojis) cabe en guest_answers', async () => {
    const config = {
      plus_ones: { max: 5 },
      comment: { label: 'Comentario', required: false },
      questions: [
        { id: 'q1', label: 'Uno', required: false },
        { id: 'q2', label: 'Dos', required: false },
        { id: 'q3', label: 'Tres', required: false },
      ],
    };
    const ev = await newEvent(config);
    const bat = (n: number) => '🦇'.repeat(n);
    const { rows } = await register(ev.slug, 'Ana Rojas', '1234', {
      plus_ones: [bat(80), bat(80), bat(80), bat(80), bat(80)],
      comment: bat(280),
      q1: bat(140),
      q2: bat(140),
      q3: bat(140),
    });
    expect(rows[0].outcome).toBe('ok');
  });

  it('el aforo no cuenta a quien el organizador cargó y nunca se inscribió, ni a quien declinó', async () => {
    const ev = await newEvent({});
    await createGuest(db, ev.id, 'Carga Manual'); // precargado, sin inscribirse
    await register(ev.slug, 'Ana Rojas', '1234'); // inscrita
    const declined = await register(ev.slug, 'Bea Soto', '1234');
    await db.query(`update guests set status = 'declined' where id = $1`, [declined.rows[0].guest_id]);
    const { rows } = await asAnon(db, () => db.query('select get_public_headcount($1) as n', [ev.slug]));
    expect(rows[0].n).toBe(1);
  });
});

describe('cupo de fotos por defecto del evento', () => {
  it('un invitado nuevo recibe default_photo_quota', async () => {
    const ev = await newEvent({});
    await db.query('update events set default_photo_quota = 10 where id = $1', [ev.id]);
    const { rows } = await register(ev.slug, 'Ana Rojas', '1234');
    const g = await db.query('select photo_quota from guests where id = $1', [rows[0].guest_id]);
    expect(g.rows[0].photo_quota).toBe(10);
  });

  it('sin configurar sigue siendo 5', async () => {
    const ev = await newEvent({});
    const { rows } = await register(ev.slug, 'Bea Soto', '1234');
    const g = await db.query('select photo_quota from guests where id = $1', [rows[0].guest_id]);
    expect(g.rows[0].photo_quota).toBe(5);
  });

  it('rechaza valores fuera de rango', async () => {
    const ev = await newEvent({});
    await expect(db.query('update events set default_photo_quota = 101 where id = $1', [ev.id])).rejects.toThrow(
      /default_photo_quota_range/,
    );
  });
});

describe('quién puede configurar', () => {
  it('el dueño guarda la configuración con un update directo y get_event_public la entrega', async () => {
    const ev = await createEvent(db, owner);
    const saved = await asUser(db, owner, () =>
      db.query('update events set enrollment_config = $2, default_photo_quota = 10 where id = $1 returning id', [
        ev.id,
        JSON.stringify(full),
      ]),
    );
    expect(saved.rowCount).toBe(1);

    const pub = await asAnon(db, () => db.query('select * from get_event_public($1)', [ev.slug]));
    expect(pub.rows[0].enrollment_config).toEqual(full);
  });

  it('otro organizador no puede cambiarla', async () => {
    const ev = await createEvent(db, owner);
    const res = await asUser(db, other, () =>
      db.query('update events set enrollment_config = $2 where id = $1', [ev.id, JSON.stringify(full)]),
    );
    expect(res.rowCount).toBe(0);
  });

  it('un invitado (anon) no puede escribir en events ni leer las respuestas de nadie', async () => {
    const ev = await newEvent(full);
    await register(ev.slug, 'Ana Rojas', '1234', { q1: 'x' });
    await expect(
      asAnon(db, () => db.query('update events set enrollment_config = $2 where id = $1', [ev.id, '{}'])),
    ).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => db.query('select guest_answers from guests'))).rejects.toThrow(/permission denied/);
  });

  it('las funciones internas no se pueden llamar desde la API', async () => {
    await expect(
      asAnon(db, () => db.query(`select _clean_enrollment_answers('{}'::jsonb, '{}'::jsonb)`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('guest_answers tiene forma cerrada aunque la escriba el organizador', async () => {
    const ev = await createEvent(db, owner);
    const g = await createGuest(db, ev.id, 'Ana Rojas');
    await expect(
      asUser(db, owner, () =>
        db.query('update guests set guest_answers = $2 where id = $1', [g.id, JSON.stringify({ pin: '1234' })]),
      ),
    ).rejects.toThrow(/guests_answers_valid/);
  });
});
