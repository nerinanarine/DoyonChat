import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, Configuration } from '@azure/msal-browser';
import LoginPage from '../../src/components/Auth/LoginPage';

const mockConfig: Configuration = {
  auth: {
    clientId: 'test-client-id',
    authority: 'https://login.microsoftonline.com/common',
  },
};

const mockInstance = new PublicClientApplication(mockConfig);

vi.spyOn(mockInstance, 'loginRedirect').mockImplementation(() => Promise.resolve());

describe('LoginPage', () => {
  it('renders login button', () => {
    render(
      <MsalProvider instance={mockInstance}>
        <LoginPage />
      </MsalProvider>
    );

    expect(screen.getByText('DoyonChat')).toBeInTheDocument();
    expect(screen.getByText('Microsoft アカウントでログインしてください')).toBeInTheDocument();
    expect(screen.getByText('Microsoft でログイン')).toBeInTheDocument();
  });

  it('calls loginRedirect when button is clicked', () => {
    render(
      <MsalProvider instance={mockInstance}>
        <LoginPage />
      </MsalProvider>
    );

    const button = screen.getByText('Microsoft でログイン');
    fireEvent.click(button);

    expect(mockInstance.loginRedirect).toHaveBeenCalled();
  });
});
