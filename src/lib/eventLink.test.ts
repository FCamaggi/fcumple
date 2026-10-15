import { describe, expect, it } from 'vitest';
import { eventUrl, whatsappMessage, whatsappShareUrl } from './eventLink';

describe('eventUrl', () => {
  it('arma /e/:slug sin barras de más', () => {
    expect(eventUrl('https://fcumple.app', 'fiesta-abcd')).toBe('https://fcumple.app/e/fiesta-abcd');
    expect(eventUrl('https://fcumple.app/', 'fiesta-abcd')).toBe('https://fcumple.app/e/fiesta-abcd');
  });
});

describe('whatsappMessage', () => {
  it('es un único mensaje con el nombre del evento y el enlace', () => {
    const message = whatsappMessage('Cumple de Fabrizio', 'https://fcumple.app/e/fiesta-abcd');
    expect(message).toContain('Cumple de Fabrizio');
    expect(message).toContain('https://fcumple.app/e/fiesta-abcd');
    expect(message).toContain('\u{1F4F8}');
  });

  it('whatsappShareUrl codifica el texto y no apunta a ningún contacto', () => {
    const url = whatsappShareUrl('hola & chao\nlínea 2');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).toContain(encodeURIComponent('hola & chao\nlínea 2'));
  });
});
