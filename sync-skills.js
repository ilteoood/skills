#!/usr/bin/env node
import { execSync } from 'child_process';
import { mkdir, writeFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const config = await import('./sync-config.js').then(m => m.default);

for (const { repo, branch = 'main', skills } of config) {
  console.log(`Syncing from ${repo} (${branch})...`);

  const commit = execSync(`gh api repos/${repo}/branches/${branch} --jq .commit.sha`, { encoding: 'utf8' }).trim();
  const treeSha = JSON.parse(execSync(`gh api repos/${repo}/git/trees/${commit}?recursive=1 --jq .`, { encoding: 'utf8' }))
    .tree.find(t => t.path === 'skills')?.sha;

  for (const skill of skills) {
    const skillTree = JSON.parse(execSync(`gh api repos/${repo}/git/trees/${commit}?recursive=1 --jq .`, { encoding: 'utf8' }))
      .tree.find(t => t.path === `skills/${skill}`)?.sha;

    if (!skillTree) {
      console.log(`  ${skill}: not found, skipping`);
      continue;
    }

    const dir = join(__dirname, 'skills', skill);
    await mkdir(join(dir, 'references'), { recursive: true });

    const blobs = JSON.parse(execSync(`gh api repos/${repo}/git/trees/${skillTree}?recursive=1 --jq .`, { encoding: 'utf8' }))
      .tree.filter(t => t.type === 'blob');

    for (const blob of blobs) {
      const relativePath = blob.path.replace(`skills/${skill}/`, '');
      const localPath = join(dir, relativePath);
      await mkdir(dirname(localPath), { recursive: true });
      const content = execSync(`gh api repos/${repo}/git/blobs/${blob.sha} --jq .content`, { encoding: 'utf8' });
      await writeFile(localPath, Buffer.from(content.trim(), 'base64'));
      console.log(`  + ${skill}/${relativePath}`);
    }
  }
}

console.log('Done!');