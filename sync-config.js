// Sync configuration - export an array of source repos with their skills
export default [
  {
    repo: 'github/awesome-copilot',
    commit: '68120732cf9e69de8bec6a2b06a57b7463222440',
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
  // Example: Add more sources
  // {
  //   repo: 'github/other-org/other-repo',
  //   commit: 'abc123...',
  //   skills: ['skill-a', 'skill-b'],  // empty array = all skills from that repo
  // },
];
