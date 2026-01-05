# ADR-011 - Database choice

Date: 2025-12-31
Status: accepted

## Context

We need a relational database that supports ACID transactions, strong consistency, and flexible indexing for ledger, Pix, and realtime operations.

## Decision

Use PostgreSQL (15+).

Reasons:

- Strong transactional guarantees for wallet and ledger updates.
- JSONB for storing provider payloads and audit metadata.
- Mature indexing and constraint support.
- Widely supported tooling for migrations and backups.

## Consequences

- Schema changes are managed through migrations.
- Numeric money values are stored in integer cents to avoid floating errors.
