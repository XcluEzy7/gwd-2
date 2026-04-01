# GSD (gsd-pi) Justfile
# Just command runner configuration for common development tasks

# List all available recipes
[private]
default:
    @just --list

# Install all dependencies
install:
    npm install

# Build the package (includes building workspaces and TypeScript)
build:
    npm run build

# Install the package globally
install-global: build
    npm run gsd:install-global

# Uninstall the package globally
uninstall-global:
    npm run gsd:uninstall-global

# Full development setup: install, build, and install globally
setup: install build install-global

# Clean build - uninstall global, clean, reinstall and rebuild
clean-setup: uninstall-global
    rm -rf node_modules dist dist-test
    npm install
    npm run build
    npm run gsd:install-global

# Run tests
test:
    npm test

# Run the development CLI
dev:
    npm run gsd

# Build the web UI
build-web:
    npm run build:web-host

# Validate package before publishing
validate:
    npm run validate-pack
