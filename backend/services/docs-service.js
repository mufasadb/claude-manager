const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Documentation Service for Claude Manager
 * Manages local Claude Code documentation mirror
 */
class DocsService {
    constructor() {
        this.docsDir = path.join(process.env.HOME, '.claude-manager-docs');
        this.scriptsDir = path.join(this.docsDir, 'scripts');
        this.helperScript = path.join(this.scriptsDir, 'claude-manager-docs-helper.sh');
        this.lastSyncFile = path.join(this.docsDir, '.last_sync');
        
        this.isInstalled = this.checkInstallation();
    }

    /**
     * Check if documentation mirror is installed
     */
    checkInstallation() {
        return fs.existsSync(this.docsDir) && 
               fs.existsSync(this.helperScript) && 
               fs.existsSync(path.join(this.docsDir, '.git'));
    }

    /**
     * Get documentation status
     */
    async getStatus() {
        if (!this.isInstalled) {
            return {
                installed: false,
                message: 'Documentation mirror not installed'
            };
        }

        try {
            const status = {
                installed: true,
                lastSync: this.getLastSyncTime(),
                docsPath: this.docsDir,
                totalFiles: await this.countDocFiles(),
                gitInfo: await this.getGitInfo()
            };

            return status;
        } catch (error) {
            return {
                installed: true,
                error: error.message
            };
        }
    }

