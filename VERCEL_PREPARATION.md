# Vercel preparation: Blob + Firestore + browser printing

No deployment, remote environment updates, MySQL changes or data migration occurred.

## Runtime and variables

Repository root is the Vercel Root Directory. React/Vite builds client/dist; api/index.js exports Express on Node24 without app.listen in serverless mode. API URLs, static assets and SPA fallback remain separated in vercel.json.

Storage authentication is **project OIDC**, using @vercel/blob 2.8.0 (verified latest at implementation). Keep BLOB_STORE_ID from the connected Private store and BLOB_WEBHOOK_PUBLIC_KEY from the connection. Vercel supplies/rotates VERCEL_OIDC_TOKEN in its runtime; do not manually create a Production token. SDK calls pass storeId only: the SDK resolves and refreshes OIDC itself. No BLOB_READ_WRITE_TOKEN is required or provisioned. No Blob/OIDC variable may have a VITE_ prefix or enter client/.env.local. The SDK can fall back to an existing read-write token outside OIDC, but this project's documented path uses OIDC with no fixed secret. Do not add an explicit token/oidcToken option, which would override SDK-managed authentication.

This direct presigned PUT + explicit finalize flow does not use handleUpload (which needs a fixed signing secret) or webhook callbacks. BLOB_WEBHOOK_PUBLIC_KEY is retained for the project connection but is not consumed by the current flow.

Existing server variables remain: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, JWT_SECRET, CLIENT_URL. Optional REVERSE_GEOCODER_URL. Existing six VITE_FIREBASE_* web configuration values and optional VITE_GOOGLE_MAPS_API_KEY remain as before. FIREBASE_STORAGE_BUCKET is no longer used. VITE_FIREBASE_STORAGE_BUCKET may remain in Firebase web config, but is not used for file uploads.

Verify the existing store is Private and connected to the correct Vercel project for Production and Development; enable Preview only as intended. No manually created storage secret is necessary. Do not create a Public store: reference images contain private customer information. Use a separate store/project for Preview where possible. No storage resource/token is guessed or provisioned automatically.

Secrets and backups remain ignored and excluded from function bundles. Historical Firebase storage.rules / storage.cors.example.json / storage.lifecycle.example.json are unused; firebase.json no longer deploys Storage configuration. They are retained for review only, not applied.

## File inventory and direct flow

| Owner | File | Limit | Existing Firestore reference |
| --- | --- | --- | --- |
| Customer | JPEG / PNG / WebP reference | 8 MiB | orders.reference_image |
| Admin JWT | JPEG / PNG / WebP product image | 30 MiB | products.images |
| Admin JWT | GLB v2 | 30 MiB | products.model_parts.rim |

Static catalog files remain client/public build assets. No local filesystem upload is accepted; legacy /uploads returns 410 and existing local files/data are not deleted.

POST /api/uploads preserves validation/ownership and returns a ten-minute presigned PUT URL, headers, random asset ID and opaque claim. The backend uses SDK-managed project OIDC with @vercel/blob issueSignedToken + presignUrl to restrict the exact pathname, MIME and maximum size. Overwrite is forbidden. Signing material and the read-write token never leave the backend. Browser fetch uploads raw bytes directly to Blob, beyond Vercel Function's 4.5MB payload limit.

POST /api/uploads/:id/complete verifies private Blob metadata, exact declared size, content type and image/GLB header. It stores provider, access, storagePath, blobUrl, etag and metadata in uploadAssets; no file bytes are in Firestore. Existing product/custom-order endpoints receive JSON claims and atomically attach them with record creation. Existing fields keep stable /api/files/{id} API URLs. Do not trust a client-provided Blob URL or path.

GET /api/files/:id checks attachment and product activity; private custom-order references additionally require the existing admin JWT. It redirects to a five-minute private presigned GET, or returns {url} for authenticated UI resolution. Images and models download directly from Blob, not through the function. Treat signed URLs as temporary bearer capabilities and do not log/cache/share them.

