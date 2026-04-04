import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompletionFeedback } from '../CompletionFeedback';

describe('CompletionFeedback', () => {
  it('renders children', () => {
    render(
      <CompletionFeedback flashActive={false}>
        <span>Hello</span>
      </CompletionFeedback>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('has the chat-view testid', () => {
    render(
      <CompletionFeedback flashActive={false}>
        <span>Content</span>
      </CompletionFeedback>,
    );
    expect(screen.getByTestId('chat-view')).toBeInTheDocument();
  });

  it('adds completion-flash class when flashActive is true', () => {
    render(
      <CompletionFeedback flashActive={true}>
        <span>Flash</span>
      </CompletionFeedback>,
    );
    const el = screen.getByTestId('chat-view');
    expect(el.className).toContain('completion-flash');
  });

  it('does not add completion-flash class when flashActive is false', () => {
    render(
      <CompletionFeedback flashActive={false}>
        <span>No flash</span>
      </CompletionFeedback>,
    );
    const el = screen.getByTestId('chat-view');
    expect(el.className).not.toContain('completion-flash');
  });

  it('applies custom className', () => {
    render(
      <CompletionFeedback flashActive={false} className="my-custom-class">
        <span>Styled</span>
      </CompletionFeedback>,
    );
    const el = screen.getByTestId('chat-view');
    expect(el.className).toContain('my-custom-class');
  });
});
