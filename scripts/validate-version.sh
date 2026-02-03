#!/bin/bash
# scripts/validate-version.sh
# Validates that version numbers match across package.json, plugin.json, and marketplace.json

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Validating version consistency..."

# Get versions from each file
PACKAGE_VERSION=$(node -p "require('./package.json').version")
PLUGIN_VERSION=$(node -p "require('./.claude-plugin/plugin.json').version")
MARKETPLACE_VERSION=$(node -p "require('./.claude-plugin/marketplace.json').plugins[0].version")
MARKETPLACE_META_VERSION=$(node -p "require('./.claude-plugin/marketplace.json').metadata.version")

echo ""
echo "📋 Version Summary:"
echo "  package.json:          $PACKAGE_VERSION"
echo "  plugin.json:           $PLUGIN_VERSION"
echo "  marketplace.json:      $MARKETPLACE_VERSION"
echo "  marketplace metadata:  $MARKETPLACE_META_VERSION"
echo ""

# Check if all versions match
if [ "$PACKAGE_VERSION" != "$PLUGIN_VERSION" ]; then
  echo -e "${RED}❌ Version mismatch!${NC}"
  echo -e "  ${YELLOW}package.json${NC}: $PACKAGE_VERSION"
  echo -e "  ${YELLOW}plugin.json${NC}: $PLUGIN_VERSION"
  exit 1
fi

if [ "$PACKAGE_VERSION" != "$MARKETPLACE_VERSION" ]; then
  echo -e "${RED}❌ Version mismatch!${NC}"
  echo -e "  ${YELLOW}package.json${NC}: $PACKAGE_VERSION"
  echo -e "  ${YELLOW}marketplace.json (plugin)${NC}: $MARKETPLACE_VERSION"
  exit 1
fi

if [ "$PACKAGE_VERSION" != "$MARKETPLACE_META_VERSION" ]; then
  echo -e "${RED}❌ Version mismatch!${NC}"
  echo -e "  ${YELLOW}package.json${NC}: $PACKAGE_VERSION"
  echo -e "  ${YELLOW}marketplace.json (metadata)${NC}: $MARKETPLACE_META_VERSION"
  exit 1
fi

# Validate package name is scoped
PACKAGE_NAME=$(node -p "require('./package.json').name")
if [[ ! "$PACKAGE_NAME" =~ ^@theglitchking/ ]]; then
  echo -e "${RED}❌ Package name must be scoped under @theglitchking/${NC}"
  echo -e "  Current: ${YELLOW}$PACKAGE_NAME${NC}"
  exit 1
fi

# Validate publishConfig.access is public
ACCESS=$(node -p "require('./package.json').publishConfig?.access || 'missing'")
if [ "$ACCESS" != "public" ]; then
  echo -e "${RED}❌ publishConfig.access must be 'public' for scoped packages${NC}"
  echo -e "  Current: ${YELLOW}$ACCESS${NC}"
  exit 1
fi

# Success!
echo -e "${GREEN}✅ All versions match: $PACKAGE_VERSION${NC}"
echo -e "${GREEN}✅ Package name is properly scoped${NC}"
echo -e "${GREEN}✅ publishConfig.access is public${NC}"
echo ""
echo "Ready to publish! 🚀"
exit 0
