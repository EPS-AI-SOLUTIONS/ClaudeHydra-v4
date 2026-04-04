import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

// Mock @jaskier/ui Skeleton
vi.mock('@jaskier/ui', () => ({
  Skeleton: ({ ...props }: Record<string, unknown>) => <div data-testid="skeleton" {...props} />,
}));

import { ViewSkeleton } from '../ViewSkeleton';

describe('ViewSkeleton', () => {
  it('renders with aria-busy attribute', () => {
    render(<ViewSkeleton />);
    const output = screen.getByRole('status');
    expect(output).toHaveAttribute('aria-busy', 'true');
  });

  it('renders loading view label', () => {
    render(<ViewSkeleton />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading view');
  });

  it('renders multiple skeleton placeholders', () => {
    render(<ViewSkeleton />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });
});
