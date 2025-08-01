#!/bin/bash

# Advanced Claude Code Hook Forwarder
# This script forwards Claude Code hook events to Claude Manager with enhanced context detection
# 
# Usage examples in Claude settings.json:
# 
# For PreToolUse hooks:
# {
#   "hooks": {
#     "PreToolUse": [
#       {
#         "matcher": "Write|Edit",
#         "hooks": [
#           {
#             "type": "command",
#             "command": "CLAUDE_HOOK_EVENT=PreToolUse /path/to/claude-hook-forwarder-advanced.sh"
#           }
#         ]
#       }
#     ]
#   }
# }
#
# For PostToolUse hooks:
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": "Bash",
#         "hooks": [
#           {
#             "type": "command",
#             "command": "CLAUDE_HOOK_EVENT=PostToolUse /path/to/claude-hook-forwarder-advanced.sh"
#           }
#         ]
#       }
#     ]
#   }
# }

# Configuration
CLAUDE_MANAGER_URL="${CLAUDE_MANAGER_URL:-http://localhost:3455}"
HOOK_ENDPOINT="$CLAUDE_MANAGER_URL/api/hooks/webhook"
DEBUG="${CLAUDE_HOOK_DEBUG:-false}"

# Get current working directory and project info
CWD=$(pwd)
PROJECT_NAME=$(basename "$CWD")

# Read the JSON data from stdin (provided by Claude Code)
HOOK_DATA=$(cat)

# Extract hook event name from environment variable
HOOK_EVENT_NAME="${CLAUDE_HOOK_EVENT:-Unknown}"

# Try to extract tool name from hook data if possible
TOOL_NAME=""
if command -v jq >/dev/null 2>&1; then
    TOOL_NAME=$(echo "$HOOK_DATA" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
fi

# Get git info if available
GIT_BRANCH=""
GIT_COMMIT=""
if [ -d "$CWD/.git" ]; then
    GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "")
fi

# Get environment info
USER_NAME="${USER:-unknown}"
HOSTNAME="${HOSTNAME:-$(hostname 2>/dev/null || echo 'unknown')}"

# Create enhanced payload with rich context
PAYLOAD=$(cat <<EOF
{
  "originalHookData": $HOOK_DATA,
  "eventType": "$HOOK_EVENT_NAME",
  "toolName": "$TOOL_NAME",
  "projectPath": "$CWD",
  "projectName": "$PROJECT_NAME",
  "timestamp": $(date +%s000),
  "context": {
    "user": "$USER_NAME",
    "hostname": "$HOSTNAME",
    "git": {
      "branch": "$GIT_BRANCH",
      "commit": "$GIT_COMMIT"
    },
    "environment": {
      "shell": "$SHELL",
      "term": "$TERM"
    }
  },
  "forwarderVersion": "1.1.0"
}
EOF
)

# Debug logging if enabled
if [ "$DEBUG" = "true" ]; then
    echo "$(date): [DEBUG] Hook Event - $HOOK_EVENT_NAME" >&2
    echo "$(date): [DEBUG] Tool Name - $TOOL_NAME" >&2
    echo "$(date): [DEBUG] Project - $PROJECT_NAME ($CWD)" >&2
    echo "$(date): [DEBUG] Payload:" >&2
    echo "$PAYLOAD" >&2
fi

# Log the event locally (uncomment to enable persistent logging)
# LOG_FILE="$CWD/.claude-manager-hooks.log"
# echo "$(date): Hook Event - $HOOK_EVENT_NAME - Tool: $TOOL_NAME" >> "$LOG_FILE"
# echo "$PAYLOAD" >> "$LOG_FILE"

# Forward to Claude Manager with timeout
HTTP_STATUS=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Claude-Hook-Forwarder-Advanced/1.1" \
  -H "X-Hook-Event: $HOOK_EVENT_NAME" \
  -H "X-Project-Name: $PROJECT_NAME" \
  --max-time 5 \
  -d "$PAYLOAD" \
  "$HOOK_ENDPOINT")

# Log errors if debug is enabled
if [ "$DEBUG" = "true" ] && [ "$HTTP_STATUS" != "200" ]; then
    echo "$(date): [ERROR] Failed to forward hook event. HTTP Status: $HTTP_STATUS" >&2
fi

# Always exit with success to avoid blocking Claude Code
exit 0