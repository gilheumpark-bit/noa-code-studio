// ============================================================
// CSP Proxy (Next.js 16+) — single request hook; do not add `middleware.ts`
// ============================================================
// Dev: Turbopack runs this proxy. Static `output: 'export'` builds skip it; Electron main may add COOP+COEP.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============================================================
// CSP Directives
// ============================================================

function buildCSPHeader(isCodeStudio: boolean, isDevelopment: boolean): string {
  const allowUnsafeEval = isCodeStudio || isDevelopment;
  const scriptSrc = allowUnsafeEval
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://cdn.jsdelivr.net https://va.vercel-scripts.com https://vercel.live`
    : `script-src 'self' 'unsafe-inline' https://apis.google.com https://cdn.jsdelivr.net https://va.vercel-scripts.com https://vercel.live`;

  // style-src: 'unsafe-inline' is required — Next.js injects inline <style> tags
  // for CSS Modules and Tailwind, and nonce-based style-src needs fully dynamic
  // rendering (incompatible with static generation). This is the accepted trade-off
  // for a statically-generated site. Nonce migration would require switching to
  // fully dynamic rendering across all pages.
  const styleSrc = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net";

  const directives = [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    `connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.groq.com https://api.mistral.ai https://www.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.firebaseapp.com https://apis.google.com https://cdn.jsdelivr.net https://firestore.googleapis.com https://*.googleapis.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.ingest.us.sentry.io${isCodeStudio ? ' https://*.webcontainer.io wss://*.webcontainer.io' : ''}`,
    `frame-src 'self' https://accounts.google.com https://*.firebaseapp.com${isCodeStudio ? ' https://*.webcontainer.io https://*.webcontainer.app http://localhost:*' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
  ];

  return directives.join('; ');
}

// ============================================================
// Proxy
// ============================================================

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isCodeStudio = pathname.startsWith('/code-studio');
  const isDevelopment = process.env.NODE_ENV !== 'production';

  const cspHeader = buildCSPHeader(isCodeStudio, isDevelopment);

  const response = NextResponse.next();

  // Set CSP header on the response
  response.headers.set('Content-Security-Policy', cspHeader);

  // Security headers (previously in next.config.ts headers())
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', isCodeStudio ? 'SAMEORIGIN' : 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // Cross-origin isolation for Code Studio (WebContainer). Only in production:
  // Next dev + Turbopack/HMR + Electron reload can break with COEP on localhost.
  // Packaged Electron still applies COOP+COEP in main process when isProd.
  if (isCodeStudio && process.env.NODE_ENV === "production") {
    response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  }

  return response;
}

export const config = {
  matcher: [
    // Match all request paths except:
    // - _next/static (static files)
    // - _next/image (image optimization)
    // - favicon.ico, icon, apple-icon (app icons)
    // - manifest.webmanifest
    // - images directory (static assets)
    // - API routes (they set their own headers)
    '/((?!_next/static|_next/image|favicon\\.ico|icon|apple-icon|manifest\\.webmanifest|images/|api/).*)',
  ],
};
