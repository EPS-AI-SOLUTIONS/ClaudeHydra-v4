import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { highlightText, SearchOverlay } from '../SearchOverlay';

const mockMessages = [
  { id: '1', content: 'Hello world' },
  { id: '2', content: 'Goodbye world' },
  { id: '3', content: 'Hello again' },
];

describe('SearchOverlay', () => {
  it('renders the search input', () => {
    render(<SearchOverlay messages={mockMessages} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Search messages')).toBeInTheDocument();
  });

  it('focuses the input on mount', () => {
    render(<SearchOverlay messages={mockMessages} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Search messages')).toHaveFocus();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<SearchOverlay messages={mockMessages} onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText('Search messages'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<SearchOverlay messages={mockMessages} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close search'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has navigation buttons', () => {
    render(<SearchOverlay messages={mockMessages} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Previous match')).toBeInTheDocument();
    expect(screen.getByLabelText('Next match')).toBeInTheDocument();
  });
});

describe('highlightText', () => {
  it('returns text unchanged when query is empty', () => {
    expect(highlightText('Hello world', '')).toBe('Hello world');
  });

  it('returns text unchanged when query is whitespace', () => {
    expect(highlightText('Hello world', '   ')).toBe('Hello world');
  });
});
