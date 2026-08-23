import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pwaOptions } from '../../pwa-options';

// vitest runs from the frontend/ project root (see vitest.config.ts)
const frontendRoot = process.cwd();

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(frontendRoot, relativePath), 'utf-8');
}

function readPngSize(relativePath: string): { width: number; height: number } {
  const buf = readFileSync(path.join(frontendRoot, relativePath));
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG signature
  // IHDR: width at offset 16, height at offset 20 (big-endian)
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe('PWA - vite-plugin-pwa config', () => {
  const manifest = pwaOptions.manifest;
  if (manifest === false || manifest === undefined) {
    throw new Error('pwaOptions.manifest must be configured');
  }

  it('defines the required manifest fields', () => {
    expect(manifest.name).toBe('DoyonChat');
    expect(manifest.short_name).toBe('DoyonChat');
    expect(manifest.description).toBeDefined();
    expect(manifest.lang).toBe('ja');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.theme_color).toBe('#0f172a');
    expect(manifest.background_color).toBe('#f9fafb');
  });

  it('registers any and maskable icons (192 any / 512 any / 512 maskable)', () => {
    const icons = manifest.icons ?? [];
    expect(icons).toHaveLength(3);
    expect(icons).toContainEqual(
      expect.objectContaining({ src: 'icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }),
    );
    expect(icons).toContainEqual(
      expect.objectContaining({ src: 'icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }),
    );
    expect(icons).toContainEqual(
      expect.objectContaining({
        src: 'icons/icon-512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      }),
    );
  });

  it('registers the service worker only in production builds', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate');
    expect(pwaOptions.devOptions?.enabled).toBe(false);
    expect(pwaOptions.includeAssets).toContain('icons/*.png');
  });

  it('precaches app-shell assets and never caches /api (NetworkOnly)', () => {
    const workbox = pwaOptions.workbox;
    expect(workbox).toBeDefined();
    expect(workbox?.globPatterns).toContain('**/*.{js,css,html,ico,png,svg,woff2}');
    expect(workbox?.navigateFallback).toBe('index.html');

    const apiRoute = workbox?.runtimeCaching?.find(
      (entry) => entry.handler === 'NetworkOnly',
    );
    expect(apiRoute).toBeDefined();
    const matcher = apiRoute?.urlPattern as (options: { url: URL }) => boolean;
    expect(matcher({ url: new URL('https://example.com/api/conversations') })).toBe(true);
    expect(matcher({ url: new URL('https://example.com/') })).toBe(false);

    // API navigation must not fall back to the app shell.
    const denylist = workbox?.navigateFallbackDenylist ?? [];
    expect(denylist.some((re) => re.test('/api/conversations'))).toBe(true);
  });
});

describe('PWA - icon assets', () => {
  it('provides 192 / 512 / maskable and apple-touch-icon PNGs', () => {
    const icons = [
      { file: 'public/icons/icon-192x192.png', size: 192 },
      { file: 'public/icons/icon-512x512.png', size: 512 },
      { file: 'public/icons/icon-512x512-maskable.png', size: 512 },
      { file: 'public/icons/apple-touch-icon.png', size: 180 },
    ];
    for (const icon of icons) {
      expect(existsSync(path.join(frontendRoot, icon.file)), `${icon.file} exists`).toBe(true);
      const dims = readPngSize(icon.file);
      expect(dims).toEqual({ width: icon.size, height: icon.size });
    }
  });
});

describe('PWA - index.html iOS meta tags', () => {
  const html = readProjectFile('index.html');

  it('uses viewport-fit=cover for safe-area support', () => {
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });

  it('declares iOS web-app meta tags and apple-touch-icon', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="DoyonChat" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="theme-color" content="#0f172a" />');
  });
});

describe('PWA - safe-area CSS', () => {
  const css = readProjectFile('src/index.css');

  it('adds safe-area padding utilities for the header and input', () => {
    expect(css).toContain('.pt-safe');
    expect(css).toContain('env(safe-area-inset-top');
    expect(css).toContain('.pb-safe');
    expect(css).toContain('env(safe-area-inset-bottom');
  });
});