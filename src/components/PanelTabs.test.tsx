import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PanelTabs from './PanelTabs';

const TABS = [
  { id: 'uno', label: 'Uno' },
  { id: 'dos', label: 'Dos' },
  { id: 'tres', label: 'Tres' },
];

const scrollOriginal = Element.prototype.scrollIntoView;
const matchMediaOriginal = window.matchMedia;

afterEach(() => {
  Element.prototype.scrollIntoView = scrollOriginal;
  window.matchMedia = matchMediaOriginal;
});

describe('PanelTabs: insignia', () => {
  it('muestra la cuenta en la pestaña y la lee el lector de pantalla con su explicación', () => {
    render(
      <PanelTabs
        tabs={[...TABS.slice(0, 2), { id: 'tres', label: 'Tres', badge: { count: 3, hint: 'por revisar' } }]}
        active="uno"
        onSelect={vi.fn()}
      />,
    );

    const tab = screen.getByRole('button', { name: /Tres.*3 por revisar/ });
    expect(tab).toHaveTextContent('3');
  });

  it('sin cuenta o con cero no dibuja nada', () => {
    render(
      <PanelTabs
        tabs={[
          { id: 'uno', label: 'Uno', badge: { count: 0, hint: 'por revisar' } },
          { id: 'dos', label: 'Dos' },
        ]}
        active="uno"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Uno' })).toHaveTextContent(/^Uno$/);
  });

  it('con cien o más muestra 99+', () => {
    render(
      <PanelTabs tabs={[{ id: 'uno', label: 'Uno', badge: { count: 120, hint: 'por revisar' } }]} active="uno" onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Uno/ })).toHaveTextContent('99+');
  });
});

describe('PanelTabs', () => {
  it('marca la sección activa con aria-current y avisa al elegir otra', async () => {
    const onSelect = vi.fn();
    render(<PanelTabs tabs={TABS} active="dos" onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: 'Dos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Uno' })).not.toHaveAttribute('aria-current');

    await userEvent.click(screen.getByRole('button', { name: 'Tres' }));
    expect(onSelect).toHaveBeenCalledWith('tres');
  });

  // En un teléfono 9 pestañas no caben en una fila: una sola fila con scroll horizontal en vez de 3 filas apiladas.
  it('va en una sola fila con scroll horizontal y no se parte en varias', () => {
    render(<PanelTabs tabs={TABS} active="uno" onSelect={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    const row = nav.firstElementChild as HTMLElement;

    expect(nav.className).toContain('overflow-x-auto');
    expect(row.className).not.toContain('flex-wrap');
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('shrink-0');
    }
  });

  it('cada pestaña mide al menos 44 px de alto (objetivo táctil)', () => {
    render(<PanelTabs tabs={TABS} active="uno" onSelect={() => {}} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toMatch(/\bh-11\b|\bmin-h-\[44px\]|\btap-target\b/);
    }
  });

  it('lleva la pestaña activa a la vista cuando cambia (la 9.ª queda fuera de la pantalla)', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<PanelTabs tabs={TABS} active="uno" onSelect={() => {}} />);
    scrollIntoView.mockClear();

    rerender(<PanelTabs tabs={TABS} active="tres" onSelect={() => {}} />);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ inline: 'center', block: 'nearest' }));
  });

  it('no desplaza nada al montar, tampoco bajo StrictMode (que corre los efectos dos veces)', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <StrictMode>
        <PanelTabs tabs={TABS} active="tres" onSelect={() => {}} />
      </StrictMode>,
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('con movimiento reducido el desplazamiento es instantáneo', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    const { rerender } = render(<PanelTabs tabs={TABS} active="uno" onSelect={() => {}} />);
    rerender(<PanelTabs tabs={TABS} active="dos" onSelect={() => {}} />);
    expect(scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });
});
