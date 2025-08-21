#!/bin/bash

# Claude Manager Documentation Mirror - Installation Script
# Version: 1.0.0
# Description: Local mirror of Claude Code documentation for faster access

set -e

VERSION="1.0.0"
REPO_URL="https://github.com/ericbuess/claude-code-docs.git"
INSTALL_DIR="$HOME/.claude-manager-docs"
CLAUDE_SETTINGS_DIR="$HOME/.claude"
SCRIPTS_DIR="$INSTALL_DIR/scripts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    else
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    log_info "Detected OS: $OS"
}

# Check dependencies
check_dependencies() {
    log_info "Checking system dependencies..."
    
    local missing_deps=()
    
    if ! command -v git &> /dev/null; then
        missing_deps+=("git")
    fi
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if ! command -v python3 &> /dev/null; then
        missing_deps+=("python3")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Please install the missing dependencies and run the installer again."
        
        if [[ "$OS" == "macos" ]]; then
            log_info "You can install them using Homebrew:"
            log_info "  brew install git curl jq python3"
        elif [[ "$OS" == "linux" ]]; then
            log_info "You can install them using your package manager:"
            log_info "  sudo apt-get install git curl jq python3 (Ubuntu/Debian)"
            log_info "  sudo yum install git curl jq python3 (CentOS/RHEL)"
        fi
        
        exit 1
    fi
    
    log_success "All dependencies found"
}

# Find existing installations
find_existing_installations() {
    log_info "Checking for existing installations..."
    
    local existing_paths=(
        "$HOME/.claude-docs"
        "$HOME/.claude-code-docs"
        "$INSTALL_DIR"
    )
    
    for path in "${existing_paths[@]}"; do
        if [ -d "$path" ]; then
            log_warning "Found existing installation at: $path"
            EXISTING_INSTALLATION="$path"
            return 0
        fi
    done
    
    log_info "No existing installation found"
    return 1
}

# Migrate existing installation
migrate_installation() {
    if [ -n "$EXISTING_INSTALLATION" ] && [ "$EXISTING_INSTALLATION" != "$INSTALL_DIR" ]; then
        log_info "Migrating existing installation from $EXISTING_INSTALLATION to $INSTALL_DIR"
        
        # Create backup
        local backup_dir="${EXISTING_INSTALLATION}.backup.$(date +%Y%m%d_%H%M%S)"
        cp -r "$EXISTING_INSTALLATION" "$backup_dir"
        log_info "Created backup at: $backup_dir"
        
        # Move to new location
        mv "$EXISTING_INSTALLATION" "$INSTALL_DIR"
        log_success "Migration completed"
    fi
}

# Safe git update
safe_git_update() {
    local repo_dir="$1"
    
    log_info "Updating documentation repository..."
    
    cd "$repo_dir"
    
    # Stash any local changes
    if ! git diff --quiet; then
        log_warning "Local changes detected, stashing..."
        git stash push -m "Auto-stash before update $(date)"
    fi
    
    # Update repository
    git fetch origin
    git reset --hard origin/main
    
    log_success "Repository updated successfully"
}

# Install documentation repository
install_docs_repo() {
    log_info "Installing Claude Code documentation mirror..."
    
    if [ -d "$INSTALL_DIR/.git" ]; then
        safe_git_update "$INSTALL_DIR"
    else
        # Fresh installation
        if [ -d "$INSTALL_DIR" ]; then
            rm -rf "$INSTALL_DIR"
        fi
        
        log_info "Cloning documentation repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        
        log_success "Documentation repository cloned"
    fi
}

# Setup Python environment
setup_python_env() {
    log_info "Setting up Python environment..."
    
    cd "$INSTALL_DIR"
    
    # Install Python requirements if they exist
    if [ -f "scripts/requirements.txt" ]; then
        python3 -m pip install --user -r scripts/requirements.txt
        log_success "Python dependencies installed"
    fi
}

