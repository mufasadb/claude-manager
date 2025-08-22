#!/bin/bash

# Statusline showing product interface URL, current activity emoji, and context window percentage
# Uses same token calculation method as /context command

# Read session context JSON from stdin  
SESSION_DATA=$(cat)

# Extract transcript path to calculate context usage like /context command
TRANSCRIPT_PATH=$(echo "$SESSION_DATA" | jq -r '.transcript_path // ""' 2>/dev/null)

# Calculate context usage using /context methodology
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  if command -v jq >/dev/null 2>&1; then
    # Parse JSONL like /context does - sum all token usage fields
    USAGE_DATA=$(cat "$TRANSCRIPT_PATH" 2>/dev/null | \
      jq -r 'select(.message.usage != null) | .message.usage | 
             (.input_tokens // 0) + (.output_tokens // 0) + 
             (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)' 2>/dev/null)
    
    # Sum all usage (mirrors /context calculation)
    TOTAL_TOKENS=0
    TOOL_TOKENS=0
    MESSAGE_TOKENS=0
    SYSTEM_TOKENS=0
    
    while IFS= read -r line; do
      if [[ "$line" =~ ^[0-9]+$ ]]; then
        TOTAL_TOKENS=$((TOTAL_TOKENS + line))
      fi
    done <<< "$USAGE_DATA"
    
    # Analyze token categories like /context does
    cat "$TRANSCRIPT_PATH" 2>/dev/null | jq -r '
      select(.message.usage != null) | 
      {
        type: .type,
        input: (.message.usage.input_tokens // 0),
        output: (.message.usage.output_tokens // 0),
        cache_creation: (.message.usage.cache_creation_input_tokens // 0),
        cache_read: (.message.usage.cache_read_input_tokens // 0),
        has_tools: ((.message.content // []) | map(select(.type == "tool_use" or .type == "tool_result")) | length > 0)
      }' 2>/dev/null | jq -s '
      {
        total_input: map(.input) | add,
        total_output: map(.output) | add,
        total_cache_creation: map(.cache_creation) | add,
        total_cache_read: map(.cache_read) | add,
        tool_messages: map(select(.has_tools)) | length,
        user_messages: map(select(.type == "user")) | length,
        assistant_messages: map(select(.type == "assistant")) | length
      }' > /tmp/context_analysis.json 2>/dev/null
    
    # Read the analysis
    if [ -f /tmp/context_analysis.json ]; then
      ANALYSIS=$(cat /tmp/context_analysis.json 2>/dev/null)
      TOOL_TOKENS=$(echo "$ANALYSIS" | jq -r '.tool_messages * 50 // 0' 2>/dev/null)
      MESSAGE_TOKENS=$(echo "$ANALYSIS" | jq -r '(.total_input + .total_output) // 0' 2>/dev/null)
      SYSTEM_TOKENS=$(echo "$ANALYSIS" | jq -r '.total_cache_creation // 0' 2>/dev/null)
      rm -f /tmp/context_analysis.json
    fi
    
    # Use latest cache_read as current context (like /context shows)
    CURRENT_CONTEXT=$(cat "$TRANSCRIPT_PATH" 2>/dev/null | \
      jq -r 'select(.message.usage.cache_read_input_tokens != null) | .message.usage.cache_read_input_tokens' 2>/dev/null | \
      tail -1)
    
    if [[ "$CURRENT_CONTEXT" =~ ^[0-9]+$ ]] && [ "$CURRENT_CONTEXT" -gt 0 ]; then
      ESTIMATED_TOKENS=$CURRENT_CONTEXT
    else
      ESTIMATED_TOKENS=$TOTAL_TOKENS
    fi
  else
    # Fallback without jq
    FILE_SIZE_KB=$(du -k "$TRANSCRIPT_PATH" | cut -f1)
    ESTIMATED_TOKENS=$((FILE_SIZE_KB * 85))
  fi
  
  # Claude Sonnet context window is 200k tokens
  CONTEXT_PERCENT=$((ESTIMATED_TOKENS * 100 / 200000))
  
  # Determine biggest consumer for emoji
  BIGGEST_CONSUMER="messages"
  if [ "$TOOL_TOKENS" -gt "$MESSAGE_TOKENS" ] && [ "$TOOL_TOKENS" -gt "$SYSTEM_TOKENS" ]; then
    BIGGEST_CONSUMER="tools"
  elif [ "$SYSTEM_TOKENS" -gt "$MESSAGE_TOKENS" ] && [ "$SYSTEM_TOKENS" -gt "$TOOL_TOKENS" ]; then
    BIGGEST_CONSUMER="system"
  fi
  
  # Cap at 99% for display
  if [ $CONTEXT_PERCENT -gt 99 ]; then
    CONTEXT_PERCENT=99
  fi
  
  # Don't show negative percentages
  if [ $CONTEXT_PERCENT -lt 0 ]; then
    CONTEXT_PERCENT=0
  fi
else
  # Fallback estimation
  DATA_SIZE=${#SESSION_DATA}
  CONTEXT_PERCENT=$((DATA_SIZE / 4 / 200000 * 100))
  BIGGEST_CONSUMER="unknown"
  if [ $CONTEXT_PERCENT -gt 99 ]; then
    CONTEXT_PERCENT=99
  fi
  if [ $CONTEXT_PERCENT -lt 0 ]; then
    CONTEXT_PERCENT=0
  fi
fi

# Determine status emoji based on biggest context consumer
case "$BIGGEST_CONSUMER" in
  "tools")
    STATUS="🔧"  # Hammer for tool usage
    ;;
  "system")
    STATUS="⚙️"  # Gear for system/memory/setup
    ;;
  "messages")
    STATUS="💬"  # Speech bubble for conversation
    ;;
  *)
    # Fallback: detect current activity from recent data
    RECENT_DATA=$(echo "$SESSION_DATA" | tail -c 1000)
    if echo "$RECENT_DATA" | grep -qi -E "(test|testing|screenshot|browser|playwright)"; then
      STATUS="🧪"
    elif echo "$RECENT_DATA" | grep -qi -E "(write|edit|create|multiedit|notebookedit)"; then
      STATUS="✍️"
    elif echo "$RECENT_DATA" | grep -qi -E "(read|grep|glob|ls|cat)"; then
      STATUS="📖"
    elif echo "$RECENT_DATA" | grep -qi -E "(plan|todo|thinking|analyze)"; then
      STATUS="🤔"
    elif echo "$RECENT_DATA" | grep -qi -E "(bash|command|exec|run)"; then
      STATUS="⚡"
    elif echo "$RECENT_DATA" | grep -qi -E "(search|fetch|web|api)"; then
      STATUS="🔍"
    elif echo "$RECENT_DATA" | grep -qi -E "(complete|done|finish|ready)"; then
      STATUS="✅"
    else
      STATUS="💭"
    fi
    ;;
esac

# Format context percentage bar with colors
if [ $CONTEXT_PERCENT -le 25 ]; then
  BAR_COLOR="\e[32m"  # Green
elif [ $CONTEXT_PERCENT -le 75 ]; then
  BAR_COLOR="\e[33m"  # Yellow
else
  BAR_COLOR="\e[31m"  # Red
fi

# Get project-specific status display from Claude Manager
PROJECT_PATH=$(pwd)
STATUS_RESPONSE=$(curl -s "http://localhost:3455/api/project-status-display?path=$PROJECT_PATH" 2>/dev/null)

if [ $? -eq 0 ] && echo "$STATUS_RESPONSE" | grep -q '"statusDisplay"'; then
  STATUS_DISPLAY=$(echo "$STATUS_RESPONSE" | jq -r '.statusDisplay' 2>/dev/null)
  # Fallback if jq fails or returns null
  if [ "$STATUS_DISPLAY" = "null" ] || [ -z "$STATUS_DISPLAY" ]; then
    STATUS_DISPLAY="http://localhost:3456"
  fi
else
  # Fallback if Claude Manager is not running or API call fails
  STATUS_DISPLAY="http://localhost:3456"
fi

# Use printf with -e flag to properly interpret escape sequences
printf "%s | %s | %b%d%%\e[0m context\n" "$STATUS_DISPLAY" "$STATUS" "$BAR_COLOR" "$CONTEXT_PERCENT"