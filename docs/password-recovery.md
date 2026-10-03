# Administrator recovery and remembered login

The store owner's recovery inbox is `Rev.trove.911@gmail.com`. It may differ from
the existing login email; if it does, recovery targets the sole existing administrator.
With multiple administrator accounts, recovery must match that email explicitly.
No existing account email or password is changed during setup.

Server-only production environment:

- `RESEND_API_KEY`: email sending API key.
- `MAIL_FROM`: an address on your verified Resend sender domain.
- `PASSWORD_RESET_URL`: canonical origin, e.g. `https://revtrove.vercel.app`.
- Existing `JWT_SECRET` and Firebase Admin environment remain required.

Never put these email secrets in `VITE_` variables. No live email is sent in tests.
Reset tokens expire after 30 minutes, are stored hashed, and are consumed atomically.
Resetting the password revokes existing administrator sessions. Enable Firestore TTL
on `adminPasswordResets.expiresAt` to remove expired unused tokens; the existing
default-deny Firestore rules keep this collection inaccessible to browser clients.
Reset links use the configured origin, never a user-supplied host header.

Remembered sessions use a server-issued JWT valid for 24 hours, stored in localStorage.
Normal sessions retain the existing 8-hour JWT and sessionStorage. Closing/reopening
the browser does not extend either deadline. Expired tokens are rejected by the server
and cleared by the frontend. Use Remember me only on a trusted personal device.