# Create docs helper script
create_docs_helper() {
    log_info "Creating docs helper script..."
    
    local helper_script="$SCRIPTS_DIR/claude-manager-docs-helper.sh"
    
    mkdir -p "$SCRIPTS_DIR"
    
    cat > "$helper_script" << 'EOF'
#!/bin/bash

# Claude Manager Documentation Helper
# Integrated with Claude Manager system

DOCS_DIR="$HOME/.claude-manager-docs"
CLAUDE_MANAGER_DIR="$HOME/Code/claude-manager"

show_help() {
    echo "Claude Manager Documentation Helper"
    echo ""
    echo "Usage: /docs [command] [options]"
    echo ""
    echo "Commands:"
    echo "  help                 Show this help message"
    echo "  sync                 Sync documentation with remote repository"
    echo "  status               Show sync status and last update time"
    echo "  search <query>       Search documentation files"
    echo "  changelog            Show recent documentation changes"
    echo "  version              Show version information"
    echo ""
    echo "Examples:"
    echo "  /docs sync"
    echo "  /docs search hooks"
    echo "  /docs status"
}

sync_docs() {
    echo "Syncing Claude Code documentation..."
    cd "$DOCS_DIR"
    
    if [ -d ".git" ]; then
        git fetch origin
        local local_commit=$(git rev-parse HEAD)
        local remote_commit=$(git rev-parse origin/main)
        
        if [ "$local_commit" != "$remote_commit" ]; then
            git reset --hard origin/main
            echo "Documentation updated successfully!"
            echo "$(date)" > "$DOCS_DIR/.last_sync"
        else
            echo "Documentation is already up to date."
        fi
    else
        echo "Error: Not a git repository. Please reinstall."
        exit 1
    fi
}

show_status() {
    echo "Claude Manager Documentation Status"
    echo "==================================="
    
    if [ -f "$DOCS_DIR/.last_sync" ]; then
        echo "Last sync: $(cat "$DOCS_DIR/.last_sync")"
    else
        echo "Last sync: Never"
    fi
    
    if [ -d "$DOCS_DIR/.git" ]; then
        cd "$DOCS_DIR"
        echo "Current commit: $(git rev-parse --short HEAD)"
        echo "Remote status: $(git status --porcelain=v1 2>/dev/null | wc -l) files modified"
    fi
    
    echo "Documentation path: $DOCS_DIR"
    echo "Files available: $(find "$DOCS_DIR/docs" -name "*.md" 2>/dev/null | wc -l) markdown files"
}

search_docs() {
    local query="$1"
    
    if [ -z "$query" ]; then
        echo "Please provide a search query."
        echo "Usage: /docs search <query>"
        return 1
    fi
    
    echo "Searching for: $query"
    echo "========================"
    
    if [ -d "$DOCS_DIR/docs" ]; then
        # Search in markdown files
        grep -r -i -n --include="*.md" "$query" "$DOCS_DIR/docs" | head -20
    else
        echo "Documentation directory not found. Please sync first."
    fi
}

show_changelog() {
    echo "Recent Documentation Changes"
    echo "============================"
    
    if [ -d "$DOCS_DIR/.git" ]; then
        cd "$DOCS_DIR"
        git log --oneline --max-count=10 --pretty=format:"%h %ad %s" --date=short
    else
        echo "Git repository not found. Please reinstall."
    fi
}

show_version() {
    echo "Claude Manager Documentation Helper v1.0.0"
    echo "Documentation path: $DOCS_DIR"
    
    if [ -d "$DOCS_DIR/.git" ]; then
        cd "$DOCS_DIR"
        echo "Repository: $(git remote get-url origin)"
        echo "Current commit: $(git rev-parse --short HEAD)"
    fi
}

# Main command handling
case "${1:-help}" in
    "help")
        show_help
        ;;
    "sync")
        sync_docs
        ;;
    "status")
        show_status
        ;;
    "search")
        search_docs "$2"
        ;;
    "changelog")
        show_changelog
        ;;
    "version")
        show_version
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '/docs help' for available commands."
        ;;
esac
EOF

    chmod +x "$helper_script"
    log_success "Documentation helper script created"
}

# Update Claude Manager with docs integration
integrate_with_claude_manager() {
    log_info "Integrating with Claude Manager..."
    
    # Check if Claude Manager exists
    local claude_manager_dir="$HOME/Code/claude-manager"
    
    if [ ! -d "$claude_manager_dir" ]; then
        log_warning "Claude Manager directory not found at $claude_manager_dir"
        log_info "Docs helper will still be available as standalone script"
        return 0
    fi
    
    # Add docs command to Claude Manager if it has a command system
    local backend_dir="$claude_manager_dir/backend"
    
    if [ -d "$backend_dir" ]; then
        log_info "Found Claude Manager backend, integration can be added later"
        # We'll integrate this in the next step
    fi
    
    log_success "Integration setup completed"
}

# Create alias for easy access
create_alias() {
    log_info "Creating command alias..."
    
    local shell_config
    if [ -f "$HOME/.zshrc" ]; then
        shell_config="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        shell_config="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
        shell_config="$HOME/.bash_profile"
    else
        log_warning "Could not find shell configuration file"
        return 1
    fi
    
    # Add alias if it doesn't exist
    local alias_cmd="alias cm-docs='$SCRIPTS_DIR/claude-manager-docs-helper.sh'"
    
    if ! grep -q "cm-docs" "$shell_config"; then
        echo "" >> "$shell_config"
        echo "# Claude Manager Documentation Helper" >> "$shell_config"
        echo "$alias_cmd" >> "$shell_config"
        log_success "Added 'cm-docs' alias to $shell_config"
        log_info "Run 'source $shell_config' or restart your terminal to use the alias"
    else
        log_info "Alias already exists in $shell_config"
    fi
}

# Main installation process
main() {
    echo "=========================================="
    echo "Claude Manager Documentation Mirror v$VERSION"
    echo "=========================================="
    echo ""
    
    detect_os
    check_dependencies
    
    find_existing_installations
    migrate_installation
    
    install_docs_repo
    setup_python_env
    create_docs_helper
    integrate_with_claude_manager
    create_alias
    
    echo ""
    log_success "Installation completed successfully!"
    echo ""
    echo "Usage:"
    echo "  cm-docs help           - Show help"
    echo "  cm-docs sync           - Sync documentation"
    echo "  cm-docs search <term>  - Search docs"
    echo "  cm-docs status         - Show status"
    echo ""
    echo "The documentation is installed at: $INSTALL_DIR"
    echo ""
    echo "Note: Run 'source ~/.zshrc' (or restart terminal) to enable the cm-docs command"
}

# Run main function
main "$@"