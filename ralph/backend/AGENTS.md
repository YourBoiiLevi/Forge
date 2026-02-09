# Backend Agents Guide

Operational guide for Ralph backend development loop. Keep this brief and focused on HOW to build/run/test.

## Build & Run

```bash
# All backend commands run from the backend package directory
cd src/backend

# Install dependencies
npm install

# Development runner (currently a placeholder entrypoint)
npm run dev

# Production build
npm run build

# Start production runner
npm run start
```

## Validation

Run these after implementing to get immediate feedback:

```bash
cd src/backend

# Type checking
npm run typecheck

# Linting
npm run lint

# Fix lint issues automatically
npm run lint:fix

# Unit tests
npm run test

# Tests with coverage
npm run test:coverage

# Integration tests
npm run test:integration
```

## Database

```bash
# Not implemented yet (MVP backend uses filesystem artifacts; no DB required).
```

## Patterns

*Ralph will document codebase patterns discovered during development:*

- API route structure: `src/backend/routes/api-v1.ts`, registered from `createApp()` in `src/backend/server.ts`
- Artifact store: `src/backend/lib/artifact-store.ts` (defaults to repo-root `artifacts/`; override with `FORGE_ARTIFACTS_DIR`)
- DAG utilities: `src/backend/lib/dag/{types,validation,status}.ts` (types, cycle/dangling-dep validation, topo sort, status transitions)
- Database access: TBD
- Authentication: TBD
- Error handling: TBD
- Validation: TBD

## Gotchas

*Ralph will document issues encountered and solutions:*

- None documented yet

## Environment

Required environment variables (create `.env`):

```
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Auth (if applicable)
JWT_SECRET=your-secret-key

# Add other required env vars as discovered
```
