// Auditoría móvil: recorre escenas × perfiles con Supabase simulado (mock.js), captura y mide.
// Uso: node scripts/qa-movil/audit.mjs [filtroDePerfil] [filtroDeEscena]
// Variables: QA_BASE (por defecto http://127.0.0.1:5173), SHOTS (carpeta de salida), VSHOT=1 (solo la ventana visible),
// PLAYWRIGHT_CORE (ruta a playwright-core si no se encuentra solo). Léelo todo en README.md.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// playwright-core no es dependencia del proyecto: se busca en la variable, en el proyecto y en la instalación global
// de `playwright-cli` (npm root -g).
function cargarPlaywright() {
  const candidatos = [process.env.PLAYWRIGHT_CORE, process.cwd()];
  try {
    const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim();
    candidatos.push(path.join(raiz, '@playwright', 'cli'), path.join(raiz, 'playwright-core'), path.join(raiz, 'playwright'));
  } catch {
    // sin npm en el PATH: queda lo anterior
  }
  for (const base of candidatos.filter(Boolean)) {
    try {
      return createRequire(path.join(base, 'noop.js'))('playwright-core');
    } catch {
      // siguiente candidato
    }
  }
  throw new Error('No encuentro playwright-core. Instala playwright-cli (npm i -g @playwright/cli) o define PLAYWRIGHT_CORE.');
}
const pw = cargarPlaywright();
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_BASE || 'http://127.0.0.1:5173';
// El simulador solo intercepta 127.0.0.1:54321. Contra una web desplegada las pantallas hablarían con la base real:
// por eso el script se niega a correr si no es local.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(BASE)) {
  throw new Error(`QA_BASE debe ser local (127.0.0.1 o localhost); recibí ${BASE}. Esta auditoría crea datos de ejemplo y no debe tocar producción.`);
}
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const mock = fs.readFileSync(path.join(here, 'mock.js'), 'utf8');
const installMock = (0, eval)(`(${mock})`);

const profiles = [
  { id: 'iphone13', engine: 'webkit', device: 'iPhone 13' },
  { id: 'pixel7', engine: 'chromium', device: 'Pixel 7' },
  { id: 's360', engine: 'chromium', viewport: { width: 360, height: 640 }, mobile: true },
  // Los tamaños de la crítica de la cámara (iPhone 13/14 y Pro Max). En Chromium porque WebKit no abre la cámara falsa.
  { id: 's390', engine: 'chromium', viewport: { width: 390, height: 844 }, mobile: true },
  { id: 's430', engine: 'chromium', viewport: { width: 430, height: 932 }, mobile: true },
  { id: 'iphone13-h', engine: 'webkit', device: 'iPhone 13 landscape' },
  { id: 'pixel7-h', engine: 'chromium', device: 'Pixel 7 landscape' },
];

