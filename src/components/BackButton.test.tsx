import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import BackButton from './BackButton';

function renderApp(fallbackTo?: string, initialEntries = ['/origen']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/origen" element={<Link to="/destino">ir</Link>} />
        <Route path="/destino" element={<BackButton fallbackTo={fallbackTo} />} />
        <Route path="/fallback" element={<p>en fallback</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BackButton', () => {
  it('goes back in the browser history', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('link', { name: 'ir' }));

    await userEvent.click(screen.getByRole('button', { name: /volver/i }));

    expect(screen.getByRole('link', { name: 'ir' })).toBeInTheDocument();
  });

  it('goes to the fallback when the page was opened directly', async () => {
    renderApp('/fallback', ['/destino']);

    await userEvent.click(screen.getByRole('button', { name: /volver/i }));

    expect(screen.getByText('en fallback')).toBeInTheDocument();
  });

  it('is hidden when opened directly and there is no fallback', () => {
    renderApp(undefined, ['/destino']);

    expect(screen.queryByRole('button', { name: /volver/i })).not.toBeInTheDocument();
  });
});
