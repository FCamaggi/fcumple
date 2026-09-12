import { describe, expect, it } from 'vitest';
import { extractTokenFromQrText } from './qrToken';

describe('extractTokenFromQrText', () => {
  it('extracts the token from a full guest link', () => {
    expect(extractTokenFromQrText('https://fcumple.example.com/i/mafe-8842')).toBe('mafe-8842');
  });

  it('extracts the token from a link with a trailing slash', () => {
    expect(extractTokenFromQrText('https://fcumple.example.com/i/mafe-8842/')).toBe('mafe-8842');
  });

  it('returns a bare token unchanged', () => {
    expect(extractTokenFromQrText('mafe-8842')).toBe('mafe-8842');
  });

  it('trims surrounding whitespace some QR generators add', () => {
    expect(extractTokenFromQrText('  mafe-8842  ')).toBe('mafe-8842');
  });

  it('extracts the token from a link with query params', () => {
    expect(extractTokenFromQrText('https://fcumple.example.com/i/mafe-8842?utm=x')).toBe('mafe-8842');
  });
});
