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

# Extract hook event name from the JSON data itself (fallback to env var)
HOOK_EVENT_NAME="Unknown"
if command -v jq >/dev/null 2>&1; then
    # First try to extract from the JSON data
    JSON_EVENT_NAME=$(echo "$HOOK_DATA" | jq -r '.hook_event_name // empty' 2>/dev/null || echo "")
    if [ -n "$JSON_EVENT_NAME" ]; then
        HOOK_EVENT_NAME="$JSON_EVENT_NAME"
    elif [ -n "$CLAUDE_HOOK_EVENT" ]; then
        # Fallback to environment variable if JSON doesn't have it
        HOOK_EVENT_NAME="$CLAUDE_HOOK_EVENT"
    fi
fi

# DEBUG: Log event type detection for troubleshooting
if [ "$DEBUG" = "true" ]; then
  echo "DEBUG: CLAUDE_HOOK_EVENT=$CLAUDE_HOOK_EVENT" >&2
  echo "DEBUG: JSON hook_event_name=$JSON_EVENT_NAME" >&2
  echo "DEBUG: Final HOOK_EVENT_NAME=$HOOK_EVENT_NAME" >&2
fi

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

# Forward to Claude Manager with timeout and capture response
RESPONSE=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Claude-Hook-Forwarder-Advanced/1.1" \
  -H "X-Hook-Event: $HOOK_EVENT_NAME" \
  -H "X-Project-Name: $PROJECT_NAME" \
  --max-time 5 \
  -d "$PAYLOAD" \
  "$HOOK_ENDPOINT")

# Extract HTTP status and response body
HTTP_STATUS=$(echo "$RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
RESPONSE_BODY=$(echo "$RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

# Debug logging
if [ "$DEBUG" = "true" ]; then
    echo "$(date): [DEBUG] HTTP Status: $HTTP_STATUS" >&2
    echo "$(date): [DEBUG] Response: $RESPONSE_BODY" >&2
fi

# Check if the hook system wants to block the tool execution
if [ "$HTTP_STATUS" = "200" ] && command -v jq >/dev/null 2>&1; then
    # Parse the response to see if we should block
    SHOULD_CONTINUE=$(echo "$RESPONSE_BODY" | jq -r 'if .continue == null then true else .continue end' 2>/dev/null)
    STOP_REASON=$(echo "$RESPONSE_BODY" | jq -r '.stopReason // empty' 2>/dev/null)
    
    if [ "$SHOULD_CONTINUE" = "false" ]; then
        # Hook wants to block the tool execution
        if [ "$DEBUG" = "true" ]; then
            echo "$(date): [INFO] Blocking tool execution. Reason: $STOP_REASON" >&2
        fi
        
        # Print the stop reason to stderr for user visibility
        if [ -n "$STOP_REASON" ]; then
            echo "🚫 Hook blocked tool execution: $STOP_REASON" >&2
        fi
        
        # Exit with failure to block Claude Code tool execution
        exit 1
    fi
fi

# Log errors if debug is enabled
if [ "$DEBUG" = "true" ] && [ "$HTTP_STATUS" != "200" ]; then
    echo "$(date): [ERROR] Failed to forward hook event. HTTP Status: $HTTP_STATUS" >&2
fi

# Default: Allow tool execution to continue
exit 0