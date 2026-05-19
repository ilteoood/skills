#!/usr/bin/env node
import { execSync } from 'child_process';
import { mkdir, writeFile, readFile, readdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const DEFAULT_SOURCES = [
  {
    repo: 'github/awesome-copilot',
    branch: 'main',
    skills: [
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
    ],
  },
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
  console.log(`Usage: node sync-skills.js [OPTIONS]

Sync skills from multiple GitHub repos using the GitHub CLI.

OPTIONS:
  -h, --help          Show this help
  -c, --config        Path to config file (default: sync-config.js)
  --list-skills       List all available skills from configured sources

EXAMPLES:
  node sync-skills.js                      # Sync all from default sources
  node sync-skills.js --config my-config.js  # Use custom config

CONFIG FILE FORMAT (sync-config.js):
  export default [
    {
      repo: 'github/owner/repo',
      commit: 'abc123...',
      skills: ['skill-a', 'skill-b'],  // empty = all skills
    },
  ];
`);
  process.exit(0);
}

async function main() {
  let configPath = 'sync-config.js';
  let listSkills = false;

  const args = process.argv.slice(2);
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '-h' || arg === '--help') {
      usage();
    } else if (arg === '-c' || arg === '--config') {
      configPath = args.shift();
    } else if (arg === '--list-skills') {
      listSkills = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }

  try {
    runGh('--version');
  } catch {
    logError('GitHub CLI (gh) is required. Install: https://cli.github.com/');
    process.exit(1);
  }

  const config = await loadConfig(configPath);

  if (listSkills) {
    for (const source of config) {
      console.log(`\n${source.repo}@${source.commit}:`);
      for (const skill of source.skills) {
        console.log(`  - ${skill}`);
      }
    }
    return;
  }

  for (const source of config) {
    await syncFromSource(source);
  }

  logInfo('Sync complete!');
  await updateReadme(config);
  logInfo('README.md updated');
}

async function loadConfig(configPath) {
  try {
    const { default: config } = await import(join(__dirname, configPath));
    return config;
  } catch {
    logWarn(`Config file '${configPath}' not found, using default sources`);
    return DEFAULT_SOURCES;
  }
}

async function syncFromSource(source) {
  const { repo, branch, skills } = source;
  const commit = source.commit || runGh(`api repos/${repo}/branches/${branch} --jq .commit.sha`).trim();
  logInfo(`Syncing from ${repo} (${branch})...`);

  const treeSha = JSON.parse(runGh(`api repos/${repo}/git/trees/${commit}?recursive=1 --jq .`))
    .tree.find(entry => entry.path === 'skills')?.sha;

  if (!treeSha) {
    logError(`Could not find skills directory in ${repo}@${branch}`);
    return;
  }

  for (const skill of skills) {
    await syncSkill(repo, commit, skill);
  }
}

async function syncSkill(repo, commit, skill) {
  logInfo(`  Syncing ${skill}...`);

  const skillTree = JSON.parse(runGh(`api repos/${repo}/git/trees/${commit}?recursive=1 --jq .`))
    .tree.find(entry => entry.path === `skills/${skill}`)?.sha;

  if (!skillTree) {
    logWarn(`    Skill '${skill}' not found, skipping...`);
    return false;
  }

  const dir = join(__dirname, 'skills', skill);
  await mkdir(join(dir, 'references'), { recursive: true });

  const blobs = JSON.parse(runGh(`api repos/${repo}/git/trees/${skillTree}?recursive=1 --jq .`))
    .tree.filter(entry => entry.type === 'blob');

  for (const blob of blobs) {
    const relativePath = blob.path.replace(`skills/${skill}/`, '');
    const localPath = join(dir, relativePath);
    await mkdir(dirname(localPath), { recursive: true });

    const content = runGh(`api repos/${repo}/git/blobs/${blob.sha} --jq .content`);
    const decoded = Buffer.from(content.trim(), 'base64');
    await writeFile(localPath, decoded);
    console.log(`    + ${relativePath}`);
  }

  logInfo(`  Synced ${skill}`);
  return true;
}

async function updateReadme(config) {
  const skillsDir = join(__dirname, 'skills');
  const allSkills = config.flatMap(c => c.skills);

  let readme = `# Skills

Skills for AI agents following the [skills.sh](https://skills.sh) format.

## Available Skills

`;

  try {
    const skillDirs = await readdir(skillsDir);
    for (const skill of skillDirs.sort()) {
      if (!allSkills.includes(skill)) continue;
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