const orgSession = JSON.stringify({
  access_token: 'x.y.z', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: 'r',
  user: { id: 'org1', aud: 'authenticated', role: 'authenticated', email: 'organizadora@ejemplo.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
});

const TABS = ['Invitados', 'Avisos', 'Fotos', 'Activación', 'Cámara', 'Enlace', 'Inscripción', 'Puerta', 'Ajustes'];
const guest = (token) => ({ guestSession: token });
const scenes = [
  { id: 'g01-inscripcion', url: '/e/demo' },
  { id: 'g02-ya-me-inscribi', url: '/e/demo', act: async (p) => { await p.getByRole('button', { name: /ya me inscribí/i }).click(); } },
  { id: 'g03-no-existe', url: '/e/nada' },
  { id: 'g04-camara-bloqueada', url: '/e/demo', ...guest('t-locked') },
  { id: 'g05-camara-activa-cartelera', url: '/e/demo', ...guest('t-active') },
  { id: 'g06-cartelera-vacia', url: '/e/demo', ...guest('tv-active') },
  { id: 'g07-cupo-agotado', url: '/e/demo', ...guest('t-full') },
  { id: 'g08-qr-activacion', url: '/e/demo/a/AAAABBBBCCCC', ...guest('t-locked') },
  { id: 'g09-camara-abierta', url: '/e/demo', ...guest('t-active'), vshot: true, act: async (p) => { await p.getByRole('button', { name: /abrir cámara/i }).click(); await p.waitForTimeout(1500); } },
  // La cámara falsa de Chromium entrega 4:3 apaisado; un teléfono en vertical entrega 3:4. Esta escena sustituye
  // getUserMedia por un lienzo vertical de 480×640 para medir el visor como lo vería el invitado.
  { id: 'g11-camara-vertical', url: '/e/demo', ...guest('t-active'), vshot: true, fakeCam: true, act: async (p) => { await p.getByRole('button', { name: /abrir cámara/i }).click(); await p.waitForTimeout(1500); } },
  // La pantalla de revisión (diálogo con «Repetir» y «Enviar») y, tras enviar, el sello «Quedó en el rollo».
  { id: 'g12-revision-camara', url: '/e/demo', ...guest('t-active'), vshot: true, fakeCam: true, act: async (p) => { await p.getByRole('button', { name: /abrir cámara/i }).click(); await p.waitForTimeout(1500); await p.getByRole('button', { name: /disparar/i }).click(); await p.waitForTimeout(800); } },
  { id: 'g13-sello-enviado', url: '/e/demo', ...guest('t-active'), vshot: true, fakeCam: true, act: async (p) => { await p.getByRole('button', { name: /abrir cámara/i }).click(); await p.waitForTimeout(1500); await p.getByRole('button', { name: /disparar/i }).click(); await p.waitForTimeout(800); await p.getByRole('button', { name: /^enviar/i }).click(); await p.waitForTimeout(1200); } },
  { id: 'g10-visor-foto', url: '/e/demo', ...guest('t-active'), vshot: true, act: async (p) => { const b = p.getByRole('button', { name: /^ver foto 1 de/i }).first(); await b.scrollIntoViewIfNeeded(); await b.click(); await p.waitForTimeout(800); } },
  { id: 'o01-eventos', url: '/panel', org: true },
  ...TABS.map((t, i) => ({ id: `o${String(i + 2).padStart(2, '0')}-panel-${t.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`, url: `/panel/e/${EVENT_ID}`, org: true, act: async (p) => { await p.getByRole('button', { name: t, exact: true }).click(); await p.waitForTimeout(500); } })),
  { id: 'o19-hoy', url: `/panel/e/${EVENT_ID}`, org: true, act: async (p) => { await p.getByRole('button', { name: 'Hoy', exact: true }).click(); await p.waitForTimeout(1200); } },
  { id: 'o11-moderacion', url: `/panel/e/${EVENT_ID}`, org: true, vshot: true, act: async (p) => { await p.getByRole('button', { name: 'Fotos', exact: true }).click(); await p.waitForTimeout(500); await p.getByRole('button', { name: /revisar \d+ foto|abrir revisión/i }).first().click({ timeout: 3000 }); await p.waitForTimeout(700); } },
  { id: 'o12-escaner', url: `/panel/e/${EVENT_ID}`, org: true, vshot: true, act: async (p) => { await p.getByRole('button', { name: 'Puerta', exact: true }).click(); await p.getByRole('button', { name: /abrir escáner/i }).click(); await p.waitForTimeout(900); } },
  // Épica C: la pestaña «Vista previa» (teléfono dentro del panel) y la página que corre dentro de su iframe.
  { id: 'o13-vista-previa', url: `/panel/e/${EVENT_ID}`, org: true, act: async (p) => { await p.getByRole('button', { name: 'Vista previa', exact: true }).click(); await p.waitForTimeout(1500); } },
  { id: 'o14-vista-previa-fotos', url: `/panel/e/${EVENT_ID}`, org: true, act: async (p) => { await p.getByRole('button', { name: 'Vista previa', exact: true }).click(); await p.getByRole('button', { name: 'Fotos publicadas', exact: true }).click(); await p.waitForTimeout(1500); } },
  { id: 'o15-vista-previa-inscripcion', url: `/panel/e/${EVENT_ID}`, org: true, act: async (p) => { await p.getByRole('button', { name: 'Vista previa', exact: true }).click(); await p.getByRole('group', { name: 'Estado que quieres ver' }).getByRole('button', { name: 'Inscripción', exact: true }).click(); await p.waitForTimeout(1500); } },
  { id: 'o18-ajustes-estilo-vista-previa', url: `/panel/e/${EVENT_ID}`, org: true, act: async (p) => { await p.getByRole('button', { name: 'Ajustes', exact: true }).click(); await p.getByRole('button', { name: /ver cómo queda/i }).click(); await p.getByLabel('Estilo del evento').selectOption('neon'); await p.waitForTimeout(2000); } },
  { id: 'o17-aviso-vista-previa', url: `/panel/e/${EVENT_ID}`, org: true, act: async (p) => { await p.getByRole('button', { name: 'Avisos', exact: true }).click(); await p.getByRole('button', { name: /nuevo aviso/i }).click(); await p.getByLabel('Título', { exact: true }).fill('Pizza a las 22:00'); await p.getByLabel('Cuerpo').fill('Traigan hambre: pedimos a las diez.'); await p.getByRole('button', { name: /ver cómo queda/i }).click(); await p.waitForTimeout(2000); } },
  { id: 'o16-pagina-vista-previa', url: `/panel/e/${EVENT_ID}/vista-previa?estado=avisos`, org: true },
];

function measure() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0; };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.placeholder || el.name || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const out = { vw, vh, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
  out.hOverflow = out.scrollW > vw + 1;
  const _clip = () => 0;
  out.overflowing = [...document.querySelectorAll('body *')].filter((el) => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); if (r.right <= vw + 1) return false; for (let a = el.parentElement; a; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox === 'auto' || ox === 'scroll') return false; } return true; }).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} «${label(el)}» r=${Math.round(el.getBoundingClientRect().right)}`);
  out.smallFields = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select')].filter(vis).map((el) => ({ n: label(el), px: parseFloat(getComputedStyle(el).fontSize) })).filter((x) => x.px < 16);
  out.smallTap = [...document.querySelectorAll('button, a[href], [role=button], input[type=checkbox], input[type=radio], summary')].filter(vis).map((el) => { const t = (el.matches('input') && el.closest('label')) || el; const r = t.getBoundingClientRect(); return { n: label(el), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 44 || x.h < 44);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const sizes = {};
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || !vis(el)) continue;
    const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
    if (px < 12) sizes[px] = (sizes[px] || 0) + 1;
  }
  out.smallText = sizes;
  out.fixedFull = [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).position === 'fixed' && vis(el)).map((el) => { const r = el.getBoundingClientRect(); return { n: label(el), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; }).filter((x) => x.h >= vh - 2);
  // Cámara: qué parte del alto de la ventana ocupa el visor (el escenario con la proporción de la foto).
  const stage = document.querySelector('[data-testid="composer-stage"]');
  if (stage) { const r = stage.getBoundingClientRect(); out.stage = { w: Math.round(r.width), h: Math.round(r.height), pctAlto: Math.round((r.height / vh) * 100) }; }
  out.title = document.title;
  return out;
}

const onlyP = process.argv[2], onlyS = process.argv[3];
const outDir = path.join(here, 'salida', process.env.SHOTS || 'shots');
fs.mkdirSync(outDir, { recursive: true });
const results = [];

for (const prof of profiles) {
  if (onlyP && !prof.id.includes(onlyP)) continue;
  const engine = pw[prof.engine];
  const launchOpts = prof.engine === 'chromium' ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } : {};
  const browser = await engine.launch(launchOpts);
  const base = prof.device ? pw.devices[prof.device] : { viewport: prof.viewport, isMobile: prof.mobile, hasTouch: true, deviceScaleFactor: 2 };
  for (const sc of scenes) {
    if (onlyS && !sc.id.includes(onlyS)) continue;
    const context = await browser.newContext({ ...base, locale: 'es-CL', permissions: prof.engine === 'chromium' ? ['camera'] : [] });
    await context.addInitScript(({ sc, orgSession }) => {
      if (sc.fakeCam) {
        const stream = () => {
          const c = document.createElement('canvas');
          c.width = 480; c.height = 640;
          const g = c.getContext('2d');
          let t = 0;
          setInterval(() => { t += 1; g.fillStyle = `hsl(${(t * 3) % 360} 30% 40%)`; g.fillRect(0, 0, 480, 640); g.fillStyle = '#fff'; g.fillRect(160, 160, 160, 320); }, 100);
          return c.captureStream(10);
        };
        navigator.mediaDevices.getUserMedia = async () => stream();
      }
      try {
        if (sc.guestSession) localStorage.setItem('fcumple:session:demo', JSON.stringify({ token: sc.guestSession, guestName: 'Camila Rojas' }));
        if (sc.org) localStorage.setItem('sb-127-auth-token', orgSession);
      } catch { /* ignorar */ }
    }, { sc: { guestSession: sc.guestSession, org: sc.org, fakeCam: sc.fakeCam }, orgSession });
    const page = await context.newPage();
    await installMock(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    let m = { error: null };
    try {
      await page.goto(BASE + sc.url, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(1200);
      if (sc.act) await sc.act(page);
      await page.waitForTimeout(400);
      m = await page.evaluate(measure);
      m.hOverflow = m.hOverflow || m.overflowing.length > 0;
      const dir = path.join(outDir, prof.id);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${sc.id}.png`), fullPage: !sc.vshot && !process.env.VSHOT }).catch(() => page.screenshot({ path: path.join(dir, `${sc.id}.png`) }));
    } catch (e) {
      m = { error: String(e).slice(0, 200) };
    }
    results.push({ profile: prof.id, scene: sc.id, errors, ...m });
    process.stdout.write(`${prof.id} ${sc.id} ${m.error ? 'ERROR ' + m.error : `ovf=${m.hOverflow} campos<16=${m.smallFields?.length} tap<44=${m.smallTap?.length}${m.stage ? ` visor=${m.stage.pctAlto}%` : ''}`}\n`);
    await context.close();
  }
  await browser.close();
}
fs.mkdirSync(path.join(here, 'salida'), { recursive: true });
fs.writeFileSync(path.join(here, 'salida', `results${onlyP ? '-' + onlyP : ''}${onlyS ? '-' + onlyS : ''}.json`), JSON.stringify(results, null, 2));
