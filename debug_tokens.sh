#!/bin/bash

TRANSCRIPT_PATH="/Users/danielbeach/.claude/projects/-Users-danielbeach-Code-claude-manager/6d272c4d-0c14-47b1-a42e-0e2cdb4ae890.jsonl"

# Run the same logic as statusline
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
    message_tokens: (map(select(.type == "user" or .type == "assistant") | select(.has_tools | not) | select(.is_system | not) | select((.content_str | test("CLAUDE\\.md|memory|context")) | not) | .input + .output) | add // 0)
  }' > /tmp/debug_tokens.json

echo "Token counts:"
cat /tmp/debug_tokens.json | jq '.'

echo -e "\nPercentages:"
SYSTEM_PROMPT_TOKENS=$(cat /tmp/debug_tokens.json | jq -r '.system_prompt_tokens')
SYSTEM_TOOL_TOKENS=$(cat /tmp/debug_tokens.json | jq -r '.system_tool_tokens')
MCP_TOOL_TOKENS=$(cat /tmp/debug_tokens.json | jq -r '.mcp_tool_tokens')
CUSTOM_AGENT_TOKENS=$(cat /tmp/debug_tokens.json | jq -r '.custom_agent_tokens')
MEMORY_TOKENS=$(cat /tmp/debug_tokens.json | jq -r '.memory_tokens')
MESSAGE_TOKENS=$(cat /tmp/debug_tokens.json | jq -r '.message_tokens')

echo "SYSTEM_PROMPT_TOKENS: $SYSTEM_PROMPT_TOKENS"
echo "SYSTEM_TOOL_TOKENS: $SYSTEM_TOOL_TOKENS"
echo "MCP_TOOL_TOKENS: $MCP_TOOL_TOKENS"
echo "CUSTOM_AGENT_TOKENS: $CUSTOM_AGENT_TOKENS"
echo "MEMORY_TOKENS: $MEMORY_TOKENS"
echo "MESSAGE_TOKENS: $MESSAGE_TOKENS"

SYSTEM_PROMPT_PERCENT=$(( (SYSTEM_PROMPT_TOKENS + 0) * 100 / 200000 ))
SYSTEM_TOOL_PERCENT=$(( (SYSTEM_TOOL_TOKENS + 0) * 100 / 200000 ))
MCP_TOOL_PERCENT=$(( (MCP_TOOL_TOKENS + 0) * 100 / 200000 ))
CUSTOM_AGENT_PERCENT=$(( (CUSTOM_AGENT_TOKENS + 0) * 100 / 200000 ))
MEMORY_PERCENT=$(( (MEMORY_TOKENS + 0) * 100 / 200000 ))
MESSAGE_PERCENT=$(( (MESSAGE_TOKENS + 0) * 100 / 200000 ))

echo "SYSTEM_PROMPT_PERCENT: $SYSTEM_PROMPT_PERCENT"
echo "SYSTEM_TOOL_PERCENT: $SYSTEM_TOOL_PERCENT"
echo "MCP_TOOL_PERCENT: $MCP_TOOL_PERCENT"
echo "CUSTOM_AGENT_PERCENT: $CUSTOM_AGENT_PERCENT"
echo "MEMORY_PERCENT: $MEMORY_PERCENT"
echo "MESSAGE_PERCENT: $MESSAGE_PERCENT"