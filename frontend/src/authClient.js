import { createAuthClient } from 'better-auth/react';

// Same-origin: /api/auth is proxied to the backend (Vite in dev, vercel.json in production)
export const authClient = createAuthClient({
  baseURL: window.location.origin
});
