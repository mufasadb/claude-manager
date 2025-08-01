#!/bin/bash

# Claude Code Hook Forwarder
# This script forwards Claude Code hook events to Claude Manager for processing
# 
# Usage: Add this script to your Claude settings.json hooks configuration:
# {
#   "hooks": {
#     "PreToolUse": [
#       {
#         "matcher": ".*",
#         "hooks": [
#           {
#             "type": "command",
#             "command": "/path/to/claude-hook-forwarder.sh"
#           }
#         ]
#       }
#     ]
#   }
# }

# Configuration
CLAUDE_MANAGER_URL="${CLAUDE_MANAGER_URL:-http://localhost:3455}"
HOOK_ENDPOINT="$CLAUDE_MANAGER_URL/api/hooks/webhook"

# Get current working directory and project info
CWD=$(pwd)
PROJECT_NAME=$(basename "$CWD")

# Read the JSON data from stdin (provided by Claude Code)
HOOK_DATA=$(cat)

# Parse hook event name from environment or guess from context
HOOK_EVENT_NAME="${CLAUDE_HOOK_EVENT:-PreToolUse}"

# Create enhanced payload with additional context
PAYLOAD=$(cat <<EOF
{
  "originalHookData": $HOOK_DATA,
  "eventType": "$HOOK_EVENT_NAME",
  "projectPath": "$CWD",
  "projectName": "$PROJECT_NAME",
  "timestamp": $(date +%s000),
  "forwarderVersion": "1.0.0"
}
EOF
)

# Log the event locally (optional - uncomment to enable)
# echo "$(date): Hook Event - $HOOK_EVENT_NAME" >> "$CWD/.claude-manager-hooks.log"
# echo "$PAYLOAD" >> "$CWD/.claude-manager-hooks.log"

# Forward to Claude Manager
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Claude-Hook-Forwarder/1.0" \
  -d "$PAYLOAD" \
  "$HOOK_ENDPOINT" > /dev/null 2>&1

# Exit with success to avoid blocking Claude Code
exit 0