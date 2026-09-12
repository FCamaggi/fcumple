import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FaderToggle from './FaderToggle';

describe('FaderToggle', () => {
  it('marks the button matching the current value as pressed', () => {
    render(<FaderToggle value="neutral" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sin decidir' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'No voy' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Voy' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with "yes" when the accessible "Voy" tap target is used', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FaderToggle value="neutral" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Voy' }));

    expect(onChange).toHaveBeenCalledWith('yes');
  });

  it('calls onChange with "no" when the accessible "No voy" tap target is used', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FaderToggle value="yes" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'No voy' }));

    expect(onChange).toHaveBeenCalledWith('no');
  });
});
