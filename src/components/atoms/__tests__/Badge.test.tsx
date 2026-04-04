import { Badge } from '@jaskier/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toContain('border');
    expect(badge.className).toContain('rounded-full');
  });

  it('applies success variant classes', () => {
    render(<Badge variant="success">OK</Badge>);
    const badge = screen.getByText('OK');
    expect(badge.className).toContain('text-emerald-400');
  });

  it('applies error variant classes', () => {
    render(<Badge variant="error">Fail</Badge>);
    const badge = screen.getByText('Fail');
    expect(badge.className).toContain('matrix-error');
  });

  it('applies warning variant classes', () => {
    render(<Badge variant="warning">Warn</Badge>);
    const badge = screen.getByText('Warn');
    expect(badge.className).toContain('text-amber-400');
  });
});
