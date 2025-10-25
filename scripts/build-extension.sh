#!/usr/bin/env bash
# Simple build script to create a clean dist/ for loading as Chrome unpacked extension.
# Excludes common dev folders like __tests__, node_modules, .git, and test-results, plus test files.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Cleaning dist/ and copying extension files (excluding __tests__, .idea, test_*.js, *.spec.js, *.test.js, node_modules, .git, test-results)..."
rm -rf dist
mkdir -p dist

# Use rsync for a fast, predictable copy. Adjust excludes as needed.
rsync -av --exclude='__tests__' --exclude='.idea' --exclude='test_*.js' --exclude='test-*.js' --exclude='*.spec.js' --exclude='*.test.js' --exclude='.git' --exclude='node_modules' --exclude='test-results' ./ dist/

echo "dist/ is ready — load it via chrome://extensions -> Load unpacked -> $ROOT_DIR/dist"
