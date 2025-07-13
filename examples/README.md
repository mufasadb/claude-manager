# Example Configuration Files

This directory contains example templates for all Claude Manager configuration files. Copy these files to their appropriate locations and customize with your actual values.

## Quick Setup

```bash
# Create the ~/.claude-manager directory
mkdir -p ~/.claude-manager

# Copy all example files
cp examples/registry.json.example ~/.claude-manager/registry.json
cp examples/session-tracking.json.example ~/.claude-manager/session-tracking.json
cp examples/settings.json.example ~/.claude-manager/settings.json
cp examples/user.env.example ~/.claude-manager/user.env

# Edit user.env with your actual API keys
nano ~/.claude-manager/user.env
```

## File Descriptions

### `registry.json.example`
- **Location**: `~/.claude-manager/registry.json`
- **Purpose**: Global project registry with metadata
- **Contains**: Project paths, languages, git remotes, cached configs

### `session-tracking.json.example`
- **Location**: `~/.claude-manager/session-tracking.json`
- **Purpose**: Claude Code usage tracking
- **Contains**: Session history, monthly stats, billing period data

### `settings.json.example`
- **Location**: `~/.claude-manager/settings.json`
- **Purpose**: Dashboard preferences and configuration
- **Contains**: UI settings, session tracking config, integration settings

### `user.env.example`
- **Location**: `~/.claude-manager/user.env`
- **Purpose**: Global environment variables for all projects
- **Contains**: API keys, tokens, shared configuration

### `claude-settings.json.example`
- **Location**: `~/.claude/settings.json` (user) or `.claude/settings.json` (project)
- **Purpose**: Claude Code hooks and MCP server configuration
- **Contains**: Hook definitions, MCP server configs, Claude settings

### `project-env.example`
- **Location**: `.env` (in each project directory)
- **Purpose**: Project-specific environment variables
- **Contains**: Database URLs, project API keys, feature flags

## Security Notes

⚠️ **NEVER commit actual configuration files to git!**

- All actual config files are in `.gitignore`
- Only `.example` files are safe to commit
- Always use placeholder values in examples
- Real API keys should only exist in your local files

## Environment Variable Sources

Claude Manager loads environment variables in this order:

1. **Project-level**: `.env` in project directory
2. **User-level**: `~/.claude-manager/user.env`
3. **System-level**: System environment variables

Later sources override earlier ones, so project-specific vars take precedence.

## Getting API Keys

### GitHub
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` and `user` scopes
3. Add as `GITHUB_TOKEN=ghp_...`

### OpenAI
1. Visit https://platform.openai.com/api-keys
2. Create new secret key
3. Add as `OPENAI_API_KEY=sk-...`

### Supabase
1. Go to your Supabase project dashboard
2. Settings → API → Project URL and anon/public key
3. Add as `SUPABASE_PROJECT_REF=...` and `SUPABASE_ANON_KEY=...`

### Others
See each service's documentation for API key generation instructions.