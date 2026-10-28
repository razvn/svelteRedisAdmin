#!/usr/bin/env bash

# Exit on error
set -e

# Export environment variables for Claude via Z.ai
export ANTHROPIC_BASE_URL="https://gateway.ai.cloudflare.com/v1/7faa5d6d85bf81807471e0f8392aedac/z-ai/custom-zai/api/anthropic"
export ANTHROPIC_AUTH_TOKEN="02fea4390b5d4025ae22aea51655f3e8.HRj77CXCrFuakxrZ"
export API_TIMEOUT_MS=3000000
export CLAUDE_CODE_MAX_CONTEXT_TOKENS=1M
export CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMEN=1

# Run Claude CLI (adjust args as needed)
claude "$@"

