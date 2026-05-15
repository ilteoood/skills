#!/bin/bash
set -euo pipefail

# Configuration
SOURCE_REPO="github/awesome-copilot"
SOURCE_COMMIT="${SOURCE_COMMIT:-68120732cf9e69de8bec6a2b06a57b7463222440}"  # Parent of the removal commit
TARGET_DIR="skills"
SKILLS_FILE="README.md"

# Skills to sync (corresponds to removed skills from awesome-copilot)
SKILLS=(
  "git-commit"
  "github-issues"
  "github-release"
  "dependabot"
  "gh-cli"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
  cat << EOF
Usage: $0 [OPTIONS]

Sync skills from the source repository (github/awesome-copilot).

OPTIONS:
  -c, --commit SHA    Use specific commit SHA (default: $SOURCE_COMMIT)
  -h, --help          Show this help message

EXAMPLES:
  $0                      # Sync all skills
  $0 -c abc123           # Sync using specific commit

EOF
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -c|--commit)
      SOURCE_COMMIT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

log_info "Fetching skill list from commit $SOURCE_COMMIT..."

# Get tree SHA for the skills directory
TREE_SHA=$(gh api "repos/$SOURCE_REPO/git/trees/$SOURCE_COMMIT?recursive=1" --jq '.tree[] | select(.path == "skills") | .sha')

if [ -z "$TREE_SHA" ]; then
  log_error "Could not find skills directory in commit $SOURCE_COMMIT"
  exit 1
fi

# Get all skill paths
ALL_PATHS=$(gh api "repos/$SOURCE_REPO/git/trees/$TREE_SHA?recursive=1" --jq '.tree[].path')

sync_skill() {
  local skill="$1"
  log_info "Syncing skill: $skill"

  # Create skill directory
  mkdir -p "$TARGET_DIR/$skill/references" 2>/dev/null || true

  # Get skill tree SHA
  local skill_tree=$(gh api "repos/$SOURCE_REPO/git/trees/$TREE_SHA?recursive=1" --jq ".tree[] | select(.path == \"skills/$skill\") | .sha")

  if [ -z "$skill_tree" ]; then
    log_warn "Skill '$skill' not found, skipping..."
    return
  fi

  # Get all files in this skill
  local files=$(gh api "repos/$SOURCE_REPO/git/trees/$skill_tree?recursive=1" --jq '.tree[] | select(.type == "blob") | {path: .path, sha: .sha}')

  # Parse and download each file
  while IFS= read -r line; do
    local path=$(echo "$line" | jq -r '.path')
    local sha=$(echo "$line" | jq -r '.sha')

    # Extract relative path within skill
    local relative_path="${path#skills/$skill/}"
    local local_path="$TARGET_DIR/$skill/$relative_path"

    # Ensure directory exists
    mkdir -p "$(dirname "$local_path")"

    # Download file content
    gh api "repos/$SOURCE_REPO/git/blobs/$sha" --jq '.content' | base64 -d > "$local_path"
    echo "  Downloaded: $relative_path"
  done <<< "$(echo "$files" | jq -c '.')"
}

# Sync each skill
for skill in "${SKILLS[@]}"; do
  sync_skill "$skill"
done

# Update README with current skills
log_info "Updating README.md..."

cat > "$SKILLS_FILE" << 'EOF'
# Skills

Skills for AI agents following the [skills.sh](https://skills.sh) format.

## Structure

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter:
- `name`: Unique identifier (lowercase, hyphens)
- `description`: Brief explanation

## Available Skills

EOF

# Generate skill descriptions from frontmatter
for skill in "${SKILLS[@]}"; do
  if [ -f "$TARGET_DIR/$skill/SKILL.md" ]; then
    local desc=$(grep -A2 '^description:' "$TARGET_DIR/$skill/SKILL.md" | tail -1 | sed 's/^[[:space:]]*//' | tr -d '"')
    echo "- \`$skill/\` - $desc" >> "$SKILLS_FILE"
  fi
done

cat >> "$SKILLS_FILE" << 'EOF'

## Usage

Add skills to your AI agent configuration or use with compatible tools.
EOF

log_info "Sync complete!"
log_info "Run 'git status' to see changes"