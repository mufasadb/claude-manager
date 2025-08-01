const COMMON_HOOKS = {
  PreToolUse: [
    {
      name: 'Prevent Dangerous Commands',
      pattern: 'Bash',
      command: 'echo "Validating command safety..." && if echo "$CLAUDE_TOOL_INPUT" | grep -E "(rm -rf|sudo rm|chmod 777|> /etc/)" > /dev/null; then echo "Dangerous command blocked!" && exit 1; fi'
    },
    {
      name: 'Git Commit Validation',
      pattern: 'git_commit',
      command: 'echo "Running pre-commit validation..." && if [ -f .pre-commit-config.yaml ]; then pre-commit run --all-files; fi'
    },
    {
      name: 'API Key Check',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Checking for API keys..." && if grep -r "sk-[a-zA-Z0-9]\\{48\\}" $CLAUDE_FILE_PATHS > /dev/null 2>&1; then echo "API key detected - review before commit!" && exit 1; fi'
    },
    {
      name: 'File Permission Check',
      pattern: 'Write',
      command: 'echo "Checking file permissions..." && if [ ! -w "$CLAUDE_FILE_PATHS" ]; then echo "No write permission!" && exit 1; fi'
    },
    {
      name: 'Backup Important Files',
      pattern: 'Edit|MultiEdit',
      command: 'echo "Creating backup..." && for file in $CLAUDE_FILE_PATHS; do cp "$file" "$file.backup.$(date +%Y%m%d_%H%M%S)"; done'
    }
  ],
  PostToolUse: [
    {
      name: 'Auto Format Code',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Auto-formatting code..." && for file in $CLAUDE_FILE_PATHS; do if [[ "$file" == *.py ]]; then black "$file" && isort "$file"; elif [[ "$file" == *.js || "$file" == *.ts ]]; then npx prettier --write "$file"; elif [[ "$file" == *.go ]]; then gofmt -w "$file"; fi; done'
    },
    {
      name: 'Run Tests',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Running tests..." && if [ -f package.json ]; then npm test; elif [ -f requirements.txt ]; then python -m pytest; elif [ -f go.mod ]; then go test ./...; fi'
    },
    {
      name: 'Git Auto-Add',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Auto-adding to git..." && git add $CLAUDE_FILE_PATHS && echo "Files staged for commit"'
    },
    {
      name: 'Lint Code',
      pattern: 'Write|Edit|MultiEdit',
      command: 'echo "Linting code..." && for file in $CLAUDE_FILE_PATHS; do if [[ "$file" == *.py ]]; then ruff check --fix "$file"; elif [[ "$file" == *.js || "$file" == *.ts ]]; then npx eslint --fix "$file"; fi; done'
    },
    {
      name: 'Log Changes',
      pattern: '*',
      command: 'echo "$(date): Tool $CLAUDE_TOOL_NAME executed on $CLAUDE_FILE_PATHS" >> ~/.claude-activity.log'
    }
  ],
  Notification: [
    {
      name: 'Desktop Notification',
      pattern: '*',
      command: 'osascript -e "display notification \\"$CLAUDE_NOTIFICATION\\" with title \\"Claude Code\\" sound name \\"Glass\\""'
    },
    {
      name: 'TTS Alert',
      pattern: '*',
      command: 'TEMP_FILE=$(mktemp).wav && curl -s -X POST "http://100.83.40.11:8080/v1/tts" -H "Content-Type: application/json" -d "{\\"text\\": \\"$CLAUDE_NOTIFICATION\\"}" -o "$TEMP_FILE" && afplay "$TEMP_FILE" && rm "$TEMP_FILE"'
    },
    {
      name: 'Slack Notification',
      pattern: '*',
      command: 'curl -X POST -H "Content-Type: application/json" -d "{\\"text\\": \\"Claude Code: $CLAUDE_NOTIFICATION\\"}" $SLACK_WEBHOOK_URL'
    },
    {
      name: 'Email Alert',
      pattern: '*',
      command: 'echo "Claude Code Alert: $CLAUDE_NOTIFICATION" | mail -s "Claude Code Notification" $EMAIL_ADDRESS'
    },
    {
      name: 'Log Notification',
      pattern: '*',
      command: 'echo "$(date): $CLAUDE_NOTIFICATION" >> ~/.claude-notifications.log'
    }
  ],
  Stop: [
    {
      name: 'Success Notification',
      pattern: '*',
      command: 'osascript -e "display notification \\"Claude has completed the task!\\" with title \\"Claude Code\\" sound name \\"Purr\\""'
    },
    {
      name: 'Generate Summary',
      pattern: '*',
      command: 'echo "Task completed at $(date)" >> ~/.claude-session-summary.log'
    },
    {
      name: 'Cleanup Temp Files',
      pattern: '*',
      command: 'echo "Cleaning up..." && find /tmp -name "claude-*" -type f -mtime +1 -delete'
    },
    {
      name: 'Backup Project',
      pattern: '*',
      command: 'echo "Creating project backup..." && tar -czf "backup-$(date +%Y%m%d_%H%M%S).tar.gz" . --exclude="node_modules" --exclude=".git" --exclude="backup-*"'
    },
    {
      name: 'Push to Git',
      pattern: '*',
      command: 'echo "Pushing to git..." && git add -A && git commit -m "Auto-commit: Claude session completed" && git push'
    }
  ],
  SubagentStop: [
    {
      name: 'TTS Subagent Complete',
      pattern: '*',
      command: 'node /Users/danielbeach/Code/claude-manager/experiments/tts/scripts/subagent-tts-hook.js'
    },
    {
      name: 'Subagent Complete Notification',
      pattern: '*',
      command: 'osascript -e "display notification \\"Subagent task completed!\\" with title \\"Claude Code\\" sound name \\"Tink\\""'
    },
    {
      name: 'Log Subagent Activity',
      pattern: '*',
      command: 'echo "$(date): Subagent completed task" >> ~/.claude-subagent.log'
    },
    {
      name: 'Validate Subagent Output',
      pattern: '*',
      command: 'echo "Validating subagent output..." && if [ -f "subagent-output.json" ]; then python -m json.tool subagent-output.json > /dev/null; fi'
    },
    {
      name: 'Merge Subagent Results',
      pattern: '*',
      command: 'echo "Processing subagent results..." && if [ -f "merge-results.sh" ]; then bash merge-results.sh; fi'
    },
    {
      name: 'Archive Subagent Data',
      pattern: '*',
      command: 'echo "Archiving subagent data..." && mkdir -p ~/.claude/subagent-archive && cp -r subagent-* ~/.claude/subagent-archive/ 2>/dev/null || true'
    }
  ]
};

module.exports = { COMMON_HOOKS };