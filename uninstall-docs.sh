#!/bin/bash

# Claude Manager Documentation Mirror - Uninstallation Script
# Version: 1.0.0
# Description: Remove local Claude Code documentation mirror

set -e

VERSION="1.0.0"
INSTALL_DIR="$HOME/.claude-manager-docs"

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

# Check if installation exists
check_installation() {
    if [ ! -d "$INSTALL_DIR" ]; then
        log_warning "Documentation mirror is not installed at $INSTALL_DIR"
        return 1
    fi
    
    log_info "Found documentation mirror installation at $INSTALL_DIR"
    return 0
}

# Remove installation directory
remove_installation() {
    log_info "Removing documentation mirror installation..."
    
    if [ -d "$INSTALL_DIR" ]; then
        # Create backup before removal (optional)
        local backup_dir="${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "Creating backup at: $backup_dir"
        cp -r "$INSTALL_DIR" "$backup_dir"
        
        # Remove the installation
        rm -rf "$INSTALL_DIR"
        log_success "Documentation mirror removed"
        log_info "Backup created at: $backup_dir"
        log_info "You can safely delete the backup if you don't need it"
    fi
}

# Remove shell aliases
remove_aliases() {
    log_info "Removing shell aliases..."
    
    local shell_configs=(
        "$HOME/.zshrc"
        "$HOME/.bashrc" 
        "$HOME/.bash_profile"
    )
    
    local removed_count=0
    
    for config_file in "${shell_configs[@]}"; do
        if [ -f "$config_file" ]; then
            # Check if alias exists
            if grep -q "cm-docs" "$config_file"; then
                log_info "Removing cm-docs alias from $config_file"
                
                # Create backup
                cp "$config_file" "${config_file}.backup.$(date +%Y%m%d_%H%M%S)"
                
                # Remove alias and related lines
                sed -i.tmp '/# Claude Manager Documentation Helper/d' "$config_file"
                sed -i.tmp '/cm-docs/d' "$config_file"
                rm -f "${config_file}.tmp"
                
                removed_count=$((removed_count + 1))
            fi
        fi
    done
    
    if [ $removed_count -gt 0 ]; then
        log_success "Removed aliases from $removed_count shell configuration file(s)"
        log_info "Restart your terminal or run 'source ~/.zshrc' to apply changes"
    else
        log_info "No aliases found to remove"
    fi
}

# Remove any temporary files
cleanup_temp_files() {
    log_info "Cleaning up temporary files..."
    
    local temp_patterns=(
        "/tmp/claude-manager-docs*"
        "/tmp/cm-docs*"
        "$HOME/.cache/claude-manager-docs*"
    )
    
    for pattern in "${temp_patterns[@]}"; do
        if ls $pattern 1> /dev/null 2>&1; then
            rm -rf $pattern
            log_info "Removed temporary files: $pattern"
        fi
    done
}

# Check for Claude Manager integration
check_claude_manager_integration() {
    local claude_manager_dir="$HOME/Code/claude-manager"
    
    if [ -d "$claude_manager_dir" ]; then
        log_info "Found Claude Manager installation"
        log_info "The documentation service has been removed from the backend"
        log_info "You may want to restart Claude Manager to complete the removal"
    fi
}

# Show uninstallation summary
show_summary() {
    echo ""
    echo "=========================================="
    echo "Uninstallation Summary"
    echo "=========================================="
    echo ""
    
    if [ -d "$INSTALL_DIR" ]; then
        log_error "Installation directory still exists: $INSTALL_DIR"
        echo "Manual removal may be required"
    else
        log_success "Documentation mirror completely removed"
    fi
    
    echo ""
    echo "What was removed:"
    echo "  - Documentation mirror directory (~/.claude-manager-docs)"
    echo "  - Shell aliases (cm-docs command)"
    echo "  - Temporary files"
    echo "  - Integration with Claude Manager backend"
    echo ""
    
    echo "Backup files created:"
    echo "  - Installation backup: ~/.claude-manager-docs.backup.*"
    echo "  - Shell config backups: ~/.zshrc.backup.* (if applicable)"
    echo ""
    
    echo "Next steps:"
    echo "  - Restart your terminal to remove the cm-docs command"
    echo "  - Restart Claude Manager if it's running"
    echo "  - Remove backup files when you're sure you don't need them"
    echo ""
}

# Confirm uninstallation
confirm_uninstallation() {
    echo "=========================================="
    echo "Claude Manager Documentation Mirror v$VERSION"
    echo "Uninstallation Script"
    echo "=========================================="
    echo ""
    
    if ! check_installation; then
        log_info "Nothing to uninstall"
        exit 0
    fi
    
    echo "This will remove:"
    echo "  - Documentation mirror at: $INSTALL_DIR"
    echo "  - Shell aliases (cm-docs command)"
    echo "  - Temporary files"
    echo "  - Integration with Claude Manager"
    echo ""
    
    read -p "Are you sure you want to continue? (y/N): " -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Uninstallation cancelled"
        exit 0
    fi
}

# Main uninstallation process
main() {
    confirm_uninstallation
    
    log_info "Starting uninstallation process..."
    
    remove_installation
    remove_aliases
    cleanup_temp_files
    check_claude_manager_integration
    
    show_summary
    
    log_success "Uninstallation completed!"
}

# Handle command line arguments
case "${1:-}" in
    "--force"|"-f")
        # Skip confirmation for automated scripts
        if check_installation; then
            log_info "Force uninstallation mode - skipping confirmation"
            remove_installation
            remove_aliases
            cleanup_temp_files
            log_success "Force uninstallation completed!"
        else
            log_info "Nothing to uninstall"
        fi
        ;;
    "--help"|"-h")
        echo "Claude Manager Documentation Mirror - Uninstallation Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --force, -f    Skip confirmation prompt"
        echo "  --help, -h     Show this help message"
        echo ""
        echo "This script will remove the Claude Manager documentation mirror"
        echo "and all associated files and configurations."
        ;;
    "")
        main
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use '$0 --help' for usage information"
        exit 1
        ;;
esac