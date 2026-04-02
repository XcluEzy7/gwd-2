#!/usr/bin/env node
/**
 * build-stage-error.js
 *
 * Emits a staged error message for build/install failures with actionable guidance.
 * Used by justfile recipes to provide clear diagnostics when stages fail.
 *
 * Usage:
 *   node scripts/build-stage-error.js <stage> [error-context...]
 *
 * Stages:
 *   - runtime-build: root CLI/runtime build failed
 *   - extra-workspace: daemon/mcp-server/rpc-client build failed
 *   - pack-validation: npm pack/install validation failed
 *   - global-link: npm link or gsd:install-global failed
 */

const STAGE_INFO = {
  'runtime-build': {
    label: 'Runtime build failed',
    hint: 'Run `npm run build` directly for full output, or `npm run build -w @gsd/<package>` for a specific workspace.',
    likelyCause: 'TypeScript errors, missing dependencies, or stale dist/ files.',
  },
  'extra-workspace': {
    label: 'Extra workspace build failed',
    hint: 'These packages (daemon, mcp-server, rpc-client) are separately published and not required for root CLI. You can skip this check if not working on them.',
    likelyCause: 'TypeScript errors or missing dependencies in the specific workspace.',
  },
  'pack-validation': {
    label: 'Pack/install validation failed',
    hint: 'Run `npm run validate-pack` directly for details. Common fix: ensure workspace packages have dist/ built and no @gsd/* cross-deps.',
    likelyCause: 'Missing files in tarball, broken workspace symlinks, or runtime resolution errors.',
  },
  'global-link': {
    label: 'Global link/install failed',
    hint: 'Run `npm run gsd:install-global` directly. Check that the global npm prefix is writable.',
    likelyCause: 'Permission issues, npm prefix misconfiguration, or missing dist/loader.js.',
  },
};

const stage = process.argv[2];
const context = process.argv.slice(3).join(' ');

if (!stage || !STAGE_INFO[stage]) {
  console.error(`Usage: node scripts/build-stage-error.js <stage> [error-context...]`);
  console.error(`Stages: ${Object.keys(STAGE_INFO).join(', ')}`);
  process.exit(1);
}

const info = STAGE_INFO[stage];

console.error('');
console.error(`\x1b[31m✗ ${info.label}\x1b[0m`);
if (context) {
  console.error(`  Context: ${context}`);
}
console.error(`  Likely cause: ${info.likelyCause}`);
console.error(`  Next step: ${info.hint}`);
console.error('');

process.exit(1);
