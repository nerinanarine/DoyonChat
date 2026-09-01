import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingState from '../../src/components/Common/LoadingState';

describe('LoadingState', () => {
  it('is announced to assistive technology with role=status and a label', () => {
    render(<LoadingState label="モデル情報を読み込み中" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('モデル情報を読み込み中');
  });
});