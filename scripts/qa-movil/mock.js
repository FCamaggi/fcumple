async page => {
  // Supabase simulado para la revisión móvil. Nada sale a producción: todo lo que va a 127.0.0.1:54321 se responde aquí.
  const ctx = page.context();
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const H = 3600e3;

  const palette = [['#ff4fa3', '#1b0f2e'], ['#4fc3ff', '#10243a'], ['#ffd24f', '#3a2a10'], ['#7dff9a', '#0f2e1c'], ['#c084fc', '#24103a'], ['#ff8a4f', '#3a1a10']];
  const svg = (seed, w = 900, h = 1200) => {
    const [a, b] = palette[Math.abs(seed) % palette.length];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w / 2}" cy="${h * 0.38}" r="${w * 0.14}" fill="#f3d2b8"/><rect x="${w * 0.3}" y="${h * 0.52}" width="${w * 0.4}" height="${h * 0.4}" rx="${w * 0.12}" fill="#f3d2b8" opacity=".9"/><text x="50%" y="${h * 0.97}" fill="#fff" font-family="sans-serif" font-size="${w * 0.04}" text-anchor="middle">foto de ejemplo ${seed}</text></svg>`;
  };
  const hash = (s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7);

  const EVENT_ID = '11111111-1111-4111-8111-111111111111';
  const eventRow = {
    id: EVENT_ID, slug: 'demo', name: 'NOCHE DE DISFRACES', subtitle: 'Cumpleaños Martina',
    starts_at: '2026-10-30T22:00:00-03:00', location: 'Av. Providencia 1234, Santiago', rsvp_deadline: null,
    access_mode: 'open', camera_unlock: 'on_event_qr', rsvp_enabled: false, photos_revealed: true,
    enrollment_config: {
      welcome: 'Inscríbete para entrar a la fiesta. El día del evento escanea el QR del lugar para activar tu cámara.',
      plus_ones: { max: 2 }, comment: { label: '¿Alguna alergia o algo que debamos saber?', required: false },
      questions: [{ id: 'q1', label: '¿Con qué disfraz vienes?', required: true }],
    },
    theme: { preset: 'rosa-chicle' },
    frames_enabled: true, stickers_enabled: true, default_frame_id: 'f1', photos_revealed_at: iso(2 * H),
    default_photo_quota: 5, activation_code: 'AAAABBBBCCCC', created_at: iso(5 * 24 * H),
  };

  const names = ['Camila Rojas', 'Matías González', 'Valentina Soto', 'Benjamín Muñoz', 'Javiera Contreras', 'Sebastián Díaz', 'Antonia Silva', 'Nicolás Pérez', 'Fernanda López', 'Tomás Araya', 'María José Fuentes', 'Diego Hernández'];
  const guests = names.map((n, i) => ({
    id: `g${i + 1}`, event_id: EVENT_ID, full_name: n, token: `tok-${i + 1}`,
    approval_status: i === 3 ? 'pending' : i === 9 ? 'rejected' : 'approved',
    status: 'confirmed', plus_ones_allowed: i % 4 === 0 ? 1 : 0, plus_ones_confirmed: 0, photo_quota: 5,
    guest_answers: i % 3 === 0 ? { comment: 'Soy celíaca, ¿habrá algo sin gluten?', q1: 'Bruja', plus_ones: ['Pía Morales'] } : { q1: 'Vampiro' },
    plus_ones_requested: i % 4 === 0 ? 1 : 0,
    checked_in_at: i % 2 ? iso(H) : null, claimed_at: iso(24 * H), last_seen_at: iso(i * H), camera_activated_at: i % 3 ? iso(H) : null,
  }));
  const photos = Array.from({ length: 24 }, (_, i) => ({
    id: `p${i + 1}`, event_id: EVENT_ID, guest_id: `g${(i % 12) + 1}`,
    storage_path: `${EVENT_ID}/g${(i % 12) + 1}/photo-${i + 1}.jpg`, display_storage_path: `${EVENT_ID}/g${(i % 12) + 1}/photo-${i + 1}-d.jpg`,
    status: i < 4 ? 'pending' : i < 8 ? 'rejected' : 'approved', created_at: iso((i + 1) * 0.4 * H),
    published_at: i >= 8 && i < 18 ? iso(H) : null,
    guests: { full_name: names[i % 12] },
  }));
  const posts = [
    { id: 'po1', title: 'Cómo llegar y dónde estacionar', subtitle: 'Lee esto antes de salir de tu casa', body: 'La puerta está por el pasaje lateral, no por la entrada principal. Hay estacionamiento en la calle de atrás desde las 21:00.\n\nEl QR para activar tu cámara está pegado en la barra. Escanéalo con la cámara normal del teléfono.', cover_image_path: 'posts/cover-1.jpg', published_at: iso(3 * H), created_at: iso(4 * H), images: ['posts/g1.jpg', 'posts/g2.jpg', 'posts/g3.jpg', 'posts/g4.jpg'] },
    { id: 'po2', title: 'Concurso de disfraces', subtitle: null, body: 'A las 00:30 elegimos al mejor disfraz. Hay premio.', cover_image_path: null, published_at: iso(6 * H), created_at: iso(7 * H), images: [] },
    { id: 'po3', title: 'Un título de aviso bastante largo para ver cómo se parte en dos o tres líneas en un teléfono chico', subtitle: 'Y un subtítulo también largo para probar el desborde del texto', body: 'Texto largo. '.repeat(60), cover_image_path: 'posts/cover-3.jpg', published_at: iso(9 * H), created_at: iso(10 * H), images: [] },
  ];
  const textLayer = (text, y) => ({ type: 'text', text, x: 0.5, y, size: 0.08, w: 1.6, font: 'display', color: '#ffffff', weight: 'bold' });
  const frames = [
    { id: 'f1', event_id: EVENT_ID, template: 'capas', label: 'Título', params: { layers: [textLayer('NOCHE DE DISFRACES', 0.92)] }, enabled: true, sort_order: 0, is_default: true, asset_type: 'frame' },
    { id: 'f2', event_id: EVENT_ID, template: 'capas', label: 'Fecha', params: { layers: [textLayer('30/10/2026', 0.08)] }, enabled: true, sort_order: 1, is_default: false, asset_type: 'frame' },
  ];
  const stickers = ['🎃', '👻', '🦇', '💖', '🕷️', '🧛'].map((e, i) => ({ id: `s${i}`, event_id: EVENT_ID, kind: 'emoji', emoji: e, storage_path: null, enabled: true, sort_order: i, asset_type: 'sticker' }));

  // Estado mutable de la sesión del invitado: el token manda ('t-locked' | 't-active' | 't-full'; prefijo 'tv-' = evento vacío).
  const activated = new Set(['t-active', 't-full', 'tv-active']);
  const used = { 't-full': 5, 'tv-full': 5 };
  const json = (route, body, status = 200, headers = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });

  const rpc = async (name, a) => {
    const empty = typeof a.p_token === 'string' && a.p_token.startsWith('tv-') || a.p_slug === 'demo-vacio';
    switch (name) {
      case 'get_event_public': return a.p_slug === 'nada' ? [] : [{ ...eventRow, name: eventRow.name, photos_revealed: !empty }];
      case 'register_guest': return [{ outcome: 'ok', guest_token: 't-locked', guest_id: 'gx', guest_name: a.p_name }];
      case 'login_guest': return [{ outcome: 'ok', guest_token: 't-locked', guest_id: 'gx', guest_name: a.p_name }];
      case 'get_guest_by_token': return [{ id: 'gx', event_id: EVENT_ID, full_name: 'Camila Rojas', checked_in_at: null, photo_quota: 5, camera_activated_at: activated.has(a.p_token) ? iso(H) : null }];
      case 'activate_camera': activated.add(a.p_token); return true;
      case 'get_photo_quota': return [{ quota: 5, used: used[a.p_token] ?? 1 }];
      case 'list_event_camera_assets': return [...frames, ...stickers];
      case 'list_published_posts': return empty ? [] : posts.map(({ created_at, ...p }) => p);
      case 'list_revealed_photos': return empty ? [] : photos.filter((p) => p.published_at).map((p) => ({ storage_path: p.storage_path, display_storage_path: p.display_storage_path, created_at: p.created_at }));
      case 'get_public_headcount': return 42;
      case 'publish_photo_batch': return 6;
      case 'rotate_activation_code': return 'ZZZZYYYYXXXX';
      case 'submit_photo': return [{ id: 'new', guest_id: 'gx', storage_path: 'x', display_storage_path: null, status: 'pending', created_at: iso(0) }];
      case 'regenerate_guest_token': return [guests[0]];
      default: return null;
    }
  };

  const tables = { events: [eventRow], guests, photos, posts, post_images: posts.flatMap((p) => p.images.map((s, i) => ({ id: `${p.id}-i${i}`, post_id: p.id, storage_path: s, position: i }))), event_frames: frames, event_stickers: stickers, event_config: [], organizers: [{ id: 'org1' }] };

  await ctx.route(/127\.0\.0\.1:54321/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    if (p.startsWith('/rest/v1/rpc/')) {
      let args = {};
      try { args = req.postDataJSON() ?? {}; } catch { /* sin cuerpo */ }
      return json(route, await rpc(p.split('/').pop(), args));
    }
    if (p.startsWith('/rest/v1/')) {
      const t = p.split('/').pop();
      const rows = tables[t] ?? [];
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (method === 'GET' || method === 'HEAD') {
        const out = single ? rows[0] ?? null : rows;
        return single && !out ? json(route, { code: 'PGRST116', message: 'no rows' }, 406) : json(route, out, 200, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      }
      let body = {};
      try { body = req.postDataJSON() ?? {}; } catch { /* sin cuerpo */ }
      const merged = { ...(rows[0] ?? {}), ...(Array.isArray(body) ? body[0] : body) };
      return json(route, single ? merged : [merged], method === 'POST' ? 201 : 200);
    }
    if (p.startsWith('/auth/v1/')) {
      const user = { id: 'org1', aud: 'authenticated', role: 'authenticated', email: 'organizadora@ejemplo.test', app_metadata: {}, user_metadata: {}, created_at: iso(30 * 24 * H) };
      if (p.endsWith('/user')) return json(route, user);
      return json(route, { access_token: 'x.y.z', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, refresh_token: 'r', user });
    }
    if (p.startsWith('/storage/v1/')) {
      if (method === 'POST' && p.includes('/object/sign/')) {
        const rest = p.split('/object/sign/')[1];
        let b = {};
        try { b = req.postDataJSON() ?? {}; } catch { /* nada */ }
        if (Array.isArray(b.paths)) return json(route, b.paths.map((x) => ({ path: x, error: null, signedURL: `/object/sign/${rest}/${x}?token=t` })));
        return json(route, { signedURL: `/object/sign/${rest}?token=t` });
      }
      if (method === 'GET') return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: svg(hash(p)) });
      return json(route, { Key: 'ok' });
    }
    return json(route, {});
  });

  return 'mock instalado';
}
