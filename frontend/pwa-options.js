/**
 * PWA options shared between `vite.config.ts` and unit tests.
 * Single source of truth for manifest and Service Worker behavior.
 */
export var pwaOptions = {
    registerType: 'autoUpdate',
    includeAssets: ['icons/*.png'],
    manifest: {
        name: 'DoyonChat',
        short_name: 'DoyonChat',
        description: 'DoyonChat - AI chat',
        lang: 'ja',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#0f172a',
        background_color: '#f9fafb',
        icons: [
            {
                src: 'icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: 'icons/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: 'icons/icon-512x512-maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    },
    workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // Never treat API navigation as an app-shell fallback.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
            {
                // API responses (with auth headers) must never be cached.
                urlPattern: function (_a) {
                    var url = _a.url;
                    return url.pathname.startsWith('/api/');
                },
                handler: 'NetworkOnly',
            },
        ],
    },
    devOptions: {
        enabled: false,
    },
};
