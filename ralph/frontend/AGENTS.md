# Frontend Agents Guide

Operational guide for Ralph frontend development loop. Keep this brief and focused on HOW to build/run/test.

## Build & Run

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Validation

Run these after implementing to get immediate feedback:

```bash
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

# E2E tests (if configured)
npm run test:e2e
```

## Patterns

*Ralph will document codebase patterns discovered during development:*

- Component structure: TBD
- State management: TBD
- API integration: TBD
- Styling approach: TBD

## Gotchas

*Ralph will document issues encountered and solutions:*

- None documented yet

## Environment

Required environment variables (create `.env.local`):

```
# API endpoint
VITE_API_URL=http://localhost:3001

# Add other required env vars as discovered
```
