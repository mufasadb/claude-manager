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
    
    # Enhanced token categorization like /context command
    cat "$TRANSCRIPT_PATH" 2>/dev/null | jq '
      select(.message.usage != null) | 
      {
        type: .type,
        input: (.message.usage.input_tokens // 0),
        output: (.message.usage.output_tokens // 0),
        cache_creation: (.message.usage.cache_creation_input_tokens // 0),
        cache_read: (.message.usage.cache_read_input_tokens // 0),
        has_tools: (if (.message.content | type) == "array" then (.message.content | map(select(.type == "tool_use" or .type == "tool_result")) | length > 0) else false end),
        tool_names: (if (.message.content | type) == "array" then [.message.content[] | select(.type == "tool_use") | .name] else [] end),
        is_system: (.type == "system" or (.message.role // "") == "system"),
        content_str: (.message.content | tostring)
      }' 2>/dev/null | jq -s '
      # Calculate detailed categorization
      {
        total_input: (map(.input) | add // 0),
        total_output: (map(.output) | add // 0),
        total_cache_creation: (map(.cache_creation) | add // 0),
        total_cache_read: (map(.cache_read) | add // 0),
        
        # System prompt tokens (cache_creation for system messages)
        system_prompt_tokens: (map(select(.is_system) | .cache_creation) | add // 0),
        
        # System tools (built-in Claude tools)
        system_tool_tokens: (map(select(.has_tools and (.tool_names | length > 0) and (.tool_names | map(test("^(Read|Write|Edit|Bash|Glob|Grep|TodoWrite|Task|WebFetch|WebSearch|LS|MultiEdit|NotebookEdit|ExitPlanMode)$")) | any)) | .input + .output) | add // 0),
        
        # MCP tools (tools starting with mcp__)
        mcp_tool_tokens: (map(select(.has_tools and (.tool_names | length > 0) and (.tool_names | map(test("^mcp__")) | any)) | .input + .output) | add // 0),
        
        # Custom agents (tools starting with agent names or custom patterns)
        custom_agent_tokens: (map(select(.has_tools and (.tool_names | length > 0) and (.tool_names | map(test("^(test|Researcher|general-purpose|statusline-setup|output-style-setup)$")) | any)) | .input + .output) | add // 0),
        
        # Memory files (messages containing CLAUDE.md or memory references)
        memory_tokens: (map(select(.content_str | test("CLAUDE\\.md|memory|context")) | .input + .output) | add // 0),
        
        # Regular conversation messages (non-tool, non-system)
        message_tokens: (map(select(.type == "user" or .type == "assistant") | select(.has_tools | not) | select(.is_system | not) | select((.content_str | test("CLAUDE\\.md|memory|context")) | not) | .input + .output) | add // 0),
        
        # Counts for reference  
        tool_messages: (map(select(.has_tools)) | length),
        user_messages: (map(select(.type == "user")) | length),
        assistant_messages: (map(select(.type == "assistant")) | length)
      }' > /tmp/context_analysis.json 2>/dev/null
    
    # Read the detailed analysis
    if [ -f /tmp/context_analysis.json ]; then
      ANALYSIS=$(cat /tmp/context_analysis.json 2>/dev/null)
      
      # Extract categorized token counts
      SYSTEM_PROMPT_TOKENS=$(echo "$ANALYSIS" | jq -r '.system_prompt_tokens // 0' 2>/dev/null)
      SYSTEM_TOOL_TOKENS=$(echo "$ANALYSIS" | jq -r '.system_tool_tokens // 0' 2>/dev/null)
      MCP_TOOL_TOKENS=$(echo "$ANALYSIS" | jq -r '.mcp_tool_tokens // 0' 2>/dev/null)
      CUSTOM_AGENT_TOKENS=$(echo "$ANALYSIS" | jq -r '.custom_agent_tokens // 0' 2>/dev/null)
      MEMORY_TOKENS=$(echo "$ANALYSIS" | jq -r '.memory_tokens // 0' 2>/dev/null)
      MESSAGE_TOKENS=$(echo "$ANALYSIS" | jq -r '.message_tokens // 0' 2>/dev/null)
      
      # Handle empty values and convert to integers
      SYSTEM_PROMPT_TOKENS=${SYSTEM_PROMPT_TOKENS:-0}
      SYSTEM_TOOL_TOKENS=${SYSTEM_TOOL_TOKENS:-0}
      MCP_TOOL_TOKENS=${MCP_TOOL_TOKENS:-0}
      CUSTOM_AGENT_TOKENS=${CUSTOM_AGENT_TOKENS:-0}
      MEMORY_TOKENS=${MEMORY_TOKENS:-0}
      MESSAGE_TOKENS=${MESSAGE_TOKENS:-0}
      
      # Legacy fallbacks for compatibility
      TOOL_TOKENS=$((SYSTEM_TOOL_TOKENS + MCP_TOOL_TOKENS + CUSTOM_AGENT_TOKENS))
      SYSTEM_TOKENS=$((SYSTEM_PROMPT_TOKENS + MEMORY_TOKENS))
      
      rm -f /tmp/context_analysis.json
    else
      # Fallback values if analysis fails
      SYSTEM_PROMPT_TOKENS=0
      SYSTEM_TOOL_TOKENS=0
      MCP_TOOL_TOKENS=0
      CUSTOM_AGENT_TOKENS=0
      MEMORY_TOKENS=0
      MESSAGE_TOKENS=0
      TOOL_TOKENS=0
      SYSTEM_TOKENS=0
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
  
  # Calculate individual category percentages (matching /context command)
  SYSTEM_PROMPT_PERCENT=$(( (SYSTEM_PROMPT_TOKENS + 0) * 100 / 200000 ))
  SYSTEM_TOOL_PERCENT=$(( (SYSTEM_TOOL_TOKENS + 0) * 100 / 200000 ))
  MCP_TOOL_PERCENT=$(( (MCP_TOOL_TOKENS + 0) * 100 / 200000 ))
  CUSTOM_AGENT_PERCENT=$(( (CUSTOM_AGENT_TOKENS + 0) * 100 / 200000 ))
  MEMORY_PERCENT=$(( (MEMORY_TOKENS + 0) * 100 / 200000 ))
  MESSAGE_PERCENT=$(( (MESSAGE_TOKENS + 0) * 100 / 200000 ))
  
  # Determine biggest consumer for fallback emoji
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
  # Fallback estimation when no transcript available
  DATA_SIZE=${#SESSION_DATA}
  ESTIMATED_TOKENS=$((DATA_SIZE / 4))
  CONTEXT_PERCENT=$((ESTIMATED_TOKENS * 100 / 200000))
  
  # Fallback category estimates (rough approximations)
  SYSTEM_PROMPT_TOKENS=$((ESTIMATED_TOKENS / 10))  # ~10% system prompt
  SYSTEM_TOOL_TOKENS=$((ESTIMATED_TOKENS / 2))     # ~50% system tools
  MCP_TOOL_TOKENS=$((ESTIMATED_TOKENS / 20))       # ~5% MCP tools
  CUSTOM_AGENT_TOKENS=$((ESTIMATED_TOKENS / 100))  # ~1% custom agents
  MEMORY_TOKENS=$((ESTIMATED_TOKENS / 8))          # ~12% memory
  MESSAGE_TOKENS=$((ESTIMATED_TOKENS / 5))         # ~20% messages
  
  # Calculate fallback percentages
  SYSTEM_PROMPT_PERCENT=$((SYSTEM_PROMPT_TOKENS * 100 / 200000))
  SYSTEM_TOOL_PERCENT=$((SYSTEM_TOOL_TOKENS * 100 / 200000))
  MCP_TOOL_PERCENT=$((MCP_TOOL_TOKENS * 100 / 200000))
  CUSTOM_AGENT_PERCENT=$((CUSTOM_AGENT_TOKENS * 100 / 200000))
  MEMORY_PERCENT=$((MEMORY_TOKENS * 100 / 200000))
  MESSAGE_PERCENT=$((MESSAGE_TOKENS * 100 / 200000))
  
  BIGGEST_CONSUMER="unknown"
  if [ $CONTEXT_PERCENT -gt 99 ]; then
    CONTEXT_PERCENT=99
  fi
  if [ $CONTEXT_PERCENT -lt 0 ]; then
    CONTEXT_PERCENT=0
  fi
fi

# Build categorized emoji status string (like /context command)
CATEGORY_EMOJIS=""

# Add each category if it has >0 tokens (show as 1% minimum if non-zero)
if [ "$SYSTEM_PROMPT_TOKENS" -gt 0 ]; then
  DISPLAY_PERCENT=$((SYSTEM_PROMPT_PERCENT > 0 ? SYSTEM_PROMPT_PERCENT : 1))
  CATEGORY_EMOJIS="${CATEGORY_EMOJIS}🧠${DISPLAY_PERCENT}% "
fi

if [ "$SYSTEM_TOOL_TOKENS" -gt 0 ]; then
  DISPLAY_PERCENT=$((SYSTEM_TOOL_PERCENT > 0 ? SYSTEM_TOOL_PERCENT : 1))
  CATEGORY_EMOJIS="${CATEGORY_EMOJIS}⚙️${DISPLAY_PERCENT}% "
fi

if [ "$MCP_TOOL_TOKENS" -gt 0 ]; then
  DISPLAY_PERCENT=$((MCP_TOOL_PERCENT > 0 ? MCP_TOOL_PERCENT : 1))
  CATEGORY_EMOJIS="${CATEGORY_EMOJIS}🔧${DISPLAY_PERCENT}% "
fi

if [ "$CUSTOM_AGENT_TOKENS" -gt 0 ]; then
  DISPLAY_PERCENT=$((CUSTOM_AGENT_PERCENT > 0 ? CUSTOM_AGENT_PERCENT : 1))
  CATEGORY_EMOJIS="${CATEGORY_EMOJIS}🤖${DISPLAY_PERCENT}% "
fi

if [ "$MEMORY_TOKENS" -gt 0 ]; then
  DISPLAY_PERCENT=$((MEMORY_PERCENT > 0 ? MEMORY_PERCENT : 1))
  CATEGORY_EMOJIS="${CATEGORY_EMOJIS}📝${DISPLAY_PERCENT}% "
fi

if [ "$MESSAGE_TOKENS" -gt 0 ]; then
  DISPLAY_PERCENT=$((MESSAGE_PERCENT > 0 ? MESSAGE_PERCENT : 1))
  CATEGORY_EMOJIS="${CATEGORY_EMOJIS}💬${DISPLAY_PERCENT}% "
fi

# Fallback single emoji if no categories detected
if [ -z "$CATEGORY_EMOJIS" ]; then
  case "$BIGGEST_CONSUMER" in
    "tools")
      CATEGORY_EMOJIS="🔧 "
      ;;
    "system")
      CATEGORY_EMOJIS="⚙️ "
      ;;
    "messages")
      CATEGORY_EMOJIS="💬 "
      ;;
    *)
      # Activity-based fallback
      RECENT_DATA=$(echo "$SESSION_DATA" | tail -c 1000)
      if echo "$RECENT_DATA" | grep -qi -E "(test|testing|screenshot|browser|playwright)"; then
        CATEGORY_EMOJIS="🧪 "
      elif echo "$RECENT_DATA" | grep -qi -E "(write|edit|create|multiedit|notebookedit)"; then
        CATEGORY_EMOJIS="✍️ "
      elif echo "$RECENT_DATA" | grep -qi -E "(read|grep|glob|ls|cat)"; then
        CATEGORY_EMOJIS="📖 "
      elif echo "$RECENT_DATA" | grep -qi -E "(plan|todo|thinking|analyze)"; then
        CATEGORY_EMOJIS="🤔 "
      elif echo "$RECENT_DATA" | grep -qi -E "(bash|command|exec|run)"; then
        CATEGORY_EMOJIS="⚡ "
      elif echo "$RECENT_DATA" | grep -qi -E "(search|fetch|web|api)"; then
        CATEGORY_EMOJIS="🔍 "
      elif echo "$RECENT_DATA" | grep -qi -E "(complete|done|finish|ready)"; then
        CATEGORY_EMOJIS="✅ "
      else
        CATEGORY_EMOJIS="💭 "
      fi
      ;;
  esac
fi

# Trim trailing space
CATEGORY_EMOJIS=$(echo "$CATEGORY_EMOJIS" | sed 's/ $//')

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
printf "%s | %s | %b%d%%\e[0m context\n" "$STATUS_DISPLAY" "$CATEGORY_EMOJIS" "$BAR_COLOR" "$CONTEXT_PERCENT"