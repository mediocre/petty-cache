# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

petty-cache is a Node.js cache module that implements a two-level cache (in-memory cache + Redis) with features to avoid cache stampedes and thundering herds. It also includes distributed mutex and semaphore locking primitives.

## Development Commands

### Testing
```bash
# Run tests
npm test

# Run tests with coverage and send to Coveralls
npm run coveralls

# Run a single test file
npx mocha test/index.js
```

### Linting
```bash
# Run ESLint
npx eslint .
```

### Dependencies
```bash
# Install dependencies
npm install
```

## Architecture

### Core Structure
- **Main Entry**: `index.js` - Contains the PettyCache class and all public API methods
- **Test Suite**: `test/index.js` - Comprehensive Mocha test suite testing all cache operations, mutex, and semaphore functionality
- **Dependencies**:
  - `redis` (v3.1.0) - Redis client for distributed caching
  - `memory-cache` (v0.2.0) - In-memory cache for recently accessed data
  - `async` (v3.2.6) - Async utility functions
  - `lock` (v1.1.0) - Local locking mechanism

### Key Design Patterns

1. **Two-Level Caching**: Data is cached in memory for 2-5 seconds to reduce Redis calls, with Redis serving as the distributed cache layer.

2. **Double-Checked Locking**: Cache miss functions are wrapped in double-checked locking to prevent cache stampedes - ensuring the function is only executed once even with concurrent requests.

3. **TTL Jitter**: Default TTL is randomized between 30-60 seconds to prevent thundering herds when many keys expire simultaneously.

4. **Distributed Locking**: 
   - **Mutex**: Single distributed lock with retry capability
   - **Semaphore**: Pool of distributed locks with ability to release or consume slots

### API Methods Structure
- **Cache Operations**: `get`, `set`, `fetch`, `bulkGet`, `bulkSet`, `bulkFetch`, `patch`, `fetchAndRefresh`
- **Mutex Operations**: `mutex.lock`, `mutex.unlock`
- **Semaphore Operations**: `semaphore.retrieveOrCreate`, `semaphore.acquireLock`, `semaphore.releaseLock`, `semaphore.consumeLock`, `semaphore.expand`, `semaphore.reset`

### Testing Requirements
- Tests require a running Redis instance (automatically set up in CI via GitHub Actions)
- Test coverage is tracked via Coveralls
- ESLint is configured with specific rules in `eslint.config.js`

## CI/CD
GitHub Actions workflow (`.github/workflows/test.yml`) runs on push and pull requests:
1. Sets up Node.js 22.17.0
2. Installs dependencies
3. Runs ESLint
4. Sets up Redis 6.0.14
5. Runs tests with coverage
6. Sends Slack notifications on completion