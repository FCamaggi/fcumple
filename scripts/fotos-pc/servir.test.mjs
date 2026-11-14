import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServerConfigError, createPhotoServer, readServerConfig, verifySignature } from './servir-core.mjs';

const EV = 'aaaaaaaa-1111-4111-8111-111111111111';
const GU = '22222222-2222-4222-8222-222222222222';
const PATH_A = `${EV}/${GU}/a.jpg`;
const SECRET = 's'.repeat(40);
const NOW = 1_800_000_000;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from('foto original '.repeat(50)), Buffer.from([0xff, 0xd9])]);

/** La misma firma que photo_original_url: HMAC-SHA256 en hex de "<ruta>\n<exp>". */
const sign = (storagePath, exp, secret = SECRET) =>
  createHmac('sha256', secret).update(`${storagePath}\n${exp}`, 'utf8').digest('hex');
const signedUrl = (storagePath, exp = NOW + 3600) => `/p/${storagePath}?exp=${exp}&sig=${sign(storagePath, exp)}`;

let dir;
let outside;
let server;
let port;
let now;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-servir-test-'));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-servir-fuera-'));
  fs.mkdirSync(path.join(dir, EV, GU), { recursive: true });
  fs.writeFileSync(path.join(dir, EV, GU, 'a.jpg'), JPEG);
  now = NOW;
  server = createPhotoServer({ dir, secret: SECRET, now: () => now });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

/** Petición cruda: no normaliza la ruta (fetch convertiría `/p/../x` en `/x`). */
function request(rawPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('verifySignature', () => {
  it('accepts a signature computed by pgcrypto, as photo_original_url does', () => {
    // encode(hmac(convert_to(<ruta> || E'\n' || '1800003600', 'UTF8'), convert_to(repeat('s', 40), 'UTF8'), 'sha256'), 'hex')
    // calculado con pgcrypto en Postgres 16.
    const fromPg = 'f7e01172c5538cf0390b89603b0761c734d71e66d26f91d123037a5e841cd91e';
    expect(verifySignature(PATH_A, '1800003600', fromPg, SECRET, NOW)).toBe('ok');
  });

  it('accepts the signature photo_original_url produces', () => {
    expect(verifySignature(PATH_A, String(NOW + 10), sign(PATH_A, NOW + 10), SECRET, NOW)).toBe('ok');
  });

  it('rejects an expired link', () => {
    expect(verifySignature(PATH_A, String(NOW - 1), sign(PATH_A, NOW - 1), SECRET, NOW)).toBe('expired');
  });

  it('rejects an exp that is not plain digits', () => {
    for (const exp of ['1e10', '+1800003600', ' 1800003600', '1800003600.0', '0x6b49d200', '', '9'.repeat(16)]) {
      expect(verifySignature(PATH_A, exp, sign(PATH_A, exp), SECRET, NOW)).toBe('bad');
    }
  });

  it('rejects an exp too far in the future, even if signed', () => {
    const exp = NOW + 3 * 3600;
    expect(verifySignature(PATH_A, String(exp), sign(PATH_A, exp), SECRET, NOW)).toBe('bad');
  });

  it('rejects a signature made with another secret, for another path or another exp', () => {
    const exp = NOW + 10;
    expect(verifySignature(PATH_A, String(exp), sign(PATH_A, exp, 'x'.repeat(40)), SECRET, NOW)).toBe('bad');
    expect(verifySignature(PATH_A, String(exp), sign(`${EV}/${GU}/b.jpg`, exp), SECRET, NOW)).toBe('bad');
    expect(verifySignature(PATH_A, String(exp), sign(PATH_A, exp + 1), SECRET, NOW)).toBe('bad');
  });

  it('rejects a malformed signature (uppercase, short, not hex)', () => {
    const exp = NOW + 10;
    const good = sign(PATH_A, exp);
    for (const sig of [good.toUpperCase(), good.slice(0, 63), `${good.slice(0, 63)}z`, `${good}0`, '']) {
      expect(verifySignature(PATH_A, String(exp), sig, SECRET, NOW)).toBe('bad');
    }
  });
});

describe('GET /health', () => {
  it('answers 200 with CORS and no cache', async () => {
    const res = await request('/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString())).toEqual({ ok: true });
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 503 when the photos folder is not readable', async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    const res = await request('/health');
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body.toString())).toEqual({ ok: false });
  });
});

