import { PublicClientApplication, Configuration } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID || '';
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID || 'common';
const redirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin;

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const apiScope = `api://${clientId}/access_as_user`;

export const loginRequest = {
  scopes: [apiScope],
};
