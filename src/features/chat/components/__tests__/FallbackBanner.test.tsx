import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallbackBanner, type FallbackBannerData } from '../FallbackBanner';

const sampleData: FallbackBannerData = {
  from: 'claude-opus-4',
  to: 'claude-sonnet-4',
  reason: 'rate_limited',
};

describe('FallbackBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when data is null', () => {
    const { container } = render(<FallbackBanner data={null} onDismiss={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('renders model fallback info when data is provided', () => {
    render(<FallbackBanner data={sampleData} onDismiss={vi.fn()} />);
    expect(screen.getByText('claude-opus-4')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4')).toBeInTheDocument();
  });

  it('renders reason label for known reasons', () => {
    render(<FallbackBanner data={sampleData} onDismiss={vi.fn()} />);
    expect(screen.getByText(/limit zapytań/)).toBeInTheDocument();
  });

  it('calls onDismiss when close button clicked', () => {
    const onDismiss = vi.fn();
    render(<FallbackBanner data={sampleData} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Zamknij'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('auto-dismisses after 10 seconds', () => {
    const onDismiss = vi.fn();
    render(<FallbackBanner data={sampleData} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
