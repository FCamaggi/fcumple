import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HowToGetTherePage from './HowToGetTherePage';
import { ROUTES } from '../lib/routes';

function renderPage() {
  return render(
    <MemoryRouter>
      <HowToGetTherePage />
    </MemoryRouter>,
  );
}

describe('HowToGetTherePage', () => {
  it('shows the address and the arrival hint', () => {
    renderPage();

    const address = within(screen.getByRole('region', { name: 'Dirección' }));
    expect(address.getByText(/pasaje argentina 2299, independencia/i)).toBeInTheDocument();
    expect(address.getByText(/la casa de la derecha/i)).toBeInTheDocument();
  });

  it('renders one card per route with a maps link', () => {
    renderPage();

    for (const route of ROUTES) {
      expect(screen.getByRole('heading', { name: route.title })).toBeInTheDocument();
    }
    const mapsLinks = screen.getAllByRole('link', { name: /ver en google maps/i });
    expect(mapsLinks).toHaveLength(ROUTES.length);
    for (const link of mapsLinks) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
    }
  });

  it('groups routes under their transport mode', () => {
    renderPage();

    expect(screen.getByRole('region', { name: 'En micro' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'En auto / Uber' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Caminando' })).toBeInTheDocument();
  });

  it('links back to the event hub', () => {
    renderPage();

    expect(screen.getByRole('link', { name: /volver a la cartelera/i })).toHaveAttribute('href', '/evento');
  });
});
