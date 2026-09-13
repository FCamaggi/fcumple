import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventHubPage from './EventHubPage';

vi.mock('../lib/eventApi', () => ({
  getEventConfig: vi.fn(),
  getPublicHeadcount: vi.fn(),
}));

vi.mock('../lib/postsApi', () => ({
  listPublishedPosts: vi.fn(),
  listPostImages: vi.fn(),
  getPostImageUrl: vi.fn((path: string) => `https://cdn.example/${path}`),
}));

vi.mock('../lib/photosApi', () => ({
  listRevealedPhotos: vi.fn(),
  getSignedPhotoUrl: vi.fn(),
}));

import { getEventConfig, getPublicHeadcount } from '../lib/eventApi';
import { listPublishedPosts, listPostImages } from '../lib/postsApi';
import { listRevealedPhotos, getSignedPhotoUrl } from '../lib/photosApi';

const baseConfig = {
  eventName: 'NOCTURNA',
  eventDate: '2027-01-24T02:00:00Z',
  location: 'The Warehouse Club',
  theme: 'All black',
  rsvpDeadline: '2026-05-21T23:59:00Z',
  photosRevealedAt: null,
};

beforeEach(() => {
  vi.mocked(getEventConfig).mockReset();
  vi.mocked(getEventConfig).mockResolvedValue(baseConfig);
  vi.mocked(getPublicHeadcount).mockReset();
  vi.mocked(getPublicHeadcount).mockResolvedValue(38);
  vi.mocked(listPublishedPosts).mockReset();
  vi.mocked(listPublishedPosts).mockResolvedValue([]);
  vi.mocked(listPostImages).mockReset();
  vi.mocked(listPostImages).mockResolvedValue([]);
  vi.mocked(listRevealedPhotos).mockReset();
  vi.mocked(listRevealedPhotos).mockResolvedValue([]);
  vi.mocked(getSignedPhotoUrl).mockReset();
  vi.mocked(getSignedPhotoUrl).mockResolvedValue('https://signed.example/a.jpg');
});

describe('EventHubPage', () => {
  it('shows a loading state while the event config is being fetched', () => {
    vi.mocked(getEventConfig).mockReturnValue(new Promise(() => {}));

    render(<EventHubPage />);

    expect(screen.getByText(/cargando la cartelera/i)).toBeInTheDocument();
  });

  it('shows the countdown to the event once loaded', async () => {
    render(<EventHubPage />);

    expect(await screen.findByText(/NOCTURNA/i)).toBeInTheDocument();
    expect(screen.getByText(/faltan/i)).toBeInTheDocument();
  });

  it('shows only the total headcount number, never guest names', async () => {
    render(<EventHubPage />);

    expect(await screen.findByText('38')).toBeInTheDocument();
    expect(screen.queryByText(/maria fernanda/i)).not.toBeInTheDocument();
  });

  it('degrades gracefully when the headcount fetch fails', async () => {
    vi.mocked(getPublicHeadcount).mockRejectedValueOnce(new Error('network down'));

    render(<EventHubPage />);

    expect(await screen.findByText(/NOCTURNA/i)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it('degrades gracefully when the event is not configured yet', async () => {
    vi.mocked(getEventConfig).mockResolvedValueOnce(null);

    render(<EventHubPage />);

    expect(await screen.findByText('38')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it('shows the announcement feed when there are published posts', async () => {
    vi.mocked(listPublishedPosts).mockResolvedValueOnce([
      {
        id: 'p1',
        title: 'Ya salió la lista',
        subtitle: null,
        body: 'Revisen el link, quedan pocos cupos.',
        coverImagePath: null,
        publishedAt: '2026-05-01T00:00:00Z',
        createdAt: '2026-04-28T00:00:00Z',
      },
    ]);

    render(<EventHubPage />);

    expect((await screen.findAllByText(/ya salió la lista/i)).length).toBeGreaterThan(0);
  });

  it('puts the announcement feed as the main content, ahead of the event status strip', async () => {
    vi.mocked(listPublishedPosts).mockResolvedValueOnce([
      {
        id: 'p1',
        title: 'Ya salió la lista',
        subtitle: null,
        body: 'Revisen el link, quedan pocos cupos.',
        coverImagePath: null,
        publishedAt: '2026-05-01T00:00:00Z',
        createdAt: '2026-04-28T00:00:00Z',
      },
    ]);

    render(<EventHubPage />);
    await screen.findByText(/ya salió la lista/i);

    const feedHeading = screen.getByText(/on air \/\/ avisos/i);
    const statusStrip = screen.getByLabelText('Estado del evento');
    expect(statusStrip.compareDocumentPosition(feedHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the event status strip with the countdown and a small headcount chip, not a giant tally', async () => {
    render(<EventHubPage />);

    const statusStrip = await screen.findByLabelText('Estado del evento');
    expect(statusStrip).toHaveTextContent('38');
    expect(screen.queryByLabelText('Aforo público')).not.toBeInTheDocument();
  });

  it('does not show the revealed roll before the admin reveals it', async () => {
    render(<EventHubPage />);

    await screen.findByText(/NOCTURNA/i);

    expect(listRevealedPhotos).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Rollo revelado')).not.toBeInTheDocument();
  });

  it('shows the revealed roll once photosRevealedAt is set and photos come back', async () => {
    vi.mocked(getEventConfig).mockReset();
    vi.mocked(getEventConfig).mockResolvedValue({ ...baseConfig, photosRevealedAt: '2026-06-01T00:00:00Z' });
    vi.mocked(listRevealedPhotos).mockResolvedValueOnce([
      { id: 'tok1/a.jpg', guestId: '', storagePath: 'tok1/a.jpg', status: 'approved', createdAt: '' },
    ]);

    render(<EventHubPage />);

    expect(await screen.findByLabelText('Rollo revelado')).toBeInTheDocument();
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok1/a.jpg');
  });
});
