import { describe, expect, it } from 'vitest';
import { MODE_ORDER, ROUTES, buildDestinationUrl, buildMapsUrl, routesByMode } from './routes';

describe('buildMapsUrl', () => {
  it('builds a directions url with origin, destination and travel mode', () => {
    const url = new URL(buildMapsUrl('Metro Hospitales, Santiago', 'bus'));

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('Metro Hospitales, Santiago');
    expect(url.searchParams.get('destination')).toContain('Pasaje Argentina 2299');
    expect(url.searchParams.get('travelmode')).toBe('transit');
  });

  it('maps each mode to its google travelmode', () => {
    expect(new URL(buildMapsUrl('x', 'uber')).searchParams.get('travelmode')).toBe('driving');
    expect(new URL(buildMapsUrl('x', 'walk')).searchParams.get('travelmode')).toBe('walking');
  });
});

describe('buildDestinationUrl', () => {
  it('builds a search url for the address', () => {
    const url = new URL(buildDestinationUrl());
    expect(url.searchParams.get('query')).toContain('Pasaje Argentina 2299');
  });
});

describe('ROUTES', () => {
  it('has unique ids and at least one step each', () => {
    const ids = ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const route of ROUTES) expect(route.steps.length).toBeGreaterThan(0);
  });

  it('covers every mode', () => {
    for (const mode of MODE_ORDER) expect(routesByMode(mode).length).toBeGreaterThan(0);
  });

  it('lists the bus lines on every bus route', () => {
    for (const route of routesByMode('bus')) expect(route.lines?.length).toBeGreaterThan(0);
  });
});
