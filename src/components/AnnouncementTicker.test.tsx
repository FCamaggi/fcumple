import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnnouncementTicker from './AnnouncementTicker';
import type { Post } from '../types';

const posts: Post[] = [
  {
    id: 'p1',
    title: 'Ya salió la lista',
    body: 'Revisen el link, quedan pocos cupos para el +1.',
    publishedAt: '2026-05-01T00:00:00Z',
    createdAt: '2026-04-28T00:00:00Z',
  },
  {
    id: 'p2',
    title: 'Cambio de horario',
    body: 'La previa arranca una hora antes.',
    publishedAt: '2026-05-02T00:00:00Z',
    createdAt: '2026-04-29T00:00:00Z',
  },
];

describe('AnnouncementTicker', () => {
  it('renders nothing when there are no published posts', () => {
    const { container } = render(<AnnouncementTicker posts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the titles of the posts', () => {
    render(<AnnouncementTicker posts={posts} />);

    expect(screen.getAllByText(/ya salió la lista/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cambio de horario/i).length).toBeGreaterThan(0);
  });

  it('expands a post to show its full body when its title is tapped', async () => {
    const user = userEvent.setup();
    render(<AnnouncementTicker posts={posts} />);

    await user.click(screen.getAllByText(/ya salió la lista/i)[0]);

    expect(await screen.findByText(/revisen el link, quedan pocos cupos/i)).toBeInTheDocument();
  });

  it('closes the expanded note when its close control is tapped', async () => {
    const user = userEvent.setup();
    render(<AnnouncementTicker posts={posts} />);

    await user.click(screen.getAllByText(/ya salió la lista/i)[0]);
    expect(await screen.findByText(/revisen el link, quedan pocos cupos/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cerrar aviso/i }));
    await waitFor(() =>
      expect(screen.queryByText(/revisen el link, quedan pocos cupos/i)).not.toBeInTheDocument(),
    );
  });
});
