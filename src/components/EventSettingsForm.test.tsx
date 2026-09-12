import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventSettingsForm from './EventSettingsForm';

vi.mock('../lib/eventApi', () => ({
  getEventConfig: vi.fn(),
  updateEventConfig: vi.fn(),
}));

import { getEventConfig, updateEventConfig } from '../lib/eventApi';

const existingConfig = {
  eventName: 'NOCTURNA',
  eventDate: '2026-05-24T02:00:00.000Z',
  location: 'The Warehouse Club',
  theme: 'All black',
  rsvpDeadline: '2026-05-21T23:59:00.000Z',
  photosRevealedAt: null,
};

beforeEach(() => {
  vi.mocked(getEventConfig).mockReset();
  vi.mocked(updateEventConfig).mockReset();
});

describe('EventSettingsForm', () => {
  it('preloads the existing event config values on mount', async () => {
    vi.mocked(getEventConfig).mockResolvedValueOnce(existingConfig);

    render(<EventSettingsForm />);

    expect(await screen.findByDisplayValue('NOCTURNA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('The Warehouse Club')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All black')).toBeInTheDocument();
  });

  it('saves the edited fields via updateEventConfig', async () => {
    vi.mocked(getEventConfig).mockResolvedValueOnce(existingConfig);
    vi.mocked(updateEventConfig).mockResolvedValueOnce({ ...existingConfig, eventName: 'RENOMBRADO' });
    const user = userEvent.setup();

    render(<EventSettingsForm />);

    const nameInput = await screen.findByDisplayValue('NOCTURNA');
    await user.clear(nameInput);
    await user.type(nameInput, 'RENOMBRADO');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(updateEventConfig).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'RENOMBRADO', location: 'The Warehouse Club', theme: 'All black' }),
      ),
    );
    expect(await screen.findByText(/guardado/i)).toBeInTheDocument();
  });

  it('shows an error and keeps the typed value when saving fails', async () => {
    vi.mocked(getEventConfig).mockResolvedValueOnce(existingConfig);
    vi.mocked(updateEventConfig).mockRejectedValueOnce(new Error('permission denied'));
    const user = userEvent.setup();

    render(<EventSettingsForm />);

    const nameInput = await screen.findByDisplayValue('NOCTURNA');
    await user.clear(nameInput);
    await user.type(nameInput, 'RENOMBRADO');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('RENOMBRADO')).toBeInTheDocument();
  });

  it('starts with empty fields when there is no event configured yet', async () => {
    vi.mocked(getEventConfig).mockResolvedValueOnce(null);

    render(<EventSettingsForm />);

    await waitFor(() => expect(getEventConfig).toHaveBeenCalled());
    expect(screen.getByLabelText(/nombre del evento/i)).toHaveValue('');
  });
});
