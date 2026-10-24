import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Header {
  key: string;
  value: string;
}
interface VercelConfig {
  headers: { source: string; headers: Header[] }[];
}

const config = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as VercelConfig;
const allPages = config.headers.find((h) => h.source === '/(.*)');
const headerValue = (key: string) => allPages?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

describe('vercel.json: cabeceras de toda la app', () => {
  it('solo la propia app puede incrustarla en un iframe (la vista previa del panel lo necesita)', () => {
    expect(headerValue('Content-Security-Policy')).toBe("frame-ancestors 'self'");
  });

  it('no suma X-Frame-Options: una sola política de incrustación, la de frame-ancestors', () => {
    expect(headerValue('X-Frame-Options')).toBeUndefined();
  });

  it('conserva Referrer-Policy: no-referrer', () => {
    expect(headerValue('Referrer-Policy')).toBe('no-referrer');
  });
});
