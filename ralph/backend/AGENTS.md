# Backend Agents Guide

Operational guide for Ralph backend development loop. Keep this brief and focused on HOW to build/run/test.

## Build & Run

```bash
# Install dependencies
npm install

# Development server with hot reload
npm run dev

# Production build
npm run build

# Start production server
npm run start
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

# Integration tests
npm run test:integration
```

## Database

```bash
# Run migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback

# Seed database
npm run db:seed

# Reset database (drop, create, migrate, seed)
npm run db:reset
```

## Patterns

*Ralph will document codebase patterns discovered during development:*

- API route structure: TBD
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
