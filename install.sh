#!/bin/bash

# Installation script for claude-manager
# Sets up the global 'register' command

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

log_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_MANAGER_DIR="$SCRIPT_DIR"
BIN_DIR="$HOME/.local/bin"
REGISTER_SCRIPT="$SCRIPT_DIR/bin/cm-reg"
UNREGISTER_SCRIPT="$SCRIPT_DIR/bin/cm-unreg"

log_header "Claude Manager Installation"

# Check if scripts exist
if [ ! -f "$REGISTER_SCRIPT" ]; then
    log_error "cm-reg script not found at $REGISTER_SCRIPT"
    exit 1
fi

if [ ! -f "$UNREGISTER_SCRIPT" ]; then
    log_error "cm-unreg script not found at $UNREGISTER_SCRIPT"
    exit 1
fi

# Create ~/.local/bin if it doesn't exist
if [ ! -d "$BIN_DIR" ]; then
    log_info "Creating $BIN_DIR directory"
    mkdir -p "$BIN_DIR"
fi

# Copy scripts to ~/.local/bin
log_info "Installing cm-reg command to $BIN_DIR"
cp "$REGISTER_SCRIPT" "$BIN_DIR/cm-reg"
chmod +x "$BIN_DIR/cm-reg"
log_success "cm-reg command installed"

log_info "Installing cm-unreg command to $BIN_DIR"
cp "$UNREGISTER_SCRIPT" "$BIN_DIR/cm-unreg"
chmod +x "$BIN_DIR/cm-unreg"
log_success "cm-unreg command installed"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    log_info "Adding $BIN_DIR to PATH"
    
    # Determine shell and add to appropriate rc file
    if [ -n "$ZSH_VERSION" ]; then
        RC_FILE="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        RC_FILE="$HOME/.bashrc"
        # On macOS, .bash_profile is often used instead
        if [[ "$OSTYPE" == "darwin"* ]] && [ -f "$HOME/.bash_profile" ]; then
            RC_FILE="$HOME/.bash_profile"
        fi
    else
        RC_FILE="$HOME/.profile"
    fi
    
    # Add PATH export if not already present
    if ! grep -q "export PATH.*$BIN_DIR" "$RC_FILE" 2>/dev/null; then
        echo "" >> "$RC_FILE"
        echo "# Added by claude-manager installer" >> "$RC_FILE"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$RC_FILE"
        log_success "Added $BIN_DIR to PATH in $RC_FILE"
        
        # Automatically source the RC file
        log_info "Sourcing $RC_FILE to apply changes..."
        if source "$RC_FILE" 2>/dev/null; then
            log_success "Configuration reloaded successfully"
        else
            log_info "Could not auto-reload configuration. Please run 'source $RC_FILE' or restart your terminal"
        fi
    else
        log_info "$BIN_DIR already in PATH in $RC_FILE"
    fi
else
    log_success "$BIN_DIR already in PATH"
fi

# Initialize user configuration directory and registry
CLAUDE_MANAGER_USER_DIR="$HOME/.claude-manager"
REGISTRY_FILE="$CLAUDE_MANAGER_USER_DIR/registry.json"

if [ ! -d "$CLAUDE_MANAGER_USER_DIR" ]; then
    log_info "Creating Claude Manager user directory"
    mkdir -p "$CLAUDE_MANAGER_USER_DIR"
fi

if [ ! -f "$REGISTRY_FILE" ]; then
    log_info "Creating projects registry"
    echo '{"projects": {}, "lastUpdate": '$(date +%s)000'}' > "$REGISTRY_FILE"
    log_success "Projects registry created"
fi

# Install hook management forwarding
log_header "Installing Hook Management Forwarding"

CLAUDE_DIR="$HOME/.claude"
HOOK_FORWARDER_SRC="$SCRIPT_DIR/examples/claude-hook-forwarder.sh"
HOOK_FORWARDER_DEST="$CLAUDE_DIR/claude-hook-forwarder.sh"
CLAUDE_SETTINGS="$CLAUDE_DIR/settings.json"

# Create .claude directory if it doesn't exist
if [ ! -d "$CLAUDE_DIR" ]; then
    log_info "Creating $CLAUDE_DIR directory"
    mkdir -p "$CLAUDE_DIR"
fi

# Copy hook forwarder script (only if it doesn't exist or is different)
if [ -f "$HOOK_FORWARDER_SRC" ]; then
    if [ ! -f "$HOOK_FORWARDER_DEST" ] || ! cmp -s "$HOOK_FORWARDER_SRC" "$HOOK_FORWARDER_DEST"; then
        log_info "Installing hook forwarder script"
        cp "$HOOK_FORWARDER_SRC" "$HOOK_FORWARDER_DEST"
        chmod +x "$HOOK_FORWARDER_DEST"
        log_success "Hook forwarder script installed at $HOOK_FORWARDER_DEST"
    else
        log_info "Hook forwarder script already up to date"
    fi
else
    log_error "Hook forwarder script not found at $HOOK_FORWARDER_SRC"
    log_info "Hook system may not work properly without this script"
fi

# Check Claude settings and provide instructions if hooks exist
if [ -f "$CLAUDE_SETTINGS" ]; then
    if grep -q '"hooks"' "$CLAUDE_SETTINGS" 2>/dev/null; then
        log_info "Existing Claude hooks detected in $CLAUDE_SETTINGS"
        log_info "To integrate with Claude Manager, you'll need to manually add:"
        echo ""
        echo "  $HOOK_FORWARDER_DEST"
        echo ""
        log_info "to your existing hook configuration to avoid overwriting current hooks"
        log_info "See examples/claude-settings.json.example for integration examples"
    else
        log_info "No existing hooks found. Hook forwarder ready for manual configuration."
        log_info "See examples/claude-settings.json.example for setup instructions"
    fi
else
    log_info "No Claude settings found. Hook forwarder ready for configuration."
    log_info "See examples/claude-settings.json.example for setup instructions"
fi

# Final instructions
log_header "Installation Complete"
log_success "Claude Manager installed successfully!"

# Try to source common shell configurations for immediate use
log_info "Attempting to reload shell configurations for immediate use..."
for shell_rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    if [ -f "$shell_rc" ]; then
        if source "$shell_rc" 2>/dev/null; then
            log_success "Reloaded $shell_rc"
        fi
    fi
done

echo ""
log_info "Usage:"
echo "  cd /path/to/your/project"
echo "  cm-reg                      # Register current directory"
echo "  cm-reg my-custom-name       # Register with custom name" 
echo "  cm-unreg                    # Unregister current directory"
echo "  cm-unreg my-project-name    # Unregister specific project"
echo ""

# Test if commands are available
if command -v cm-reg >/dev/null 2>&1; then
    log_success "Commands are ready to use!"
else
    log_info "If commands are not available, run: export PATH=\"$BIN_DIR:\$PATH\""
    log_info "Or restart your terminal"
fi