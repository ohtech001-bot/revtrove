# Firestore API switch

Validation on 2026-10-02: build passed; 19 unit/API contract tests passed. Real Firestore HTTP smoke stopped on a missing product-list index before test records were created. Original document hashes and counts remained unchanged (4 products / 1 order / 1 adminUser). Index creation was explicitly authorized, but all three REST create requests returned 403 PERMISSION_DENIED; no indexes, rules or Vercel settings were changed. Complete index creation and rerun smoke before deployment.

The normal server entry point is now `server/src/index.js`. It uses Firebase Admin repositories only; it does not import `db.js` or open a MySQL connection. No automatic fallback to MySQL is allowed (it would split new orders between databases).

Existing routes, request fields, response fields, bcrypt and JWT logic are retained. SQL DECIMAL values remain strings, JSON fields remain arrays/maps, API `active` is 0/1, and timestamps serialize as UTC ISO strings. Null quote/ETA PATCH values still mean “leave unchanged”, as the old SQL COALESCE did.

Converted routes:
- GET /api/products and /api/products/:slug
- POST /api/orders and /api/custom-orders
- POST /api/admin/login
- GET /api/admin/orders; PATCH /api/admin/orders/:id; POST /api/admin/orders/:id/print

Additional authenticated routes (no frontend changes needed):
- GET /api/admin/me
- GET /api/admin/products/:id; PATCH /api/admin/products/:id; DELETE /api/admin/products/:id
- GET /api/admin/orders/:id

Collections: products/{numeric id}, orders/{public_id}, adminUsers/{numeric id}. New numeric IDs are allocated transactionally in server-only internalSequences/products and internalSequences/orders, seeded from the existing maximum. Existing IDs are not changed. These metadata documents contain no customer information and are denied to browser clients by the catch-all rules.

Products use active=true queries and cursor paging. Order lists use status equality or status IN the non-archived statuses, then created_at DESC and document ID ASC, with at most 500 results. Firestore has no SQL LIKE; substring search examines only status-filtered pages of up to 500, until 500 matches or exhaustion. It can therefore read many matching-status documents for sparse searches; use a dedicated search index if the order volume grows. No unfiltered collection read is used by runtime endpoints.

Required composite indexes are in firestore.indexes.json:
- products: active ASC, created_at DESC, __name__ ASC
- products: slug ASC, active ASC
- orders: status ASC, created_at DESC, __name__ ASC

Creating indexes requires Cloud Datastore Index Admin permissions or a human Console owner. Normal runtime only requires Firestore data access. Do not grant permanent Owner privileges to the server. Missing indexes return a sanitized 503 firestore_configuration, not a silent full-scan fallback.

Local verification:
```powershell
npm test
npm run build
node server/scripts/smoke-firestore-api.js --project revtrove-web --apply
```

The smoke script uses real local Express HTTP + real Firestore, test-only printing, and uniquely tagged temporary records. It cleans only its own records, checks original document hashes and counts, and retains monotonic sequence metadata to avoid ID reuse. It never writes MySQL.

Rollback: stop the Firestore server and run `node server/src/mysql-api.rollback.js` from the project root. This is a manual emergency entry point, not a concurrent secondary server. MySQL config/init/catalog scripts, Docker, volumes and backups are retained. **After new Firestore orders exist, first reconcile/export them; switching back blindly would hide those orders.** Catalog sync/db:init still target legacy MySQL and must not be used to manage the live Firestore catalog.

No Vercel settings or deployment have been changed. Backend deployment additionally needs the server-only Firebase credentials, JWT_SECRET and a supported Express entry point. Existing local uploads and the print queue/physical printer are not durable in a serverless filesystem; persistent asset storage and a local print agent must be planned before deploying those features. This switch does not solve those pre-existing hosting constraints.
