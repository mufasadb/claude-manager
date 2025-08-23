#!/bin/bash

TRANSCRIPT_PATH="/Users/danielbeach/.claude/projects/-Users-danielbeach-Code-claude-manager/76fd293e-3ab5-41b7-beb6-f86bde623546.jsonl"

echo "=== Current Session Analysis ==="
echo "File: $TRANSCRIPT_PATH"
echo "File size: $(wc -l < "$TRANSCRIPT_PATH") lines"
echo

# Get basic token totals
echo "=== Basic Token Totals ==="
cat "$TRANSCRIPT_PATH" | jq 'select(.message.usage != null) | .message.usage | (.input_tokens // 0) + (.output_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)' | awk '{sum+=$1} END {print "Total tokens: " sum}'

echo

# Check what MCP tools are actually being used
echo "=== MCP Tool Names Found ==="
cat "$TRANSCRIPT_PATH" | jq -r 'select(.message.content != null) | select((.message.content | type) == "array") | .message.content[] | select(.type == "tool_use") | .name' | grep "mcp__" | sort | uniq -c

echo

# Debug our categorization
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
  {
    system_prompt_tokens: (map(select(.is_system) | .cache_creation) | add // 0),
    system_tool_tokens: (map(select(.has_tools and (.tool_names | length > 0) and (.tool_names | map(test("^(Read|Write|Edit|Bash|Glob|Grep|TodoWrite|Task|WebFetch|WebSearch|LS|MultiEdit|NotebookEdit|ExitPlanMode)$")) | any)) | .input + .output) | add // 0),
    mcp_tool_tokens: (map(select(.has_tools and (.tool_names | length > 0) and (.tool_names | map(test("^mcp__")) | any)) | .input + .output) | add // 0),
    custom_agent_tokens: (map(select(.has_tools and (.tool_names | length > 0) and (.tool_names | map(test("^(test|Researcher|general-purpose|statusline-setup|output-style-setup)$")) | any)) | .input + .output) | add // 0),
    memory_tokens: (map(select(.content_str | test("CLAUDE\\.md|memory|context")) | .input + .output + .cache_creation) | add // 0),
    message_tokens: (map(select(.type == "user" or .type == "assistant") | select(.has_tools | not) | select(.is_system | not) | select((.content_str | test("CLAUDE\\.md|memory|context")) | not) | .input + .output) | add // 0),
    total_cache_read: (map(.cache_read) | add // 0)
  }' > /tmp/debug_current.json

echo "=== Our Token Categorization ==="
cat /tmp/debug_current.json | jq '.'

echo
echo "=== Expected vs Actual ==="
echo "Expected from /context:"
echo "  System prompt: 3.2k (1.6%)"
echo "  System tools: 12.1k (6.0%)"  
echo "  MCP tools: 28.8k (14.4%)"
echo "  Memory files: 4.5k (2.2%)"
echo "  Messages: 58.5k (29.3%)"
echo "  Total: 107k (54%)"

echo
echo "Our calculation:"
MEMORY_TOKENS=$(cat /tmp/debug_current.json | jq -r '.memory_tokens')
MEMORY_PERCENT=$(( (MEMORY_TOKENS + 0) * 100 / 200000 ))
echo "  Memory tokens: $MEMORY_TOKENS ($MEMORY_PERCENT%)"