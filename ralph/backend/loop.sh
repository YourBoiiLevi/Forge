#!/bin/bash
set -euo pipefail

# Ralph Backend Loop - Droid Implementation
# Usage:
#   ./loop.sh [plan|build] [max_iterations]
# Examples:
#   ./loop.sh              # Build mode, unlimited iterations
#   ./loop.sh 20           # Build mode, max 20 iterations
#   ./loop.sh plan         # Plan mode, unlimited iterations
#   ./loop.sh plan 5       # Plan mode, max 5 iterations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOOP_NAME="backend"
STATE_FILE="$SCRIPT_DIR/../web-ui/state/backend-state.json"
LOG_DIR="$SCRIPT_DIR/../logs/backend"

# Parse arguments
MODE="build"
MAX_ITERATIONS=0

if [ "${1:-}" = "plan" ]; then
    MODE="plan"
    MAX_ITERATIONS=${2:-0}
elif [[ "${1:-}" =~ ^[0-9]+$ ]]; then
    MAX_ITERATIONS=$1
elif [ -n "${1:-}" ]; then
    echo "Unknown argument: $1"
    echo "Usage: ./loop.sh [plan|build] [max_iterations]"
    exit 1
fi

# Select prompt and model based on mode
if [ "$MODE" = "plan" ]; then
    PROMPT_FILE="$SCRIPT_DIR/PROMPT_plan.md"
    MODEL="claude-opus-4-5-20251101"
    REASONING="high"
else
    PROMPT_FILE="$SCRIPT_DIR/PROMPT_build.md"
    MODEL="gpt-5.2"
    REASONING="medium"
fi

# Verify prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: $PROMPT_FILE not found"
    exit 1
fi

ITERATION=0
CURRENT_BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "main")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Ralph Backend Loop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mode:      $MODE"
echo "Model:     $MODEL"
echo "Reasoning: $REASONING"
echo "Branch:    $CURRENT_BRANCH"
echo "Prompt:    $PROMPT_FILE"
[ $MAX_ITERATIONS -gt 0 ] && echo "Max:       $MAX_ITERATIONS iterations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Function to update state file
update_state() {
    local status=$1
    local message=${2:-""}
    cat > "$STATE_FILE" << EOF
{
  "loop": "backend",
  "mode": "$MODE",
  "iteration": $ITERATION,
  "status": "$status",
  "message": "$message",
  "timestamp": "$(date -Iseconds)",
  "model": "$MODEL",
  "branch": "$CURRENT_BRANCH"
}
EOF
}

# Function to build the full prompt with context
build_prompt() {
    local prompt_content
    prompt_content=$(cat "$PROMPT_FILE")
    
    local agents_content=""
    if [ -f "$SCRIPT_DIR/AGENTS.md" ]; then
        agents_content=$(cat "$SCRIPT_DIR/AGENTS.md")
    fi
    
    cat << EOF
$prompt_content

---

## Context

**Specs Location:** $PROJECT_ROOT/specs/
**Source Location:** $PROJECT_ROOT/src/backend/
**Shared Source:** $PROJECT_ROOT/src/
**Implementation Plan:** $SCRIPT_DIR/IMPLEMENTATION_PLAN.md
**Agents Guide:** $SCRIPT_DIR/AGENTS.md

---

## AGENTS.md Content

$agents_content
EOF
}

# Signal handling for clean shutdown
cleanup() {
    echo ""
    echo "Shutting down backend loop..."
    update_state "stopped" "User interrupted"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Initialize state
update_state "starting" "Initializing backend loop"

# Main loop
while true; do
    if [ $MAX_ITERATIONS -gt 0 ] && [ $ITERATION -ge $MAX_ITERATIONS ]; then
        echo ""
        echo "Reached max iterations: $MAX_ITERATIONS"
        update_state "completed" "Reached max iterations"
        break
    fi

    ITERATION=$((ITERATION + 1))
    LOG_FILE="$LOG_DIR/iteration-$ITERATION.log"
    
    echo ""
    echo "======================== BACKEND ITERATION $ITERATION ========================"
    echo ""
    
    update_state "running" "Starting iteration $ITERATION"
    
    # Build the full prompt
    FULL_PROMPT=$(build_prompt)
    
    # Run droid exec with the prompt
    echo "$FULL_PROMPT" | droid exec \
        --cwd "$PROJECT_ROOT" \
        --model "$MODEL" \
        --reasoning-effort "$REASONING" \
        --skip-permissions-unsafe \
        --output-format stream-json \
        2>&1 | tee "$LOG_FILE"
    
    EXIT_CODE=${PIPESTATUS[0]}
    
    if [ $EXIT_CODE -ne 0 ]; then
        echo "Warning: droid exec exited with code $EXIT_CODE"
        update_state "error" "Iteration $ITERATION failed with exit code $EXIT_CODE"
    else
        update_state "iteration_complete" "Completed iteration $ITERATION"
    fi
    
    # Check if we should push changes (only in build mode)
    if [ "$MODE" = "build" ]; then
        if git -C "$PROJECT_ROOT" diff --quiet 2>/dev/null; then
            echo "No changes to commit"
        else
            echo "Changes detected, pushing to $CURRENT_BRANCH..."
            git -C "$PROJECT_ROOT" push origin "$CURRENT_BRANCH" 2>/dev/null || {
                echo "Failed to push. Creating remote branch..."
                git -C "$PROJECT_ROOT" push -u origin "$CURRENT_BRANCH" 2>/dev/null || true
            }
        fi
    fi
    
    # Check if plan indicates completion
    if [ -f "$SCRIPT_DIR/IMPLEMENTATION_PLAN.md" ]; then
        if grep -qx "ALL TASKS COMPLETE" "$SCRIPT_DIR/IMPLEMENTATION_PLAN.md" 2>/dev/null; then
            echo ""
            echo "Implementation plan indicates all tasks complete!"
            update_state "completed" "All tasks marked complete in implementation plan"
            break
        fi
    fi
    
    echo ""
done

echo ""
echo "Backend loop finished after $ITERATION iterations"
update_state "finished" "Loop completed after $ITERATION iterations"
