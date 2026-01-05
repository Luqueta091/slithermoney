# ADR-024 - Backoffice access control

Date: 2026-01-01
Status: accepted

## Context

The backoffice exposes operational data (users, Pix, ledger, runs). We need a minimal access control model that is simple to operate locally and easy to extend when admin actions are added.

## Decision

- Require a role header on every backoffice request: `x-backoffice-role` with values `admin` or `support`.
- Optional shared access key: when `BACKOFFICE_ACCESS_KEY` is configured, requests must include `x-backoffice-key` matching the configured value.
- Optional actor header: `x-backoffice-user-id` is accepted for audit. When it is a valid UUID it is stored as `actor_account_id`; otherwise it is only stored in audit metadata.
- Access policy:
  - `admin`: allowed to access all backoffice endpoints.
  - `support`: allowed to access read-only endpoints.

## Consequences

- Backoffice can be protected without introducing a full auth system yet.
- Every request can be audited with role and actor identifiers.
- The model is extensible for future admin-only actions.
