import posthog from 'posthog-js';
import { isDemoMode } from './store';

export function initAnalytics(optedOut: boolean) {
  if (import.meta.env.DEV) return;
  posthog.init('phc_uUyMDduPkC3iGGFQhNc32if9GCPydvn8KN2GNesKPPyo', {
    api_host: 'https://eu.i.posthog.com',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: 'localStorage',
  });
  // Super property — auto-attached to every capture() call below, so every event
  // (including ones fired from tools that don't know about isDemoMode) is tagged
  // without having to touch each track() call site individually.
  posthog.register({ platform: isDemoMode ? 'web_demo' : 'desktop' });
  if (optedOut) posthog.opt_out_capturing();
}

export function setOptOut(value: boolean) {
  if (value) posthog.opt_out_capturing();
  else posthog.opt_in_capturing();
}

export function track(event: string, properties?: Record<string, unknown>) {
  try { posthog.capture(event, properties); } catch {}
}
