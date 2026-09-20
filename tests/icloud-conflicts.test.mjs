/* iCloud conflict-copy checks
   ===========================
   Every repo under `~/Documents/claude` lives inside macOS Desktop & Documents
   sync. When iCloud cannot reconcile two versions of a file it keeps both,
   naming the loser `<name> 2.<ext>`. Git's write pattern provokes it
   constantly: `.git/index` is rewritten in place on almost every command, and
   refs are written to a temp file then renamed. In portfolio_tracker a copy of
   `refs/remotes/origin/main` appeared as `main 2` and `git push` failed
   outright with "fatal: bad object".

   THE FENCE, AND WHY IT IS A FILE AND NOT A SYMLINK
   Names ending in `.nosync` are skipped by iCloud, so the real git directory is
   `.git.nosync` and `.git` only points at it. That pointer was a symlink at
   first and it did not hold: within fifteen minutes iCloud renamed
   `sterling-tasks/.git` to `.git 2` and then removed it outright, twice,
   leaving the repo with no `.git` at all. iCloud REPLACES a symlink it thinks
   is in conflict; for a regular FILE it keeps both copies and leaves the
   original alone. So `.git` is now a one-line file, `gitdir: .git.nosync` —
   git's own native mechanism, the same one it uses for worktrees.

   Both forms are accepted below. What is never acceptable is `.git` being a
   real DIRECTORY inside sync scope.

   THE THREE STATES THIS MUST PASS IN (2026-09-20)
   The real fix is to move these repos out of `~/Documents` entirely, and that
   move is now underway (`claude_hub/REPO_RELOCATION_PLAN.md`). A test that only
   passed in one state would have to be rewritten across ten repos on the same
   day the files move, turning two independently revertible events into one flag
   day. So it is written once to be correct in all three:

     1. NOT macOS          → skip. A cloud session is a fresh clone on Linux with
                             nothing syncing it; a real `.git` directory is correct
                             there, and failing it would make this suite unrunnable
                             in the cloud for no gain.
     2. INSIDE sync scope  → the fence MUST be present; its absence is a loud
        (~/Documents,        FAILURE. This is the slide-back detector: a repo back
         ~/Desktop)          under Desktop & Documents with no fence means iCloud is
                             in the object database and nobody is watching.
     3. OUTSIDE sync scope → PASS. No iCloud here, so no fence is needed; a
        (e.g. ~/claude_code) leftover fence only WARNS. That is what lets the move
                             and the later unfencing happen on different days.

   Whatever the state, a fence that EXISTS must still WORK: if `.git` points at a
   `.nosync` directory, that directory must hold a real object database and
   `.gitignore` must exclude it. Those checks follow the fence, not the location.

   Run: node tests/icloud-conflicts.test.mjs                                  */
import { readdirSync, existsSync, lstatSync, readlinkSync, readFileSync, realpathSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The directories macOS "Desktop & Documents" sync covers. Resolved, because a repo
// reached through a symlink is still physically inside sync scope and iCloud treats
// it that way. A PATH test, not an iCloud API call: it cannot tell whether the
// feature is switched on, and it deliberately errs toward demanding the fence.
const realRoot = (() => { try { return realpathSync(ROOT); } catch { return ROOT; } })();
const inSyncScope = [join(homedir(), "Documents"), join(homedir(), "Desktop")]
  .some(d => realRoot === d || realRoot.startsWith(d + sep));
const isMac = platform() === "darwin";
const synced = isMac && inSyncScope;

// `<name> 2.ext` and `<name> 2` — what iCloud appends. A THIRD collision is
// " 3", and so on, so the digit is not pinned to 2.
const CONFLICT = / \d+(\.[^.]+)?$/;
// `synctest` is hub-config/test_sync.sh's throwaway sandbox, which iCloud conflict-copies
// while it sits there; leaving it in scope made merely RUNNING the sandbox fail this test.
const SKIP = new Set(["venv", ".venv", "node_modules", "__pycache__",
                      ".git", ".git.nosync", "_legacy", "synctest"]);

const passed = [], failed = [], warned = [];
const ok = (name, cond, detail = "") => {
  if (cond) { passed.push(name); console.log(`  ✓  ${name}`); }
  else { failed.push(name); console.log(`  ✗  ${name}${detail ? ": " + detail : ""}`); }
};
const warn = (name, detail = "") => {
  warned.push(name);
  console.log(`  !  ${name}${detail ? ": " + detail : ""}`);
};
const skipped = [];
const skip = (name, detail = "") => {
  skipped.push(name);
  console.log(`  -  ${name}${detail ? ": " + detail : ""}`);
};

function walk(dir, skip, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (skip && skip.has(e.name)) continue;
    const p = join(dir, e.name);
    out.push(p);
    // isDirectory() is false for a symlink, so this never follows one.
    if (e.isDirectory()) walk(p, skip, out);
  }
  return out;
}

