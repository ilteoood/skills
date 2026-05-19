#!/usr/bin/env node
import { execSync } from 'child_process';
import { mkdir, writeFile, readFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const SOURCE_REPO = 'github/awesome-copilot';
const SOURCE_COMMIT = '68120732cf9e69de8bec6a2b06a57b7463222440';

const DEFAULT_SKILLS = [
  'codeql',
  'commit-message-storyteller',
  'conventional-commit',
  'create-agentsmd',
  'create-implementation-plan',
  'create-llms',
  'create-readme',
  'create-specification',
  'create-technical-spike',
  'create-tldr-page',
  'dependabot',
  'drawio',
  'gh-cli',
  'git-commit',
  'github-issues',
  'github-release',
];

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

function logInfo(msg) {
  console.log(`${GREEN}[INFO]${NC} ${msg}`);
}

function logWarn(msg) {
  console.warn(`${YELLOW}[WARN]${NC} ${msg}`);
}

function logError(msg) {
  console.error(`${RED}[ERROR]${NC} ${msg}`);
}

function runGh(args) {
  return execSync(`gh ${args}`, { encoding: 'utf8', shell: true });
}

function usage() {
  console.log(`Usage: node sync-skills.js [SKILL...]

Sync skills from github/awesome-copilot using the GitHub CLI.

OPTIONS:
  -h, --help          Show this help
  -a, --all           Sync all skills (default)
  -r, --repo          Source repo (default: github/awesome-copilot)
  -c, --commit        Source commit SHA

EXAMPLES:
  node sync-skills.js                # Sync all skills
  node sync-skills.js gh-cli         # Sync specific skill
  node sync-skills.js gh-cli git-commit  # Sync multiple skills
  node sync-skills.js -r myorg/my-repo -c abc123 my-skill

Skills available:
${DEFAULT_SKILLS.map(s => `  - ${s}`).join('\n')}
`);
  process.exit(0);
}

async function main() {
  let targetSkills = [...DEFAULT_SKILLS];
  let sourceRepo = SOURCE_REPO;
  let sourceCommit = SOURCE_COMMIT;

  const args = process.argv.slice(2);
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '-h' || arg === '--help') {
      usage();
    } else if (arg === '-a' || arg === '--all') {
      targetSkills = [...DEFAULT_SKILLS];
    } else if (arg === '-r' || arg === '--repo') {
      sourceRepo = args.shift();
    } else if (arg === '-c' || arg === '--commit') {
      sourceCommit = args.shift();
    } else {
      targetSkills.push(arg);
    }
  }

  try {
    runGh('--version');
  } catch {
    logError('GitHub CLI (gh) is required. Install: https://cli.github.com/');
    process.exit(1);
  }

  logInfo(`Syncing skills from ${sourceRepo}...`);

  const treeSha = JSON.parse(runGh(`api repos/${sourceRepo}/git/trees/${sourceCommit}?recursive=1 --jq .`))
    .tree.find(entry => entry.path === 'skills')?.sha;

  if (!treeSha) {
    logError(`Could not find skills directory in commit ${sourceCommit}`);
    process.exit(1);
  }

  async function syncSkill(skill) {
    logInfo(`Syncing ${skill}...`);

    const skillTree = JSON.parse(runGh(`api repos/${sourceRepo}/git/trees/${sourceCommit}?recursive=1 --jq .`))
      .tree.find(entry => entry.path === `skills/${skill}`)?.sha;

    if (!skillTree) {
      logWarn(`Skill '${skill}' not found, skipping...`);
      return false;
    }

    const dir = join(__dirname, 'skills', skill);
    await mkdir(join(dir, 'references'), { recursive: true });

    const blobs = JSON.parse(runGh(`api repos/${sourceRepo}/git/trees/${skillTree}?recursive=1 --jq .`))
      .tree.filter(entry => entry.type === 'blob');

    for (const blob of blobs) {
      const relativePath = blob.path.replace(`skills/${skill}/`, '');
      const localPath = join(dir, relativePath);
      await mkdir(dirname(localPath), { recursive: true });

      const content = runGh(`api repos/${sourceRepo}/git/blobs/${blob.sha} --jq .content`);
      const decoded = Buffer.from(content.trim(), 'base64');
      await writeFile(localPath, decoded);
      console.log(`  + ${relativePath}`);
    }

    logInfo(`Synced ${skill}`);
    return true;
  }

  for (const skill of targetSkills) {
    await syncSkill(skill).catch(() => logWarn(`Failed to sync ${skill}`));
  }

  logInfo('Sync complete!');

  await updateReadme();
  logInfo('README.md updated');
}

async function updateReadme() {
  const skillsDir = join(__dirname, 'skills');
  let readme = `# Skills

Skills for AI agents following the [skills.sh](https://skills.sh) format.

## Available Skills

`;

  try {
    const skillDirs = await readdir(skillsDir);
    for (const skill of skillDirs.sort()) {
      const skillMdPath = join(skillsDir, skill, 'SKILL.md');
      try {
        const content = await readFile(skillMdPath, 'utf8');
        const match = content.match(/^description:\s*"([^"]+)"/m);
        const desc = match ? match[1] : '';
        readme += `- \`${skill}/\` - ${desc}\n`;
      } catch {
        readme += `- \`${skill}/\`\n`;
      }
    }
  } catch {
    // skills dir doesn't exist yet
  }

  await writeFile(join(__dirname, 'README.md'), readme);
}

main().catch(err => {
  logError(err.message);
  process.exit(1);
});