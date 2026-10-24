import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PanelState from './PanelState';

describe('PanelState', () => {
  it('carga: avisa con role="status" y el texto que se le da', () => {
    render(<PanelState kind="loading">Cargando fotos...</PanelState>);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando fotos...');
  });

  it('vacío: dice qué pasa y qué hacer, sin role de alerta', () => {
    render(<PanelState kind="empty">Todavía no hay avisos. Crea el primero.</PanelState>);
    expect(screen.getByText('Todavía no hay avisos. Crea el primero.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('error: role="alert" con el mensaje y un «Reintentar» que llama a onRetry', async () => {
    const onRetry = vi.fn();
    render(
      <PanelState kind="error" onRetry={onRetry}>
        No pudimos cargar los avisos.
      </PanelState>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los avisos.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error sin onRetry no ofrece el botón', () => {
    render(<PanelState kind="error">No pudimos guardar.</PanelState>);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('el botón de reintento mide 44 px de alto y el texto no baja de 12 px', () => {
    render(
      <PanelState kind="error" onRetry={vi.fn()}>
        Falló.
      </PanelState>,
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveClass('h-11');
    expect(screen.getByRole('alert').innerHTML).not.toMatch(/text-\[(?:[0-9]|1[01])px\]|text-\[0?\.[0-6]\d*rem\]/);
  });
});
