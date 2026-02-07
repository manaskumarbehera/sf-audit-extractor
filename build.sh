#!/bin/bash

# ==============================================
# TrackForcePro Chrome Extension Build Script
# Generates a production ZIP for Chrome Web Store
# ==============================================

set -e

# Get version from manifest.json
VERSION=$(node -p "require('./manifest.json').version")
BUILD_DIR="build"
ZIP_NAME="TrackForcePro-v${VERSION}.zip"

echo "🔧 Building TrackForcePro v${VERSION}..."

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy manifest
cp manifest.json "$BUILD_DIR/"

# Copy main extension scripts
cp background.js "$BUILD_DIR/"
cp content.js "$BUILD_DIR/"
cp popup.html "$BUILD_DIR/"
cp popup.js "$BUILD_DIR/"
cp popup.css "$BUILD_DIR/"

# Copy helper scripts
cp utils.js "$BUILD_DIR/"
cp audit_helper.js "$BUILD_DIR/"
cp constants.js "$BUILD_DIR/"
cp data_explorer_helper.js "$BUILD_DIR/"
cp graphql_helper.js "$BUILD_DIR/"
cp lms_helper.js "$BUILD_DIR/"
cp oauth_helper.js "$BUILD_DIR/"
cp platform_helper.js "$BUILD_DIR/"
cp settings_helper.js "$BUILD_DIR/"
cp soql_helper.js "$BUILD_DIR/"
cp url_helper.js "$BUILD_DIR/"

# Copy icons folder
mkdir -p "$BUILD_DIR/icons"
cp icons/*.png "$BUILD_DIR/icons/"

# Copy rules folder
mkdir -p "$BUILD_DIR/rules"
cp rules/*.json "$BUILD_DIR/rules/"

# Copy scripts folder (SOQL guidance)
mkdir -p "$BUILD_DIR/scripts/soql"
cp scripts/soql/*.js "$BUILD_DIR/scripts/soql/"

# Remove any source maps or development files if they exist
find "$BUILD_DIR" -name "*.map" -delete 2>/dev/null || true
find "$BUILD_DIR" -name "*.test.js" -delete 2>/dev/null || true
find "$BUILD_DIR" -name "*.spec.js" -delete 2>/dev/null || true

# Create the ZIP file
cd "$BUILD_DIR"
rm -f "../$ZIP_NAME"
zip -r "../$ZIP_NAME" . -x "*.DS_Store" -x "__MACOSX/*"
cd ..

# Show the result
echo ""
echo "✅ Build complete!"
echo "📦 Output: $ZIP_NAME"
echo ""
echo "📋 Contents:"
unzip -l "$ZIP_NAME" | tail -n +4 | head -n -2
echo ""
echo "📊 ZIP size: $(du -h "$ZIP_NAME" | cut -f1)"
echo ""
echo "🚀 Ready to upload to Chrome Web Store!"

