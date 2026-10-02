# Custom orders and archived order retention

- Configure length, width and height limits (cm) from Admin → Settings. Blank limits mean no business limit (technical validation cap: 10,000 cm).
- Customers can attach 1–3 JPEG/PNG/WebP images, each up to 8 MiB. All uploads remain private and admin-only.
- `reference_image` retains the first image for legacy compatibility; `reference_images` stores up to three API file references. `details.dimensions` contains optional requested dimensions.
- `display_id` (ord + original numeric id) is an API display field. Existing public IDs, Firestore document IDs and API URLs remain unchanged.
- Admin can print all attached images with the browser print dialog, one per A4 page. Normal invoices include custom dimensions instead of wheel text fields.
- Archive cleanup is scheduled daily by Vercel (`0 2 * * *`, UTC) at `/api/maintenance/archive`. Add a strong server-only `CRON_SECRET` to Vercel before deploying. Vercel sends it as a Bearer token. No secret is included in source or frontend.
- The 60-day clock starts at `archived_at`. Legacy archives use `updated_at`; records with unknown dates are retained. Daily execution means cleanup occurs in the first run after 60 days.
- Cleanup permanently deletes order personal data and exclusively-owned Blob reference images/metadata, never products or shared files. It is retryable after Blob failures. Production cleanup was NOT run during implementation/testing. Existing archives older than 60 days become eligible after deployment.
- Purging orders cannot be edited/restored while file cleanup is underway. Failed runs return an error and retain the order for retry.
- No Firestore rules or existing production records were changed. This code uses the existing server-only Admin SDK.
