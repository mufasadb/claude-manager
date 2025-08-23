#!/bin/bash

TRANSCRIPT_PATH="/Users/danielbeach/.claude/projects/-Users-danielbeach-Code-claude-manager/6d272c4d-0c14-47b1-a42e-0e2cdb4ae890.jsonl"

echo "Testing basic filtering..."
cat "$TRANSCRIPT_PATH" | jq 'select(.message.usage != null)' | wc -l

echo "Testing token extraction..."
cat "$TRANSCRIPT_PATH" | jq 'select(.message.usage != null) | .message.usage' | head -2

echo "Testing tool detection..."
cat "$TRANSCRIPT_PATH" | jq 'select(.message.content != null) | select((.message.content | length) > 0) | .message.content[0].type' | head -5