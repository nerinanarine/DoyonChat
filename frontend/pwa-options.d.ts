import type { VitePWAOptions } from 'vite-plugin-pwa';
/**
 * PWA options shared between `vite.config.ts` and unit tests.
 * Single source of truth for manifest and Service Worker behavior.
 */
export declare const pwaOptions: Partial<VitePWAOptions>;
