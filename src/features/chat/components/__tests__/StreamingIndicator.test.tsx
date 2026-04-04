import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StreamingIndicator } from '../StreamingIndicator';

describe('StreamingIndicator', () => {
  it('renders the streaming bar when isStreaming is true', () => {
    render(<StreamingIndicator isStreaming={true} />);
    expect(screen.getByTestId('chat-streaming-bar')).toBeInTheDocument();
  });

  it('does not render anything when isStreaming is false', () => {
    const { container } = render(<StreamingIndicator isStreaming={false} />);
    expect(container.innerHTML).toBe('');
  });
});
