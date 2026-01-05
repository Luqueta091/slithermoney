# ADR-002 - Naming conventions

Date: 2025-12-31
Status: accepted

## Context

Consistent naming prevents drift and keeps modules predictable across teams.

## Decision

- Directories use `kebab-case`.
- Module folders use plural nouns (ex: `carteiras`, `runs`).
- File suffixes identify intent:
  - `.controller`
  - `.service`
  - `.repository`
  - `.entity`
  - `.dto`
  - `.event`
- Max recommended depth: 4 levels from `src/`.

## Consequences

- Paths and imports are predictable.
- Reviewers can infer responsibilities quickly.