describe('GET /p/<path>', () => {
  it('serves the original byte for byte as a JPEG download', async () => {
    const res = await request(signedUrl(PATH_A));
    expect(res.status).toBe(200);
    expect(res.body.equals(JPEG)).toBe(true);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-length']).toBe(String(JPEG.length));
    expect(res.headers['content-disposition']).toBe('attachment; filename="a.jpg"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('answers HEAD with the headers and no body', async () => {
    const res = await request(signedUrl(PATH_A), 'HEAD');
    expect(res.status).toBe(200);
    expect(res.headers['content-length']).toBe(String(JPEG.length));
    expect(res.body.length).toBe(0);
  });

  it('answers 403 once the link expired', async () => {
    const url = signedUrl(PATH_A, NOW + 60);
    now = NOW + 61;
    const res = await request(url);
    expect(res.status).toBe(403);
    expect(res.body.includes(Buffer.from('foto original'))).toBe(false);
  });

  it('answers 403 to a bad signature, a missing parameter or a repeated one', async () => {
    const exp = NOW + 60;
    const sig = sign(PATH_A, exp);
    for (const url of [
      `/p/${PATH_A}?exp=${exp}&sig=${'0'.repeat(64)}`,
      `/p/${PATH_A}?exp=${exp}`,
      `/p/${PATH_A}?sig=${sig}`,
      `/p/${PATH_A}?exp=${exp}&sig=${sig}&sig=${sig}`,
      `/p/${PATH_A}?exp=${exp}&exp=${exp}&sig=${sig}`,
    ]) {
      expect((await request(url)).status, url).toBe(403);
    }
  });

  it('answers 403, not 404, to a bad signature for a file that does not exist (no existence oracle)', async () => {
    const res = await request(`/p/${EV}/${GU}/no-existe.jpg?exp=${NOW + 60}&sig=${'0'.repeat(64)}`);
    expect(res.status).toBe(403);
  });

  it('answers 404 to a validly signed path that is not on disk', async () => {
    const res = await request(signedUrl(`${EV}/${GU}/no-existe.jpg`));
    expect(res.status).toBe(404);
  });

  it('answers 404 to paths that try to leave the folder, even when they are signed', async () => {
    fs.writeFileSync(path.join(outside, 'secreto.txt'), 'secreto');
    const rel = path.relative(dir, path.join(outside, 'secreto.txt')).split(path.sep).join('/');
    for (const p of [
      rel,
      `${EV}/${GU}/../../${rel}`,
      `${EV}/${GU}/..%2f..%2f${rel}`,
      `${EV}/${GU}/%2e%2e`,
      `${EV}/${GU}/..\\..\\x.jpg`,
      `${EV}/${GU}/a.jpg/`,
      `${EV}/${GU}/a%2ejpg`,
      `${EV}/${GU}`,
      `${EV.toUpperCase()}/${GU}/a.jpg`,
      `${EV}/${GU}/.oculto`,
      `/${PATH_A}`,
    ]) {
      const res = await request(signedUrl(p));
      expect(res.status, p).toBe(404);
      expect(res.body.includes(Buffer.from('secreto')), p).toBe(false);
    }
  });

  it('does not follow a symlink that points outside the folder', async () => {
    fs.writeFileSync(path.join(outside, 'secreto.jpg'), 'secreto');
    fs.symlinkSync(path.join(outside, 'secreto.jpg'), path.join(dir, EV, GU, 'enlace.jpg'));
    const res = await request(signedUrl(`${EV}/${GU}/enlace.jpg`));
    expect(res.status).toBe(404);
    expect(res.body.includes(Buffer.from('secreto'))).toBe(false);
  });

  it.runIf(process.platform === 'linux')('closes the file when the client aborts the download', async () => {
    const big = path.join(dir, EV, GU, 'grande.jpg');
    fs.writeFileSync(big, Buffer.alloc(30 * 1024 * 1024, 1));
    const openFds = () =>
      fs.readdirSync('/proc/self/fd').filter((fd) => {
        try {
          return fs.readlinkSync(`/proc/self/fd/${fd}`) === big;
        } catch {
          return false;
        }
      }).length;

    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: signedUrl(`${EV}/${GU}/grande.jpg`) }, (res) => {
          res.once('data', () => {
            req.destroy();
            resolve();
          });
        });
        req.on('error', (err) => (err.code === 'ECONNRESET' ? resolve() : reject(err)));
      });
    }
    await expect.poll(openFds, { timeout: 2000 }).toBe(0);
  });

  it('answers 404 to a signed path that is a directory', async () => {
    fs.mkdirSync(path.join(dir, EV, GU, 'carpeta.jpg'));
    expect((await request(signedUrl(`${EV}/${GU}/carpeta.jpg`))).status).toBe(404);
  });
});

describe('other routes and methods', () => {
  it('answers 404 to unknown routes', async () => {
    for (const p of ['/', '/p/', '/healthz', '/health/x', '/P/' + PATH_A]) {
      expect((await request(p)).status, p).toBe(404);
    }
  });

  it('answers 405 to methods that write', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await request(signedUrl(PATH_A), method);
      expect(res.status, method).toBe(405);
      expect(res.headers.allow).toBe('GET, HEAD, OPTIONS');
    }
    expect(fs.readFileSync(path.join(dir, EV, GU, 'a.jpg')).equals(JPEG)).toBe(true);
  });

  it('answers the CORS preflight', async () => {
    const res = await request('/health', 'OPTIONS');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toBe('GET, HEAD, OPTIONS');
  });
});

describe('readServerConfig', () => {
  const env = { FOTOS_SIGNING_SECRET: SECRET, FOTOS_DIR: '/fotos' };

  it('reads the secret, the folder and the default port', () => {
    expect(readServerConfig(env)).toEqual({ secret: SECRET, dir: '/fotos', host: '127.0.0.1', port: 8787 });
  });

  it('accepts another port but always listens on 127.0.0.1', () => {
    expect(readServerConfig({ ...env, FOTOS_PUERTO: '9000', HOST: '0.0.0.0' })).toMatchObject({ host: '127.0.0.1', port: 9000 });
  });

  it('fails without the secret or the folder', () => {
    expect(() => readServerConfig({ FOTOS_DIR: '/fotos' })).toThrow(new ServerConfigError('faltan variables: FOTOS_SIGNING_SECRET'));
    expect(() => readServerConfig({ FOTOS_SIGNING_SECRET: SECRET })).toThrow(new ServerConfigError('faltan variables: FOTOS_DIR'));
  });

  it('fails with a secret shorter than 32 characters, like the database', () => {
    expect(() => readServerConfig({ ...env, FOTOS_SIGNING_SECRET: 'x'.repeat(31) })).toThrow(
      new ServerConfigError('FOTOS_SIGNING_SECRET debe tener 32 caracteres o más'),
    );
  });

  it('fails with an invalid port', () => {
    for (const p of ['0', '70000', 'abc', '80.5']) {
      expect(() => readServerConfig({ ...env, FOTOS_PUERTO: p })).toThrow(
        new ServerConfigError('FOTOS_PUERTO debe ser un entero entre 1 y 65535'),
      );
    }
  });
});
