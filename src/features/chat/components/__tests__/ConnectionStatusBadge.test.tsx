import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionStatusBadge } from '../ConnectionStatusBadge';

describe('ConnectionStatusBadge', () => {
  it('renders connected state with Wifi icon', () => {
    const { container } = render(
      <ConnectionStatusBadge connectionStatus="connected" connectionGaveUp={false} onReconnect={vi.fn()} />,
    );
    expect(container.querySelector('[title="WebSocket connected"]')).toBeInTheDocument();
  });

  it('renders disconnected state with label', () => {
    render(<ConnectionStatusBadge connectionStatus="disconnected" connectionGaveUp={false} onReconnect={vi.fn()} />);
    expect(screen.getByText('WS Disconnected')).toBeInTheDocument();
  });

  it('renders reconnecting state with label', () => {
    render(<ConnectionStatusBadge connectionStatus="reconnecting" connectionGaveUp={false} onReconnect={vi.fn()} />);
    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
  });

  it('shows Retry button when connection gave up', () => {
    render(<ConnectionStatusBadge connectionStatus="disconnected" connectionGaveUp={true} onReconnect={vi.fn()} />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('does not show Retry button when not gave up', () => {
    render(<ConnectionStatusBadge connectionStatus="disconnected" connectionGaveUp={false} onReconnect={vi.fn()} />);
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });

  it('calls onReconnect when Retry is clicked', () => {
    const onReconnect = vi.fn();
    render(<ConnectionStatusBadge connectionStatus="disconnected" connectionGaveUp={true} onReconnect={onReconnect} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});
