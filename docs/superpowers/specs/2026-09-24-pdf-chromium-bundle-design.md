# PDF Chromium Bundle Fix Design

## Problem

The production quote PDF endpoint fails before launching Chromium because the Vercel function bundle contains the JavaScript files from `@sparticuz/chromium` but omits its runtime assets under `node_modules/@sparticuz/chromium/bin/`.

Observed production error:

```text
The input directory "/var/task/node_modules/@sparticuz/chromium/bin" does not exist.
```

The local Next.js trace for `app/api/quotes/[id]/render/route.ts` confirms that it includes the package's `build/*.js` and `package.json`, but none of the four compressed runtime assets in `bin/`.

## Chosen Approach

Keep the existing browser launcher, PDF renderer, API contract, storage upload, and client actions unchanged. Extend `outputFileTracingIncludes` in `next.config.mjs` so every server route that can call `renderQuoteBuffer()` explicitly includes:

```text
node_modules/@sparticuz/chromium/bin/**
```

The include applies to both:

- `/api/quotes/**` for direct quote preview/PDF generation.
- `/api/olivia/**` because the Olivia quote publishing tool shares the same renderer.

`@sparticuz/chromium` and `playwright-core` remain in `serverExternalPackages`; removing externalization would be a broader bundler behavior change and does not guarantee that non-JavaScript runtime assets are traced.

## Data Flow

1. The existing API loads the quote from Supabase.
2. `renderQuoteBuffer()` imports Playwright and `@sparticuz/chromium`.
3. `chromium.executablePath()` extracts the bundled compressed assets from `bin/`.
4. The existing print route is rendered to PDF or PNG.
5. The existing upload and signed-URL response continue unchanged.

## Error Handling

No client or API error contract changes are required. Existing errors continue to be returned by the quote render route. The fix removes the missing-runtime-assets failure at browser launch.

## Verification

1. Run the project typecheck and relevant tests.
2. Run a production build.
3. Inspect the quote render route's `.nft.json` and confirm all expected `@sparticuz/chromium/bin` assets are traced.
4. Deploy to production.
5. Generate a quote PDF in production and confirm the existing download flow succeeds.

## Non-Goals

- No changes to quote layout, content, approval, sharing, or download behavior.
- No replacement of Playwright or Chromium.
- No remote browser service.
- No desktop or mobile UI changes.