DELETE /api/uploads/:id checks the claim/admin and only removes unattached pending/ready assets at the server-generated path, with an ETag-conditional delete. Attached files are retained even after product removal: no automatic deletion of potentially shared files. Provider metadata from another backend is rejected rather than silently migrated/deleted.

An upload grant can remain valid after cleanup until its ten-minute expiry. Replays cannot overwrite a present asset, but can recreate a deleted unattached object while the grant is alive. Such private orphan paths are inaccessible through the API and need a future cautious cleanup job after expiry, checking all live references. No scheduled job or broad deletion was introduced. Anonymous upload issuance retains the durable hourly IP quota; add CAPTCHA/billing monitoring before unrestricted high-traffic use. General Express rate limits/geocoder cache remain process-local.

Blob has no Firebase Security Rules. Store-level Private access plus server auth and narrowly scoped signed capabilities enforce access. The SDK supplies the Blob CORS behavior; Google Cloud bucket CORS/IAM/lifecycle setup is no longer needed. CSP allows the current SDK's upload API at https://vercel.com/api/blob/ and private Blob download domains.

## Browser printing unchanged

Printing uses window.print in the current page, an escaped A4 receipt and @media print hiding all application UI. Arabic/Hebrew RTL and English LTR remain. No Windows agent, PRINT_COMMAND, queue files or print_status updates are used by the primary runtime. Historical fields/files are preserved.

## Verification

Run npm test and npm run build.

For local OIDC testing (no deployment), run from repository root:
npx vercel login
npx vercel link
npx vercel env pull .env.vercel.local --environment=development

Skip login/link when already authenticated/linked. Select the existing project, not a new project. This pull writes a server-only ignored file; it must not overwrite root .env or client/.env.local. The Development connection must be enabled. Do not paste or log pulled contents. Vercel CLI credentials allow the SDK to refresh the temporary Development OIDC token.

Real upload/read/private-access/reference/delete/cleanup test:
node --env-file=.env.vercel.local server/scripts/smoke-storage.js --project revtrove-web --apply

Node24 loads the pulled env before imports; the existing dotenv loader fills missing values from root .env without overriding them. Confirm pulled FIREBASE_PROJECT_ID is revtrove-web; the script checks it and refuses unexpected original counts. Root .env must still supply local Firebase Admin/JWT when Development does not provide them.

To test the frontend locally, run in separate terminals:
node --env-file=.env.vercel.local server/src/index.js
npm run dev -w client

Vite proxies /api to local Express. vercel dev is optional for testing actual Vercel routing instead; it is not required for OIDC after env pull. Do not deploy Production to obtain a test token. Development OIDC is normally valid for 12 hours and the SDK refreshes using CLI credentials. If refresh fails, log in again and repull Development variables. Do not use a manually copied Production OIDC token.

Production OIDC support is implemented and covered by local mocks, but live Production authentication cannot be claimed verified without running the modified code on Vercel. No Production or Preview deployment was performed.

The script requires SDK-managed local OIDC plus BLOB_STORE_ID and original Firestore counts 4/1/1, uploads a synthetic PNG, verifies unsigned reads are rejected, resolves/reads via API preview, verifies stored reference, deletes its own asset/metadata/quota, and compares original records by hash. It never logs the read-write token or signed URLs. Without the local project/OIDC configuration it exits before any writes. A real browser upload should also be checked before deployment.

Local API regression:
node server/scripts/smoke-firestore-api.js --project revtrove-web --apply

Local mocked tests cover scoped private capabilities, MIME/size/GLB validation, replay protection, ownership/atomic attachment, private reference access, safe deletion, API compatibility and browser printing. Passing mocks is not proof of a configured/live Blob store.

The build has an existing large-chunk warning. npm audit reports existing Firebase/grpc-related dependency alerts; no forced Firebase downgrade or unrelated destructive dependency change was performed.

References: [Vercel Signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls), [Private Blob storage](https://vercel.com/docs/vercel-blob/private-storage), [SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).
