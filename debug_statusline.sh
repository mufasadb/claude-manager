#!/bin/bash

TRANSCRIPT_PATH="/Users/danielbeach/.claude/projects/-Users-danielbeach-Code-claude-manager/6d272c4d-0c14-47b1-a42e-0e2cdb4ae890.jsonl"

echo "Creating analysis JSON..."
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
    memory_tokens: (map(select(.content_str | test("CLAUDE\\.md|memory|context")) | .input + .output + .cache_creation) | add // 0),
    
    # Regular conversation messages (non-tool, non-system)
    message_tokens: (map(select(.type == "user" or .type == "assistant") | select(.has_tools | not) | select(.is_system | not) | select((.content_str | test("CLAUDE\\.md|memory|context")) | not) | .input + .output) | add // 0),
    
    # Counts for reference  
    tool_messages: (map(select(.has_tools)) | length),
    user_messages: (map(select(.type == "user")) | length),
    assistant_messages: (map(select(.type == "assistant")) | length)
  }' > /tmp/debug_analysis.json

echo "Analysis result:"
cat /tmp/debug_analysis.json