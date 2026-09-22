import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/postsApi', () => ({
  listPostImages: vi.fn(),
  // getPostImageUrl es async de verdad (createSignedUrl contra un bucket
  // privado, ver postsApi.ts) -- el mock lo refleja para no dejar pasar una
  // regresión donde el componente vuelva a tratarlo como síncrono.
  getPostImageUrl: vi.fn((path: string) => Promise.resolve(`https://cdn.example/${path}`)),
}));

import AnnouncementFeed from './AnnouncementFeed';
import { listPostImages } from '../lib/postsApi';
import type { Post } from '../types';

const now = new Date('2026-05-10T12:00:00Z');

const withCover: Post = {
  id: 'p1',
  title: 'Ya salió la lista',
  subtitle: 'Quedan pocos cupos',
  body: 'Revisen el link, quedan pocos cupos para el +1.',
  coverImagePath: 'p1/cover.jpg',
  publishedAt: '2026-05-10T09:00:00Z', // 3h before `now`
  createdAt: '2026-05-09T00:00:00Z',
};

const withoutCover: Post = {
  id: 'p2',
  title: 'Cambio de horario',
  subtitle: null,
  body: 'La previa arranca una hora antes.',
  coverImagePath: null,
  publishedAt: '2026-05-08T12:00:00Z', // 2d before `now`
  createdAt: '2026-05-07T00:00:00Z',
};

beforeEach(() => {
  vi.mocked(listPostImages).mockReset();
  vi.mocked(listPostImages).mockResolvedValue([]);
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AnnouncementFeed', () => {
  it('renders nothing when there are no published posts', () => {
    const { container } = render(<AnnouncementFeed posts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('orders posts from most recent to oldest by publishedAt', () => {
    render(<AnnouncementFeed posts={[withoutCover, withCover]} />);

    const titles = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(titles).toEqual(['Ya salió la lista', 'Cambio de horario']);
  });

  it('shows title, subtitle and full (untruncated) body', () => {
    render(<AnnouncementFeed posts={[withCover]} />);

    expect(screen.getByText('Ya salió la lista')).toBeInTheDocument();
    expect(screen.getByText('Quedan pocos cupos')).toBeInTheDocument();
    expect(screen.getByText(withCover.body)).toBeInTheDocument();
  });

  it('shows the cover image when present, and skips that section when absent', async () => {
    render(<AnnouncementFeed posts={[withCover, withoutCover]} />);

    expect(await screen.findByAltText(withCover.title)).toHaveAttribute(
      'src',
      'https://cdn.example/p1/cover.jpg',
    );
    expect(screen.queryByAltText(withoutCover.title)).not.toBeInTheDocument();
  });

  it('shows a relative "published" time', () => {
    render(<AnnouncementFeed posts={[withCover, withoutCover]} />);

    expect(screen.getByText(/hace 3h/i)).toBeInTheDocument();
    expect(screen.getByText(/hace 2d/i)).toBeInTheDocument();
  });

  it('shows an absolute "published" timestamp in Chile time next to the relative one', () => {
    render(<AnnouncementFeed posts={[withCover, withoutCover]} />);

    // withCover.publishedAt = 2026-05-10T09:00:00Z -> America/Santiago (UTC-4
    // in May, no DST) = 05:00.
    expect(screen.getByText(/10 may · 05:00/i)).toBeInTheDocument();
    // withoutCover.publishedAt = 2026-05-08T12:00:00Z -> 08:00 Chile.
    expect(screen.getByText(/08 may · 08:00/i)).toBeInTheDocument();
  });

  it('renders a vertical timeline rail with a marker per post', () => {
    const { container } = render(<AnnouncementFeed posts={[withCover, withoutCover]} />);

    const rail = container.querySelector('[aria-hidden="true"].bg-smoke-700\\/60');
    expect(rail).toBeInTheDocument();

    const markers = container.querySelectorAll('[aria-hidden="true"].bg-laser-500');
    expect(markers).toHaveLength(2);
  });

  it('shows gallery images below the body when the post has them', async () => {
    vi.mocked(listPostImages).mockResolvedValueOnce([
      { id: 'img1', postId: 'p1', storagePath: 'p1/gal-a.jpg', position: 0 },
      { id: 'img2', postId: 'p1', storagePath: 'p1/gal-b.jpg', position: 1 },
    ]);

    render(<AnnouncementFeed posts={[withCover]} />);

    const images = await screen.findAllByAltText('Foto de galería');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://cdn.example/p1/gal-a.jpg');
  });
});
