# GSD (gsd-pi) Justfile
# Just command runner configuration for common development tasks
#
# This justfile ensures the following packages are built and installed correctly:
# - Core runtime packages: @gsd/native, @gsd/pi-tui, @gsd/pi-ai, @gsd/pi-agent-core, @gsd/pi-coding-agent
# - Root package: gsd-pi (the CLI binary)
#
# The following packages are NOT required for core CLI functionality:
# - @gsd-build/daemon, @gsd-build/mcp-server, @gsd-build/rpc-client (separately published)

# List all available recipes
[private]
default:
    @just --list

# Install all dependencies
install:
    @echo "==> Installing npm dependencies..."
    npm install
    @echo "==> Install complete."

# Build the root CLI package (runtime-focused: native, pi-tui, pi-ai, pi-agent-core, pi-coding-agent, then root)
build:
    @echo "==> Building GSD core packages and root CLI..."
    @npm run build || { \
        echo ""; \
        node scripts/build-stage-error.js runtime-build; \
    }
    @echo "==> Build complete."
    @echo ""
    @echo "Verified artifacts:"
    @test -f dist/loader.js && echo "  ✓ dist/loader.js" || echo "  ✗ dist/loader.js MISSING"
    @test -d node_modules/@gsd/pi-coding-agent && echo "  ✓ @gsd/pi-coding-agent linked" || echo "  ✗ @gsd/pi-coding-agent not linked"

# Build extra workspace packages (daemon, mcp-server, rpc-client) - separately published, not required for root CLI
build-extra-workspaces:
    @echo "==> Building extra workspace packages..."
    @npm run build -w @gsd-build/daemon || { \
        node scripts/build-stage-error.js extra-workspace "daemon"; \
    }
    @npm run build -w @gsd-build/mcp-server || { \
        node scripts/build-stage-error.js extra-workspace "mcp-server"; \
    }
    @npm run build -w @gsd-build/rpc-client || { \
        node scripts/build-stage-error.js extra-workspace "rpc-client"; \
    }
    @echo "==> Extra workspace packages built."

# Validate package before publishing (tarball installability check)
validate:
    @echo "==> Validating package (tarball installability check)..."
    @npm run validate-pack || { \
        node scripts/build-stage-error.js pack-validation; \
    }
    @echo "==> Package validation passed."

# Install the package globally (build -> validate -> dev-link)
install-global: build validate
    @echo "==> Installing gsd-pi globally..."
    @if [ ! -f dist/loader.js ]; then \
        echo ""; \
        echo "✗ Build artifact dist/loader.js not found. Build may have failed."; \
        echo "   Run 'just build' to see full output."; \
        exit 1; \
    fi
    @npm run gsd:install-global || { \
        node scripts/build-stage-error.js global-link; \
    }
    @echo "==> Global installation complete."
    @echo ""
    @echo "You can now run 'gsd' from anywhere."
    @echo "Binary location: $(npm prefix -g)/bin/gsd"

# Uninstall the package globally
uninstall-global:
    @echo "==> Uninstalling gsd-pi globally..."
    npm run gsd:uninstall-global
    @echo "==> Global uninstall complete."

# Quick reinstall: uninstall then reinstall globally (preserves node_modules and dist)
reinstall-global: uninstall-global install-global
    @echo "==> Reinstall complete."

# Full development setup: install, build, validate, and install globally
setup: install install-global
    @echo "==> Full dev setup complete."

# Clean build - uninstall global, clean, reinstall and rebuild
clean-setup: uninstall-global
    @echo "==> Starting clean setup..."
    @echo "==> Removing node_modules and build artifacts..."
    rm -rf node_modules dist dist-test
    @echo "==> Reinstalling dependencies..."
    npm install
    @echo "==> Building..."
    npm run build
    @echo "==> Validating..."
    npm run validate-pack
    @echo "==> Installing globally..."
    npm run gsd:install-global
    @echo "==> Clean setup complete."

