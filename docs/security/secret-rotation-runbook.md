# Secret Rotation Runbook

## Scope
Rotate secrets immediately after any suspected exposure.

## Secrets to rotate
- `DATABASE_URL`
- `BSPAY_TOKEN`
- `BSPAY_CLIENT_ID`
- `BSPAY_CLIENT_SECRET`
- `BSPAY_POSTBACK_URL` (if tokenized URL changed)
- `BACKOFFICE_ACCESS_KEY`
- `AUTH_ACCESS_TOKEN_SECRET`
- `AUTH_REFRESH_TOKEN_SECRET`
- `RUN_JOIN_TOKEN_SECRET`
- `PIX_WEBHOOK_TOKEN`
- `GAME_SERVER_WEBHOOK_KEY`
- `METRICS_INTERNAL_KEY` (if enabled)

## Procedure
1. Generate new values in a password manager or secrets manager.
2. Update Railway variables for each affected service/environment.
3. Deploy services in order:
   - API
   - Game-server
   - Worker
   - Backoffice
   - Mobile (if API contract changed)
4. Validate critical flows:
   - Login/signup/refresh/logout
   - Wallet, deposit, withdrawal, run start
   - Pix webhook acceptance with tokenized URL
   - Backoffice access with new key
5. Revoke old credentials at providers (DB/BSPAY/etc.).
6. Record rotation timestamp and operator in internal changelog.

## Verification checklist
- API rejects old JWT secrets (new logins required).
- Backoffice denies old key.
- Webhook calls without `token` are rejected.
- Game-server events without `x-game-server-key` are rejected.
- `/metrics` is inaccessible publicly in production.
