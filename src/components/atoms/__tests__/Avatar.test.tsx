import { Avatar } from '@jaskier/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('Avatar', () => {
  it('renders image when src is provided', () => {
    render(<Avatar src="https://example.com/avatar.jpg" name="John Doe" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('renders initials when no src is provided', () => {
    render(<Avatar name="John Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders single initial for single-word name', () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('falls back to initials when image fails to load', () => {
    render(<Avatar src="bad-url.jpg" name="Jane Smith" />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('uses custom initials when provided', () => {
    render(<Avatar name="John Doe" initials="X" />);
    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('renders ? when no name or initials provided', () => {
    render(<Avatar />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
