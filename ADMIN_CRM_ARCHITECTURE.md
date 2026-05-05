# Admin + CRM Architecture

## Goal

One operational entry point for administrators with isolated runtime modules to reduce regressions.

## Rules

1. `admin-panel.html` is the single operator portal.
2. Do not merge `admin-panel.js`, `admin-product-cards.js`, `crm.js`, `crm-sales.js` into one file.
3. `admin-panel.html` must load `admin-runtime-loader.js` instead of direct admin runtime scripts.
4. `crm-sales.html` must load `crm-sales-runtime-loader.js` instead of direct `crm-sales.js`.
5. `crm.html` remains the standalone CRM page for non-admin staff roles.
6. Sensitive admin runtime files are served only through `/api/admin/runtime-script/:name` with `auth + admin role`.
7. Direct static access to admin runtime files must remain blocked at server level.

## Why This Is Mandatory

- Limits blast radius between CRM and admin features.
- Keeps debugging, review, and rollback localized.
- Reduces global-state collisions in legacy script runtime.
- Preserves long-term delivery speed while keeping one UX portal.

## Automated Guard

Boundary checks run from `scripts/check-admin-crm-boundaries.mjs` and are enforced by `npm run verify` / `npm run ci:check`.
