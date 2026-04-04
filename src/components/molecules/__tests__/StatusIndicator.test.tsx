import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusIndicator } from '../StatusIndicator';

// motion/react auto-mock: framer-motion animations are NOPs in jsdom
vi.mock('motion/react', () => ({
  motion: {
    span: ({ children, ...props }: Record<string, unknown>) => (
      <span {...props}>{children as React.ReactNode}</span>
    ),
  },
}));

describe('StatusIndicator', () => {
  it('renders with default offline status', () => {
    render(<StatusIndicator />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'offline');
  });

  it('renders label when provided', () => {
    render(<StatusIndicator status="online" label="Connected" />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('sets aria-label from label prop', () => {
    render(<StatusIndicator status="error" label="Error detected" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Error detected',
    );
  });

  it('renders all status states without crashing', () => {
    const states = ['online', 'offline', 'pending', 'error'] as const;
    for (const status of states) {
      const { unmount } = render(
        <StatusIndicator status={status} label={status} />,
      );
      expect(screen.getByText(status)).toBeInTheDocument();
      unmount();
    }
  });

  it('applies custom className', () => {
    render(<StatusIndicator className="custom-class" />);
    expect(screen.getByRole('status').className).toContain('custom-class');
  });
});
