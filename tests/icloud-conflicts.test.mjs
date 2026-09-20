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

   Run: node tests/icloud-conflicts.test.mjs                                  */
import { readdirSync, existsSync, lstatSync, readlinkSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// `<name> 2.ext` and `<name> 2` — what iCloud appends. A THIRD collision is
// " 3", and so on, so the digit is not pinned to 2.
const CONFLICT = / \d+(\.[^.]+)?$/;
const SKIP = new Set(["venv", ".venv", "node_modules", "__pycache__",
                      ".git", ".git.nosync", "_legacy"]);

const passed = [], failed = [], warned = [];
const ok = (name, cond, detail = "") => {
  if (cond) { passed.push(name); console.log(`  ✓  ${name}`); }
  else { failed.push(name); console.log(`  ✗  ${name}${detail ? ": " + detail : ""}`); }
};
const warn = (name, detail = "") => {
  warned.push(name);
  console.log(`  !  ${name}${detail ? ": " + detail : ""}`);
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
       " — remove with rmdir, and note it is evidence the repo is still " +
       "inside sync scope");
}

console.log("\n── .git is held outside sync scope ──");
const { kind, target, real } = gitPointer();

// iCloud removed this pointer twice in sterling-tasks, which left the repo with
// no `.git` at all and every git command failing.
ok(".git exists", kind !== "missing",
   "there is no .git at all — iCloud may have renamed it to '.git 2'; check " +
   "for that, then restore it with `printf 'gitdir: .git.nosync\\n' > .git`");
ok(".git is a pointer, not a synced directory",
   kind === "file" || kind === "symlink",
   kind === "dir" ? "it is a real directory inside sync scope — iCloud will " +
                    "resync it and conflict copies will return" : "");
if (kind === "file" || kind === "symlink") {
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
// itself. It is the single most important line in .gitignore.
console.log("\n── the fence target is ignored ──");
const gi = join(ROOT, ".gitignore");
ok(".gitignore exists", existsSync(gi));
if (existsSync(gi)) {
  ok(".git.nosync/ is ignored", readFileSync(gi, "utf8").includes(".git.nosync/"),
     "git would see the whole object database as untracked working-tree content " +
     "and `git add -A` would commit it into itself");
}

if (failed.length) {
  console.log("\n  TO FIX: these are iCloud conflict copies, not real files.");
  console.log("  Verify each against its original (`cmp -s 'x 2.js' 'x.js'`),");
  console.log("  then move the copies aside. A conflict copy under .git/refs");
  console.log("  must go immediately: it breaks push and fetch.");
}
console.log(`\n  ${passed.length} passed, ${failed.length} failed` +
            (warned.length ? `, ${warned.length} warned` : ""));
process.exit(failed.length ? 1 : 0);