    /**
     * Get last sync time
     */
    getLastSyncTime() {
        try {
            if (fs.existsSync(this.lastSyncFile)) {
                return fs.readFileSync(this.lastSyncFile, 'utf8').trim();
            }
            return 'Never';
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Count documentation files
     */
    async countDocFiles() {
        try {
            const docsPath = path.join(this.docsDir, 'docs');
            if (!fs.existsSync(docsPath)) {
                return 0;
            }

            const { stdout } = await execAsync(`find "${docsPath}" -name "*.md" | wc -l`);
            return parseInt(stdout.trim()) || 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get git repository information
     */
    async getGitInfo() {
        try {
            const gitDir = path.join(this.docsDir, '.git');
            if (!fs.existsSync(gitDir)) {
                return null;
            }

            const { stdout: commit } = await execAsync('git rev-parse --short HEAD', { cwd: this.docsDir });
            const { stdout: status } = await execAsync('git status --porcelain=v1', { cwd: this.docsDir });
            const { stdout: remote } = await execAsync('git remote get-url origin', { cwd: this.docsDir });

            return {
                currentCommit: commit.trim(),
                modifiedFiles: status.split('\n').filter(line => line.trim()).length,
                remoteUrl: remote.trim()
            };
        } catch (error) {
            return {
                error: error.message
            };
        }
    }

    /**
     * Sync documentation with remote repository
     */
    async syncDocs() {
        if (!this.isInstalled) {
            throw new Error('Documentation mirror not installed');
        }

        try {
            console.log('Syncing Claude Code documentation...');

            // Check if we're in a git repository
            const gitDir = path.join(this.docsDir, '.git');
            if (!fs.existsSync(gitDir)) {
                throw new Error('Not a git repository. Please reinstall.');
            }

            // Fetch latest changes
            await execAsync('git fetch origin', { cwd: this.docsDir });

            // Get current and remote commit hashes
            const { stdout: localCommit } = await execAsync('git rev-parse HEAD', { cwd: this.docsDir });
            const { stdout: remoteCommit } = await execAsync('git rev-parse origin/main', { cwd: this.docsDir });

            if (localCommit.trim() !== remoteCommit.trim()) {
                // Update to latest
                await execAsync('git reset --hard origin/main', { cwd: this.docsDir });
                
                // Update last sync time
                fs.writeFileSync(this.lastSyncFile, new Date().toISOString());
                
                console.log('Documentation updated successfully!');
                return {
                    success: true,
                    updated: true,
                    message: 'Documentation updated to latest version'
                };
            } else {
                console.log('Documentation is already up to date.');
                return {
                    success: true,
                    updated: false,
                    message: 'Documentation is already up to date'
                };
            }
        } catch (error) {
            console.error('Failed to sync documentation:', error.message);
            throw error;
        }
    }

    /**
     * Search documentation files
     */
    async searchDocs(query) {
        if (!this.isInstalled) {
            throw new Error('Documentation mirror not installed');
        }

        if (!query || query.trim() === '') {
            throw new Error('Search query is required');
        }

        try {
            const docsPath = path.join(this.docsDir, 'docs');
            if (!fs.existsSync(docsPath)) {
                throw new Error('Documentation directory not found');
            }

            // Search using grep
            const { stdout } = await execAsync(
                `grep -r -i -n --include="*.md" "${query}" "${docsPath}" | head -20`,
                { cwd: this.docsDir }
            );

            const results = stdout.trim().split('\n')
                .filter(line => line.length > 0)
                .map(line => {
                    const [filePath, lineNumber, ...content] = line.split(':');
                    return {
                        file: path.relative(this.docsDir, filePath),
                        line: parseInt(lineNumber) || 0,
                        content: content.join(':').trim(),
                        match: query
                    };
                });

            return {
                query,
                results,
                totalMatches: results.length
            };
        } catch (error) {
            if (error.code === 1) {
                // grep returns 1 when no matches found
                return {
                    query,
                    results: [],
                    totalMatches: 0
                };
            }
            throw error;
        }
    }

    /**
     * Get recent changelog entries
     */
    async getChangelog(limit = 10) {
        if (!this.isInstalled) {
            throw new Error('Documentation mirror not installed');
        }

        try {
            const { stdout } = await execAsync(
                `git log --oneline --max-count=${limit} --pretty=format:"%h|%ad|%s" --date=short`,
                { cwd: this.docsDir }
            );

            const entries = stdout.trim().split('\n')
                .filter(line => line.length > 0)
                .map(line => {
                    const [hash, date, message] = line.split('|');
                    return {
                        hash: hash.trim(),
                        date: date.trim(),
                        message: message.trim()
                    };
                });

            return entries;
        } catch (error) {
            throw new Error(`Failed to get changelog: ${error.message}`);
        }
    }

    /**
     * Install documentation mirror
     */
    async install() {
        try {
            console.log('Installing documentation mirror...');
            
            // Remove existing installation if it exists
            if (fs.existsSync(this.docsDir)) {
                console.log('Removing existing installation...');
                await execAsync(`rm -rf "${this.docsDir}"`);
            }
            
            // Clone the repository
            console.log('Cloning documentation repository...');
            await execAsync(`git clone https://github.com/ericbuess/claude-code-docs.git "${this.docsDir}"`);
            
            // Create scripts directory
            if (!fs.existsSync(this.scriptsDir)) {
                fs.mkdirSync(this.scriptsDir, { recursive: true });
            }
            
            // Create the helper script
            console.log('Creating helper script...');
            const helperScriptContent = `#!/bin/bash

# Claude Manager Documentation Helper
# Integrated with Claude Manager system

DOCS_DIR="$HOME/.claude-manager-docs"

show_help() {
    echo "Claude Manager Documentation Helper"
    echo ""
    echo "Usage: cm-docs [command] [options]"
    echo ""
    echo "Commands:"
    echo "  help                 Show this help message"
    echo "  sync                 Sync documentation with remote repository"
    echo "  status               Show sync status and last update time"
    echo "  search <query>       Search documentation files"
    echo "  changelog            Show recent documentation changes"
    echo "  version              Show version information"
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
        echo "Usage: cm-docs search <query>"
        return 1
    fi
    
    echo "Searching for: $query"
    echo "========================"
    
    if [ -d "$DOCS_DIR/docs" ]; then
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
case "\${1:-help}" in
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
        echo "Use 'cm-docs help' for available commands."
        ;;
esac
`;
            
            fs.writeFileSync(this.helperScript, helperScriptContent);
            await execAsync(`chmod +x "${this.helperScript}"`);
            
            // Set initial sync time
            fs.writeFileSync(this.lastSyncFile, new Date().toISOString());
            
            // Refresh installation status
            this.isInstalled = this.checkInstallation();
            
            console.log('Documentation mirror installed successfully!');
            
            return {
                success: this.isInstalled,
                message: 'Documentation mirror installed successfully!'
            };
        } catch (error) {
            console.error('Installation failed:', error);
            throw new Error(`Installation failed: ${error.message}`);
        }
    }

    /**
     * Get documentation file content
     */
    async getDocContent(filePath) {
        if (!this.isInstalled) {
            throw new Error('Documentation mirror not installed');
        }

        const fullPath = path.join(this.docsDir, 'docs', filePath);
        
        // Security check: ensure file is within docs directory
        const resolvedPath = path.resolve(fullPath);
        const docsPath = path.resolve(this.docsDir, 'docs');
        
        if (!resolvedPath.startsWith(docsPath)) {
            throw new Error('Access denied: Invalid file path');
        }

        try {
            if (!fs.existsSync(resolvedPath)) {
                throw new Error('Documentation file not found');
            }

            const content = fs.readFileSync(resolvedPath, 'utf8');
            const stats = fs.statSync(resolvedPath);
            
            return {
                path: filePath,
                content,
                size: stats.size,
                lastModified: stats.mtime
            };
        } catch (error) {
            throw new Error(`Failed to read documentation file: ${error.message}`);
        }
    }

    /**
     * List available documentation files
     */
    async listDocs() {
        if (!this.isInstalled) {
            throw new Error('Documentation mirror not installed');
        }

        try {
            const docsPath = path.join(this.docsDir, 'docs');
            if (!fs.existsSync(docsPath)) {
                return [];
            }

            const { stdout } = await execAsync(`find "${docsPath}" -name "*.md" -type f`);
            
            const files = stdout.trim().split('\n')
                .filter(line => line.length > 0)
                .map(filePath => {
                    const relativePath = path.relative(docsPath, filePath);
                    const stats = fs.statSync(filePath);
                    
                    return {
                        path: relativePath,
                        name: path.basename(relativePath, '.md'),
                        size: stats.size,
                        lastModified: stats.mtime
                    };
                })
                .sort((a, b) => a.path.localeCompare(b.path));

            return files;
        } catch (error) {
            throw new Error(`Failed to list documentation files: ${error.message}`);
        }
    }

    /**
     * Auto-sync documentation (called periodically)
     */
    async autoSync() {
        if (!this.isInstalled) {
            return { skipped: true, reason: 'Not installed' };
        }

        try {
            // Check if we should sync (every 3 hours)
            const lastSync = this.getLastSyncTime();
            if (lastSync !== 'Never') {
                const lastSyncTime = new Date(lastSync);
                const now = new Date();
                const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);
                
                if (hoursSinceSync < 3) {
                    return { 
                        skipped: true, 
                        reason: `Last sync was ${hoursSinceSync.toFixed(1)} hours ago` 
                    };
                }
            }

            const result = await this.syncDocs();
            return { ...result, auto: true };
        } catch (error) {
            console.error('Auto-sync failed:', error.message);
            return { 
                success: false, 
                error: error.message, 
                auto: true 
            };
        }
    }
}

module.exports = DocsService;