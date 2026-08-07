const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const { assertPublishedSyncSource } = require('./sync-source-guard');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createPublishedRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prebid-sync-guard-'));
  const remote = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');

  git(root, 'init', '--bare', remote);
  git(root, 'clone', remote, repo);
  git(repo, 'config', 'user.email', 'sync-guard@example.test');
  git(repo, 'config', 'user.name', 'Sync Guard Test');
  git(repo, 'checkout', '-b', 'feature/sync-v10');
  fs.writeFileSync(path.join(repo, 'manifest.json'), '{"modules":[]}\n');
  git(repo, 'add', 'manifest.json');
  git(repo, 'commit', '-m', 'initial source');
  git(repo, 'push', '-u', 'origin', 'feature/sync-v10');

  return { root, remote, repo };
}

test('accepts a clean checkout exactly matching its published upstream', () => {
  const fixture = createPublishedRepo();
  try {
    const result = assertPublishedSyncSource(fixture.repo);
    assert.equal(result.branch, 'feature/sync-v10');
    assert.equal(result.upstream, 'origin/feature/sync-v10');
    assert.equal(result.commit, git(fixture.repo, 'rev-parse', 'HEAD'));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects uncommitted source changes', () => {
  const fixture = createPublishedRepo();
  try {
    fs.appendFileSync(path.join(fixture.repo, 'manifest.json'), 'dirty\n');
    assert.throws(
      () => assertPublishedSyncSource(fixture.repo),
      /uncommitted or untracked files/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects a branch without a published upstream', () => {
  const fixture = createPublishedRepo();
  try {
    git(fixture.repo, 'checkout', '-b', 'local-only');
    assert.throws(
      () => assertPublishedSyncSource(fixture.repo),
      /no configured upstream remote/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects a local commit that has not been pushed', () => {
  const fixture = createPublishedRepo();
  try {
    fs.appendFileSync(path.join(fixture.repo, 'manifest.json'), 'local\n');
    git(fixture.repo, 'add', 'manifest.json');
    git(fixture.repo, 'commit', '-m', 'local only');
    assert.throws(
      () => assertPublishedSyncSource(fixture.repo),
      /ahead 1, behind 0/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('fetches and rejects a checkout behind its upstream', () => {
  const fixture = createPublishedRepo();
  const publisher = path.join(fixture.root, 'publisher');
  try {
    git(fixture.root, 'clone', fixture.remote, publisher);
    git(publisher, 'config', 'user.email', 'sync-guard@example.test');
    git(publisher, 'config', 'user.name', 'Sync Guard Test');
    git(publisher, 'checkout', 'feature/sync-v10');
    fs.appendFileSync(path.join(publisher, 'manifest.json'), 'remote\n');
    git(publisher, 'add', 'manifest.json');
    git(publisher, 'commit', '-m', 'published update');
    git(publisher, 'push', 'origin', 'feature/sync-v10');

    assert.throws(
      () => assertPublishedSyncSource(fixture.repo),
      /ahead 0, behind 1/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
