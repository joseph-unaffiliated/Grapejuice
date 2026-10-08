import { Platform } from 'react-native';

/**
 * Instagram / Facebook / Messenger / Threads in-app browsers. Google blocks OAuth in these
 * webviews ("disallowed_useragent"), and their storage partitioning breaks the redirect flow.
 */
export function isSocialInAppBrowser(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|FB_IAB|FBIOS|FB4A|Instagram|Messenger|Barcelona/i.test(navigator.userAgent || '');
}

function isAndroidUserAgent(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
}

/** "Safari" on iPhone, otherwise their default browser. */
export function systemBrowserName(): string {
  return isAndroidUserAgent() ? 'your browser' : 'Safari';
}

/**
 * Best-effort jump from an in-app browser to the system browser at the same URL.
 * iOS 17+: `x-safari-https://`. Android: an intent URL (default browser, web fallback).
 * Callers should still show manual instructions — some app versions swallow both.
 */
export function openInSystemBrowser(url: string = window.location.href): void {
  if (typeof window === 'undefined') return;
  const parsed = new URL(url);
  if (isAndroidUserAgent()) {
    const fallback = encodeURIComponent(parsed.href);
    window.location.href = `intent://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}#Intent;scheme=https;S.browser_fallback_url=${fallback};end`;
    return;
  }
  window.location.href = `x-safari-${parsed.href}`;
}
