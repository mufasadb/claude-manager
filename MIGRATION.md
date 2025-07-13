# Claude Manager File Migration

## Registry Location Change

As of the latest version, the project registry has been moved to standardize file locations:

### Old Location (deprecated)
- `<claude-manager-dir>/projects.json`

### New Location (current)
- `~/.claude-manager/registry.json`

## Why the Change?

1. **Consistency**: Server and CLI tools now use the same file location
2. **User-specific**: Registry is stored in user's home directory, not in the application directory
3. **Separation of concerns**: Application code separate from user data

## Migration

If you have an existing `projects.json` file, it has been renamed to `projects.json.old` for backup purposes. All projects have been automatically migrated to the new location.

## Files in ~/.claude-manager/

```
~/.claude-manager/
├── registry.json         # Project registry (main)
├── user.env             # User-level environment variables
├── session-tracking.json # Session usage tracking data
├── settings.json        # Persistent application settings
└── cache/               # Temporary cache files
```

## Manual Migration (if needed)

If you need to manually migrate projects:

```bash
# Navigate to claude-manager directory
cd /path/to/claude-manager

# Run migration script
python3 -c "
import json
import os

# Read old projects.json
with open('projects.json.old', 'r') as f:
    old_data = json.load(f)

# Create new registry structure
registry_path = os.path.expanduser('~/.claude-manager/registry.json')
os.makedirs(os.path.dirname(registry_path), exist_ok=True)

new_data = {
    'projects': old_data.get('projects', {}),
    'lastUpdate': int(time.time() * 1000)
}

with open(registry_path, 'w') as f:
    json.dump(new_data, f, indent=2)

print('Migration complete')
"
```