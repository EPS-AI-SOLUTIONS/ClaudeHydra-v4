import { Card, CardBody, CardFooter, CardHeader } from '@jaskier/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies backdrop-blur styling with glass variant', () => {
    render(
      <Card data-testid="card" variant="glass">
        Test
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('backdrop-blur');
  });

  it('applies custom className', () => {
    render(
      <Card data-testid="card" className="custom-class">
        Test
      </Card>,
    );
    expect(screen.getByTestId('card').className).toContain('custom-class');
  });
});

describe('Card composition', () => {
  it('renders header, body, footer slots', () => {
    render(
      <Card>
        <CardHeader data-testid="header">Header</CardHeader>
        <CardBody data-testid="body">Body</CardBody>
        <CardFooter data-testid="footer">Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByTestId('header')).toHaveTextContent('Header');
    expect(screen.getByTestId('body')).toHaveTextContent('Body');
    expect(screen.getByTestId('footer')).toHaveTextContent('Footer');
  });

  it('CardHeader has border-bottom styling', () => {
    render(<CardHeader data-testid="header">H</CardHeader>);
    expect(screen.getByTestId('header').className).toContain('border-b');
  });
});
