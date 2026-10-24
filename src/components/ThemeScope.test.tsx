import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ThemeScope from './ThemeScope';

const root = () => document.documentElement;

afterEach(() => {
  root().removeAttribute('style');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});

describe('ThemeScope', () => {
  it('escribe las variables del tema en <html> (lo que ven también los modales y la cámara)', () => {
    render(<ThemeScope theme={{ preset: 'rosa-chicle' }}>hola</ThemeScope>);
    expect(root().style.getPropertyValue('--c-acid-400')).toBe('255 95 162');
    expect(root().style.getPropertyValue('--c-ink-950')).toBe('21 10 18');
  });

  it('muestra a sus hijos', () => {
    const { getByText } = render(<ThemeScope theme={{}}>contenido</ThemeScope>);
    expect(getByText('contenido')).toBeInTheDocument();
  });

  it('al salir, restaura la piel por defecto (no se filtra a otra pantalla)', () => {
    const { unmount } = render(<ThemeScope theme={{ preset: 'rosa-chicle' }}>x</ThemeScope>);
    unmount();
    expect(root().style.getPropertyValue('--c-acid-400')).toBe('');
    expect(root().style.getPropertyValue('--c-ink-950')).toBe('');
  });

  it('cambia de piel cuando cambia el tema', () => {
    const { rerender } = render(<ThemeScope theme={{ preset: 'rosa-chicle' }}>x</ThemeScope>);
    rerender(<ThemeScope theme={{ preset: 'calabaza' }}>x</ThemeScope>);
    expect(root().style.getPropertyValue('--c-acid-400')).toBe('255 122 26');
  });

  it('un tema que no existe usa el neón de siempre', () => {
    render(<ThemeScope theme={{ preset: 'inventado' }}>x</ThemeScope>);
    expect(root().style.getPropertyValue('--c-acid-400')).toBe('200 255 61');
  });

  it('pinta la barra del navegador del color del fondo y la deja como estaba al salir', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#000000';
    document.head.appendChild(meta);

    const { unmount } = render(<ThemeScope theme={{ preset: 'rosa-chicle' }}>x</ThemeScope>);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#150a12');
    unmount();
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#000000');
  });

  it('si no había theme-color, lo crea y lo quita al salir', () => {
    const { unmount } = render(<ThemeScope theme={{ preset: 'rosa-chicle' }}>x</ThemeScope>);
    expect(document.querySelector('meta[name="theme-color"]')).not.toBeNull();
    unmount();
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
  });
});
