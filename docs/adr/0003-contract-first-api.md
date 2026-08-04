# ADR 0003: Contract-First Server API

## Status

Accepted

## Context

Kengui currently mirrors server response shapes with hand-written TypeScript.
That is acceptable for a prototype but fragile for AI-maintained repos.

## Decision

`kenkui` OpenAPI under `/v1` is the intended source of truth. Kengui
should generate or contract-test its TypeScript API client from that schema.

## Consequences

- API drift becomes visible in CI.
- Hand-written DTOs in `packages/app/src/api` are temporary.
- Server compatibility changes require explicit versioning.
