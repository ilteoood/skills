#!/bin/bash
set -euo pipefail

# Skills to sync from github/awesome-copilot
SKILLS=(
  "git-commit"
  "github-issues"
  "github-release"
  "dependabot"
  "gh-cli"
)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

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
Usage: $0 [SKILL...]

Sync skills from github/awesome-copilot using the skills CLI.

OPTIONS:
  -h, --help          Show this help
  -a, --all           Sync all skills (default)

EXAMPLES:
  $0                  # Sync all skills
  $0 gh-cli           # Sync specific skill
  $0 gh-cli git-commit  # Sync multiple skills

EOF
  exit 0
}

# Default to all skills
TARGET_SKILLS=("${SKILLS[@]}")

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      usage
      ;;
    -a|--all)
      TARGET_SKILLS=("${SKILLS[@]}")
      shift
      ;;
    *)
      TARGET_SKILLS+=("$1")
      shift
      ;;
  esac
done

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  log_error "GitHub CLI (gh) is required. Install: https://cli.github.com/"
  exit 1
fi

SOURCE_REPO="github/awesome-copilot"
SOURCE_COMMIT="68120732cf9e69de8bec6a2b06a57b7463222440"

log_info "Syncing skills from $SOURCE_REPO..."

# Get the tree SHA for the skills directory
TREE_SHA=$(gh api "repos/$SOURCE_REPO/git/trees/$SOURCE_COMMIT?recursive=1" --jq '.tree[] | select(.path == "skills") | .sha')

if [ -z "$TREE_SHA" ]; then
  log_error "Could not find skills directory in commit $SOURCE_COMMIT"
  exit 1
fi

sync_skill() {
  local skill="$1"
  log_info "Syncing $skill..."

  local skill_tree=$(gh api "repos/$SOURCE_REPO/git/trees/$SOURCE_COMMIT?recursive=1" --jq ".tree[] | select(.path == \"skills/$skill\") | .sha")

  if [ -z "$skill_tree" ]; then
    log_warn "Skill '$skill' not found, skipping..."
    return 1
  fi

  # Create skill directory
  mkdir -p "skills/$skill/references"

  # Get all files in this skill
  while IFS read -r path sha; do
    local relative_path="${path#skills/$skill/}"
    local local_path="skills/$skill/$relative_path"

    mkdir -p "$(dirname "$local_path")"
    gh api "repos/$SOURCE_REPO/git/blobs/$sha" --jq '.content' | base64 -d > "$local_path"
    echo "  + $relative_path"
  done < <(gh api "repos/$SOURCE_REPO/git/trees/$skill_tree?recursive=1" --jq '.tree[] | select(.type == "blob") | "\(.path) \(.sha)"')

  log_info "Synced $skill"
  return 0
}

# Sync each skill
for skill in "${TARGET_SKILLS[@]}"; do
  sync_skill "$skill" || true
done

log_info "Sync complete!"

# Update README
{
  echo "# Skills"
  echo ""
  echo "Skills for AI agents following the [skills.sh](https://skills.sh) format."
  echo ""
  echo "## Available Skills"
  echo ""
  for skill in "${SKILLS[@]}"; do
    if [ -f "skills/$skill/SKILL.md" ]; then
      local desc=$(grep -A1 '^description:' "skills/$skill/SKILL.md" 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//;s/^"//;s/"$//')
      echo "- \`$skill/\` - ${desc:-}"
    fi
  done
} > README.md

log_info "README.md updated"