import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ArtifactDownload from '../../src/components/Chat/ArtifactDownload';
import * as chatApi from '../../src/services/chatApi';

vi.mock('../../src/services/chatApi', () => ({
  downloadArtifact: vi.fn(),
}));

const mockedDownload = vi.mocked(chatApi.downloadArtifact);

function fillAndSubmit(fileName: string): void {
  fireEvent.change(screen.getByLabelText('成果物ファイル名'), { target: { value: fileName } });
  fireEvent.click(screen.getByRole('button', { name: /ダウンロード/ }));
}

describe('ArtifactDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom は createObjectURL を持たないため差し替える（ダウンロード操作は実行しない）。
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it("downloads the named artifact for the signed-in user's own area", async () => {
    mockedDownload.mockResolvedValue(new Blob(['data']));

    render(<ArtifactDownload userId="user-a" />);
    fillAndSubmit('report.pdf');

    await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith('user-a', 'report.pdf'));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('shows a safe error message when the download fails', async () => {
    mockedDownload.mockRejectedValue(new Error('boom'));

    render(<ArtifactDownload userId="user-a" />);
    fillAndSubmit('missing.txt');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('disables the affordance until the user id is known', () => {
    render(<ArtifactDownload userId={null} />);
    expect(screen.getByRole('button', { name: /ダウンロード/ })).toBeDisabled();
    expect(screen.getByLabelText('成果物ファイル名')).toBeDisabled();
  });
});
