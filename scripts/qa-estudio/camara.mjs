// Diagnóstico de la cámara del invitado con el Supabase simulado de scripts/qa-movil/mock.js.
// Mide qué proporción tiene el visor para un video de la forma que elijas, cuánto "zoom" aparente produce el
// recorte y si la página de atrás se puede desplazar con la cámara abierta. No habla con ninguna base real.
//
// 1. Levanta la app apuntando a una dirección falsa:
//      VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=clave-falsa npx vite --host 127.0.0.1 --port 5173
// 2. node scripts/qa-estudio/camara.mjs [anchoVentana] [altoVentana] [anchoVideo] [altoVideo] [nombre]
//    Por ejemplo, un teléfono de 390×844 al que el navegador le entrega video 9:16:
//      node scripts/qa-estudio/camara.mjs 390 844 1080 1920 v916
//
// Deja capturas en scripts/qa-estudio/salida/ (ignorada por git). Importante: el video es SIMULADO; lo que
// entrega un teléfono real hay que medirlo en el teléfono (ver las notas temporales de la cámara).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_BASE || 'http://127.0.0.1:5173';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(BASE)) {
  throw new Error(`QA_BASE debe ser local (127.0.0.1 o localhost); recibí ${BASE}.`);
}

function cargarPlaywright() {
  const candidatos = [process.env.PLAYWRIGHT_CORE, process.cwd()];
  try {
    const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim();
    candidatos.push(path.join(raiz, '@playwright', 'cli'), path.join(raiz, 'playwright-core'), path.join(raiz, 'playwright'));
  } catch {
    // sin npm en el PATH
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

const [ventanaW = '390', ventanaH = '844', videoW = '480', videoH = '640', nombre = 'camara'] = process.argv.slice(2);
const OUT = path.join(here, 'salida');
fs.mkdirSync(OUT, { recursive: true });

const pw = cargarPlaywright();
const installMock = (0, eval)(`(${fs.readFileSync(path.join(here, '..', 'qa-movil', 'mock.js'), 'utf8')})`);

const browser = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
const context = await browser.newContext({
  viewport: { width: +ventanaW, height: +ventanaH },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  locale: 'es-CL',
  permissions: ['camera'],
});
await context.addInitScript(({ vw, vh }) => {
  localStorage.setItem('fcumple:session:demo', JSON.stringify({ token: 't-active', guestName: 'Camila Rojas' }));
  // Video simulado de vw×vh: un fondo liso con un rectángulo blanco al centro.
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas');
    c.width = +vw;
    c.height = +vh;
    const g = c.getContext('2d');
    setInterval(() => {
      g.fillStyle = '#556';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#fff';
      g.fillRect(c.width * 0.35, c.height * 0.25, c.width * 0.3, c.height * 0.5);
    }, 100);
    return c.captureStream(10);
  };
}, { vw: videoW, vh: videoH });

const page = await context.newPage();
await installMock(page);
await page.goto(`${BASE}/e/demo`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /abrir cámara/i }).click();
await page.waitForTimeout(3500);

const info = await page.evaluate(() => {
  const root = document.querySelector('[aria-label="Cámara de fotos"]');
  const r = root.getBoundingClientRect();
  const stage = document.querySelector('[data-testid="composer-stage"]')?.getBoundingClientRect();
  const video = document.querySelector('[aria-label="Cámara de fotos"] video');
  const ancestros = [];
  for (let a = root.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (s.transform !== 'none' || s.filter !== 'none' || s.backdropFilter !== 'none' || s.contain !== 'none') {
      ancestros.push({ tag: a.tagName, clase: String(a.className).slice(0, 60) });
    }
  }
  return {
    ventana: { w: innerWidth, h: innerHeight },
    capaDeLaCamara: { x: r.x, y: r.y, w: r.width, h: r.height },
    ancestrosQueRompenFixed: ancestros,
    visor: stage && { w: Math.round(stage.width), h: Math.round(stage.height), proporcion: +(stage.width / stage.height).toFixed(3) },
    video: video && { w: video.videoWidth, h: video.videoHeight, proporcion: +(video.videoWidth / video.videoHeight).toFixed(3) },
    alturaDelDocumento: document.documentElement.scrollHeight,
  };
});

// Zoom aparente: cuánto del video se ve. 1 = todo el cuadro; 1,33 = se ve el 75 % de un lado.
if (info.visor && info.video) {
  const v = info.video.proporcion;
  const e = info.visor.proporcion;
  info.zoomAparente = +Math.max(v / e, e / v).toFixed(2);
}

// ¿Se desplaza la página de atrás con la rueda o con un deslizamiento táctil sobre los controles?
const antes = await page.evaluate(() => scrollY);
await page.mouse.move(200, +ventanaH - 60);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(400);
const trasRueda = await page.evaluate(() => scrollY);
const cdp = await context.newCDPSession(page);
await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: +ventanaH - 60, yDistance: -500, speed: 1200, gestureSourceType: 'touch' });
await page.waitForTimeout(500);
const trasDedo = await page.evaluate(() => scrollY);
info.scrollDeLaPaginaDeAtras = { inicio: antes, tras_rueda: trasRueda, tras_dedo: trasDedo, overflowBody: await page.evaluate(() => getComputedStyle(document.body).overflow) };

await page.screenshot({ path: path.join(OUT, `${nombre}.png`) });
console.log(JSON.stringify(info, null, 2));
await browser.close();
