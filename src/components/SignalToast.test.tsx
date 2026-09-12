import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignalToast from './SignalToast';

beforeEach(() => {
  // Fake only setTimeout/clearTimeout -- leaving requestAnimationFrame real
  // so Framer Motion's own animations (unrelated to the dismiss timer under
  // test) don't hang waiting on a rAF tick that fake timers never fires.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SignalToast auto-dismiss', () => {
  it('calls onDismiss on its own after ~4.5s', () => {
    const onDismiss = vi.fn();
    render(<SignalToast message="Quedaste dentro. Nos vemos ahí." kind="success" onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4500);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not call onDismiss before the timer elapses', () => {
    const onDismiss = vi.fn();
    render(<SignalToast message="Quedaste dentro. Nos vemos ahí." kind="success" onDismiss={onDismiss} />);

    vi.advanceTimersByTime(3000);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('pauses the timer while the toast is hovered', () => {
    const onDismiss = vi.fn();
    render(<SignalToast message="Quedaste dentro. Nos vemos ahí." kind="success" onDismiss={onDismiss} />);

    fireEvent.mouseEnter(screen.getByRole('status'));
    vi.advanceTimersByTime(10_000);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('resumes the timer after the pointer leaves', () => {
    const onDismiss = vi.fn();
    render(<SignalToast message="Quedaste dentro. Nos vemos ahí." kind="success" onDismiss={onDismiss} />);

    fireEvent.mouseEnter(screen.getByRole('status'));
    vi.advanceTimersByTime(10_000);
    fireEvent.mouseLeave(screen.getByRole('status'));
    vi.advanceTimersByTime(4500);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pauses the timer while the toast is touched (mobile tap, no mouse events)', () => {
    const onDismiss = vi.fn();
    render(<SignalToast message="Quedaste dentro. Nos vemos ahí." kind="success" onDismiss={onDismiss} />);

    fireEvent.touchStart(screen.getByRole('status'));
    vi.advanceTimersByTime(10_000);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('resumes the timer after the touch ends', () => {
    const onDismiss = vi.fn();
    render(<SignalToast message="Quedaste dentro. Nos vemos ahí." kind="success" onDismiss={onDismiss} />);

    fireEvent.touchStart(screen.getByRole('status'));
    vi.advanceTimersByTime(10_000);
    fireEvent.touchEnd(screen.getByRole('status'));
    vi.advanceTimersByTime(4500);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not start a timer when there is no message', () => {
    const onDismiss = vi.fn();
    render(<SignalToast message={null} kind="success" onDismiss={onDismiss} />);

    vi.advanceTimersByTime(10_000);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('restarts the timer when a new message replaces the current one', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <SignalToast message="Quedaste dentro. Nos vemos ahí." kind="success" onDismiss={onDismiss} />,
    );

    vi.advanceTimersByTime(4000);
    rerender(<SignalToast message="Otro aviso" kind="info" onDismiss={onDismiss} />);
    vi.advanceTimersByTime(4000);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
