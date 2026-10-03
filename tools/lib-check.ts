// The vendored engine under src/lib/ must be exactly what the last `git subtree pull` brought in.
// An edit made to the vendored copy can never reach game-engine (fix things THERE, then pull), so
// this fails on any difference between src/lib/ and the squash commit of the last pull -- the same
// guard rail the other games run (see the game-engine README, "Working on it").
import { execFileSync } from 'node:child_process';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
let bad = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? '  ok:   ' : '  FAIL: ') + msg); if (!cond) bad++; };

const squash = git('log', '--grep=^git-subtree-dir: src/lib/*$', '--format=%H', '-n', '1');
ok(squash !== '', 'found the subtree squash commit for src/lib (CI needs a full-history checkout)');
if (squash) {
  const split = git('log', '-n', '1', '--format=%B', squash).match(/git-subtree-split: ([0-9a-f]+)/)?.[1] ?? '?';
  const vendored = git('rev-parse', `${squash}^{tree}`);
  const committed = git('rev-parse', 'HEAD:src/lib');
  ok(vendored === committed, `src/lib in HEAD is game-engine's src/ at ${split.slice(0, 7)}, untouched`);
  const dirty = git('status', '--porcelain', '--', 'src/lib');
  ok(dirty === '', `no uncommitted edits under src/lib${dirty ? ':\n' + dirty : ''}`);
}
process.exit(bad ? 1 : 0);
