const { execFileSync } = require('child_process');

function runGit(repoRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function tryRunGit(repoRoot, args) {
  try {
    return runGit(repoRoot, args);
  } catch {
    return '';
  }
}

function assertPublishedSyncSource(repoRoot) {
  const branch = runGit(repoRoot, ['branch', '--show-current']);
  if (!branch) {
    throw new Error('Refusing --sync from a detached HEAD. Check out the published build branch first.');
  }

  const remote = tryRunGit(repoRoot, ['config', '--get', `branch.${branch}.remote`]);
  if (!remote) {
    throw new Error(`Refusing --sync: branch ${branch} has no configured upstream remote.`);
  }

  runGit(repoRoot, ['fetch', '--quiet', '--no-tags', '--prune', remote]);

  const upstream = tryRunGit(repoRoot, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}'
  ]);
  if (!upstream) {
    throw new Error(`Refusing --sync: branch ${branch} does not track a published upstream branch.`);
  }
  const [ahead, behind] = runGit(repoRoot, [
    'rev-list',
    '--left-right',
    '--count',
    `HEAD...${upstream}`
  ]).split(/\s+/).map(Number);
  const dirty = runGit(repoRoot, ['status', '--porcelain', '--untracked-files=all']);

  const problems = [];
  if (ahead !== 0 || behind !== 0) {
    problems.push(`HEAD differs from ${upstream} (ahead ${ahead}, behind ${behind})`);
  }
  if (dirty) {
    problems.push('the Prebid.js worktree has uncommitted or untracked files');
  }

  if (problems.length > 0) {
    throw new Error([
      'Refusing --sync because the generated bundle would not be reproducible from published source:',
      ...problems.map(problem => `- ${problem}`),
      'Commit and push the intended source, update the branch with a fast-forward pull, then rerun --sync.'
    ].join('\n'));
  }

  return {
    branch,
    upstream,
    commit: runGit(repoRoot, ['rev-parse', 'HEAD'])
  };
}

module.exports = { assertPublishedSyncSource };