/* Resolve `.git` in whichever form it takes: a `gitdir:` file, a symlink, or a
   real directory. Returns { kind, target, real }. */
function gitPointer() {
  const p = join(ROOT, ".git");
  // lstat, not exists: a symlink left dangling by iCloud must read as a broken
  // pointer, not as missing.
  const st = safeLstat(p);
  if (!st) return { kind: "missing", target: null, real: p };
  if (st.isSymbolicLink()) {
    const t = readlinkSync(p);
    return { kind: "symlink", target: t, real: join(ROOT, t) };
  }
  if (st.isFile()) {
    const text = readFileSync(p, "utf8").trim();
    if (text.startsWith("gitdir:")) {
      const t = text.slice(7).trim();
      return { kind: "file", target: t, real: join(ROOT, t) };
    }
    return { kind: "file", target: null, real: p };
  }
  return { kind: "dir", target: null, real: p };
}
function safeLstat(p) { try { return lstatSync(p); } catch { return null; } }

console.log("=".repeat(56));
console.log("  iCloud conflict-copy checks");
console.log("=".repeat(56));

// Say which of the three states this run is in, before any result. Without it a reader
// cannot tell a legitimate "no fence needed" pass from a check that was quietly not
// performed — and that ambiguity is the failure mode this whole file exists to remove.
console.log(`\n  ${ROOT}`);
console.log(!isMac ? `  not macOS (${platform()}) — no iCloud here; fence checks skipped`
          : synced ? "  INSIDE macOS Desktop & Documents sync — the fence is REQUIRED"
                   : "  outside macOS Desktop & Documents sync — no fence needed");

console.log("\n── no conflict copies in the working tree ──");
const allHits = walk(ROOT, SKIP).filter(p => CONFLICT.test(p.split("/").pop()));

// iCloud keeps recreating an EMPTY directory at the old `.git` path, over and
// over, for as long as these repos live in sync scope. That is noise, not
// damage: git never looks at it, and `.git.nosync` is untouched. It must not
// fail the push gate, or every autosave is blocked by litter. Anything else —
// a copy with contents, a duplicated source file, a conflict copy of the
// pointer itself — is real and fails.
const isEmptyGitDir = (p) => {
  if (dirname(p) !== ROOT || !/^\.git \d+$/.test(p.split("/").pop())) return false;
  const st = safeLstat(p);
  if (!st || !st.isDirectory()) return false;
  try { return readdirSync(p).length === 0; } catch { return false; }
};
const emptyGit = allHits.filter(isEmptyGitDir);
const hits = allHits.filter(p => !emptyGit.includes(p)).map(p => relative(ROOT, p));

ok("no '<name> 2' files anywhere in the repo", hits.length === 0,
   `${hits.length} found, e.g. ${hits.slice(0, 5).join("; ")}`);
if (emptyGit.length) {
  warn(`${emptyGit.length} empty '.git N' director${emptyGit.length === 1 ? "y" : "ies"} left by iCloud`,
       "harmless litter at the old .git path; " +
       emptyGit.map(p => p.split("/").pop()).join("; ") +
       (synced ? " — remove with rmdir, and note it is evidence the repo is still " +
                 "inside sync scope"
               : " — leftovers from before the move; nothing recreates them out here, " +
                 "so remove with rmdir and they stay gone"));
}

console.log("\n── .git is held outside sync scope ──");
const { kind, target, real } = gitPointer();
const fenced = kind === "file" || kind === "symlink";

// iCloud removed this pointer twice in sterling-tasks, which left the repo with
// no `.git` at all and every git command failing. True everywhere: a repo with no
// `.git` is broken regardless of what is or is not syncing it.
ok(".git exists", kind !== "missing",
   "there is no .git at all — iCloud may have renamed it to '.git 2'; check " +
   "for that, then restore it with `printf 'gitdir: .git.nosync\\n' > .git`");