# Run tests
test:
    @echo "==> Running tests..."
    npm test

# Run the development CLI (builds if needed)
dev:
    @echo "==> Running dev CLI..."
    npm run gsd

# Build the web UI
build-web:
    @echo "==> Building web UI..."
    npm run build:web-host
    @echo "==> Web UI build complete."

# Self-check: verify repo is in a good state for packaging and global install
# This is useful before submitting PRs or publishing
self-check:
    @echo "==> Running self-check..."
    @echo "==> Checking git status..."
    @if [ -n "$$(git status --short)" ]; then \
        echo "⚠ Uncommitted changes detected:"; \
        git status --short; \
        echo ""; \
    else \
        echo "  ✓ Working tree clean"; \
    fi
    @echo ""
    @echo "==> Building core packages..."
    @just build || exit 1
    @echo ""
    @echo "==> Checking extra workspace packages (optional)..."
    @-npm run build -w @gsd-build/daemon 2>/dev/null && echo "    ✓ daemon: built" || echo "    ⚠ daemon: skipped, failed, or not needed"
    @-npm run build -w @gsd-build/mcp-server 2>/dev/null && echo "    ✓ mcp-server: built" || echo "    ⚠ mcp-server: skipped, failed, or not needed"
    @-npm run build -w @gsd-build/rpc-client 2>/dev/null && echo "    ✓ rpc-client: built" || echo "    ⚠ rpc-client: skipped, failed, or not needed"
    @echo ""
    @echo "==> Running pack validation..."
    @npm run validate-pack || exit 1
    @echo ""
    @echo "==> Checking gsd binary..."
    @if command -v gsd >/dev/null 2>&1; then \
        echo "    ✓ gsd binary found: $$(which gsd)"; \
        gsd -v 2>/dev/null || echo "    (version check skipped - may need install-global)"; \
    else \
        echo "    ⚠ gsd binary not in PATH. Run 'just install-global' to install."; \
    fi
    @echo ""
    @echo "==> Self-check complete."
# Verify that global install worked correctly and the binary is accessible
verify-global-install:
    @echo "==> Verifying global install..."
    @echo "Checking binary location..."
    @if command -v gsd >/dev/null 2>&1; then \
        echo "  ✓ gsd binary found: $(which gsd)"; \
        echo "  Version: $(gsd -v 2>/dev/null || echo 'unknown')"; \
    else \
        echo "  ✗ gsd binary not found in PATH"; \
        echo "    Expected location: $(npm prefix -g)/bin/gsd"; \
        exit 1; \
    fi
    @echo "Checking node_modules/@gsd links..."
    @if [ -L node_modules/@gsd/pi-coding-agent ]; then \
        echo "  ✓ @gsd/pi-coding-agent linked"; \
    else \
        echo "  ✗ @gsd/pi-coding-agent not linked"; \
    fi
    @if [ -e dist/loader.js ]; then \
        echo "  ✓ dist/loader.js exists"; \
    else \
        echo "  ✗ dist/loader.js missing - build may have failed"; \
    fi
    @echo "==> Verification complete."

# Remove all build artifacts and node_modules (nuclear option)
clean-all:
    @echo "==> Cleaning all build artifacts..."
    rm -rf node_modules dist dist-test
    @for pkg in native pi-tui pi-ai pi-agent-core pi-coding-agent daemon mcp-server rpc-client; do \
        rm -rf packages/$$pkg/node_modules packages/$$pkg/dist 2>/dev/null || true; \
    done
    @echo "==> Clean complete. Run 'just install' to restore."

# Show what packages are currently linked/symlinked
show-links:
    @echo "==> Workspace package links in node_modules/@gsd:"
    @ls -la node_modules/@gsd/ 2>/dev/null || echo "  (no @gsd scope found)"
    @echo ""
    @echo "==> Build artifacts:"
    @ls -la dist/ 2>/dev/null | head -10 || echo "  (no dist/ found)"
