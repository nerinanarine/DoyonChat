import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CollapsibleReasoning from '../../src/components/Chat/CollapsibleReasoning';

describe('CollapsibleReasoning', () => {
  it('is collapsed by default and can be expanded', () => {
    render(<CollapsibleReasoning reasoning="検討しました。" />);

    const button = screen.getByRole('button', { name: /思考プロセス/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('検討しました。')).not.toBeInTheDocument();
    expect(button).toHaveTextContent('🤔 思考プロセス（7文字）');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('検討しました。')).toBeInTheDocument();
  });

  it('does not render when reasoning is empty', () => {
    const { container } = render(<CollapsibleReasoning reasoning="" />);

    expect(container).toBeEmptyDOMElement();
  });
});