// Whether the fence is REQUIRED depends entirely on whether iCloud is here.
if (!isMac) {
  skip("the fence is in place where iCloud can reach the repo",
       `not macOS (${platform()}), so there is no iCloud to fence against`);
} else if (synced) {
  // State 2 — the slide-back detector. Loud on purpose.
  ok("the fence is in place where iCloud can reach the repo", fenced,
     kind === "dir"
       ? `${ROOT} is inside macOS Desktop & Documents sync and .git is a real ` +
         "directory — iCloud is in the object database right now, and conflict " +
         "copies of refs will return and break push and fetch. Fence it: " +
         "`mv .git .git.nosync && printf 'gitdir: .git.nosync\\n' > .git`, and add " +
         "`.git.nosync/` to .gitignore"
       : "");
} else {
  // State 3 — out of sync scope. An unfenced repo is the CORRECT end state and a
  // leftover fence is merely stale. Warning, not failure: that is what lets the move
  // and the later unfencing be two separate, independently revertible days.
  ok("no fence needed — the repo is out of iCloud's reach", true);
  if (fenced) {
    warn("the fence is still here but is no longer needed",
         `${ROOT} is outside Desktop & Documents sync, so nothing is conflict-copying ` +
         "this repo. The fence is harmless and still works; retire it when convenient " +
         "with `mv .git.nosync .git` and drop `.git.nosync/` from .gitignore");
  }
}

// A fence that EXISTS must WORK, wherever it is. Git reads this pointer on every
// command, so a broken one is fatal here exactly as it is inside sync scope.
if (fenced) {
  ok("it points at a `.nosync` name iCloud skips",
     !!target && target.endsWith(".nosync"),
     target ? `points at ${target}` : "the .git file has no `gitdir:` line");
  ok("the target exists and holds the object database",
     existsSync(join(real, "objects")) && existsSync(join(real, "HEAD")),
     `${real} is not a git directory`);
}

// The dangerous class. A conflict copy of a REF breaks push and fetch outright,
// where a duplicate asset merely wastes space.
console.log("\n── no conflict copies inside the git directory ──");
const refHits = [], otherHits = [];
if (existsSync(real)) {
  for (const p of walk(real, null)) {
    if (!CONFLICT.test(p.split("/").pop())) continue;
    const rel = relative(real, p);
    (rel.split("/").includes("refs") ? refHits : otherHits).push(rel);
  }
}
ok("no conflict copies under .git/refs (these break push and fetch)",
   refHits.length === 0, refHits.slice(0, 5).join("; "));
ok("no other conflict copies under .git", otherHits.length === 0,
   otherHits.slice(0, 5).join("; "));

// Without this line `git add -A` would try to commit the object database into
// itself. It is the single most important line in .gitignore — but only while there
// IS a `.git.nosync` to ignore. Once the fence is retired the line becomes dead text,
// and demanding it would turn the unfencing into an edit to this file in every repo
// on the same day.
console.log("\n── the fence target is ignored ──");
const gi = join(ROOT, ".gitignore");
ok(".gitignore exists", existsSync(gi));
if (!fenced) {
  skip(".git.nosync/ is ignored",
       "there is no fence to ignore — .git is a real directory, which git excludes " +
       "by itself");
} else if (existsSync(gi)) {
  ok(".git.nosync/ is ignored", readFileSync(gi, "utf8").includes(".git.nosync/"),
     "git would see the whole object database as untracked working-tree content " +
     "and `git add -A` would commit it into itself");
}

// Only when a failure actually IS a conflict copy. A missing fence is a different
// problem with different advice, and `cmp -s 'x 2.js'` sends the reader somewhere
// useless at the one moment they are reading closely.
if (failed.some(n => n.includes("conflict") || n.includes("duplicate"))) {
  console.log("\n  TO FIX: these are iCloud conflict copies, not real files.");
  console.log("  Verify each against its original (`cmp -s 'x 2.js' 'x.js'`),");
  console.log("  then move the copies aside. A conflict copy under .git/refs");
  console.log("  must go immediately: it breaks push and fetch.");
}
console.log(`\n  ${passed.length} passed, ${failed.length} failed` +
            (warned.length ? `, ${warned.length} warned` : "") +
            (skipped.length ? `, ${skipped.length} skipped` : ""));
process.exit(failed.length ? 1 : 0);
