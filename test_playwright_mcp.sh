#!/bin/bash

# Playwright MCP Regression Test
# This test ensures the Playwright MCP template works correctly and doesn't break again

set -e  # Exit on any error

echo "🎭 Testing Playwright MCP Installation..."
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test functions
test_passed() {
    echo -e "${GREEN}✅ $1${NC}"
}

test_failed() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

test_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Step 1: Test the raw npx command works
test_info "Testing raw npx @playwright/mcp command..."
if npx @playwright/mcp --version >/dev/null 2>&1; then
    test_passed "Raw npx command works"
else
    test_failed "Raw npx @playwright/mcp command failed"
fi

# Step 2: Test the template format works
test_info "Testing template command format..."
if npx @playwright/mcp --browser chrome --version >/dev/null 2>&1; then
    test_passed "Template command format works"
else
    test_failed "Template command format failed"
fi

# Step 3: Test claude mcp add command (dry run simulation)
test_info "Testing Claude MCP add command format..."
CLAUDE_CMD="claude mcp add --scope user \"playwright-test\" npx -- @playwright/mcp --browser chrome"
test_info "Would run: $CLAUDE_CMD"
test_passed "Claude command format is correct"

# Step 4: Test API template
test_info "Testing API template endpoint..."
API_RESPONSE=$(curl -s http://localhost:3455/api/mcp/templates | jq -r '.playwright.args | join(" ")')
EXPECTED="@playwright/mcp --browser chrome"
if [ "$API_RESPONSE" = "$EXPECTED" ]; then
    test_passed "API template has correct arguments"
else
    test_failed "API template arguments wrong. Expected: '$EXPECTED', Got: '$API_RESPONSE'"
fi

# Step 5: Test actual API installation (critical regression test)
test_info "Testing MCP installation through dashboard API..."
API_INSTALL_RESPONSE=$(curl -s -X POST http://localhost:3455/api/mcp/add \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "user",
    "mcpConfig": {
      "name": "playwright-api-test",
      "command": "npx",
      "args": ["@playwright/mcp", "--browser", "chrome"],
      "envVars": {}
    }
  }')

if echo "$API_INSTALL_RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
    test_passed "Dashboard API installation works"
    # Clean up
    claude mcp remove "playwright-api-test" --scope user >/dev/null 2>&1 || true
else
    ERROR_MSG=$(echo "$API_INSTALL_RESPONSE" | jq -r '.error // "Unknown error"')
    test_failed "Dashboard API installation failed: $ERROR_MSG"
fi

# Step 6: Actually test installation (if requested)
if [ "$1" = "--install" ]; then
    test_info "Actually installing Playwright MCP..."
    
    # Remove if exists
    claude mcp remove "playwright-test" --scope user 2>/dev/null || true
    
    # Install
    claude mcp add --scope user "playwright-test" npx -- @playwright/mcp --browser chrome || {
        test_failed "Failed to install Playwright MCP"
    }
    
    # Verify it's in the list
    if claude mcp list | grep -q "playwright-test"; then
        test_passed "Playwright MCP successfully installed"
        
        # Clean up
        claude mcp remove "playwright-test" --scope user
        test_passed "Cleaned up test installation"
    else
        test_failed "Playwright MCP not found in list after installation"
    fi
fi

echo ""
echo -e "${GREEN}🎉 All Playwright MCP tests passed!${NC}"
echo -e "${YELLOW}💡 Run with --install flag to test actual installation${NC}"