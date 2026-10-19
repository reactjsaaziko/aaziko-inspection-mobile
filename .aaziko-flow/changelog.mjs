#!/usr/bin/env node
// =============================================================================
// Aaziko CHANGE-DOCUMENTATION generator  (NO AI — everything is read from git)
//   runs inside the "Aaziko Changelog" GitHub Action, on a push to ANY branch
//
// On every push it:
//   1. finds which files are NEW, which EXISTING files were MODIFIED, which were REMOVED
//   2. reads the code diff of each file and documents, per file:
//        functions / components / classes added, removed, or changed,
//        API routes added / removed, imports, env vars, package.json deps
//   3. works out the IMPACT: which other files import a changed file, removed
//      code that is still used somewhere, new env vars, config / package changes
//   4. prepends that entry to .aaziko-flow/changelog-source.md (history is NEVER removed)
//   5. builds CHANGELOG.docx (pandoc) and CHANGELOG.pdf (headless Chrome — GitHub
//      can show the PDF in the browser; it cannot show .docx)
// The workflow commits those files to the dedicated `changelog` branch (so no
// production deploy is ever triggered by the document).
// Each entry says which branch was pushed. Commit messages, commit ids and
// author names are NOT shown.
//
// Env (set by the workflow): BEFORE_SHA, AFTER_SHA, BRANCH, BASE_BRANCH
// Node 20+. No npm deps. Needs pandoc (+ Chrome for the PDF) on PATH.
// =============================================================================
import { execSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE = ".aaziko-flow/changelog-source.md"; // history (markdown source)
const DOCX = "CHANGELOG.docx";                      // Word document
const PDF = "CHANGELOG.pdf";                        // same content, viewable on GitHub
const MARKER = "<!-- AAZIKO-CHANGELOG:INSERT-AFTER -->";
const ZERO = "0000000000000000000000000000000000000000";
const DOC_FILES = new Set([DOCX, PDF, SOURCE]);
const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|vue|py)$/;
const CODE_GLOBS = ["*.js", "*.jsx", "*.ts", "*.tsx", "*.mjs", "*.cjs", "*.vue", "*.py"];
const CONFIG_FILE = /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.env[^/]*|vite\.config\.[a-z]+|tsconfig[^/]*\.json|next\.config\.[a-z]+|nginx[^/]*\.conf|\.github\/workflows\/[^/]+)$/;
const GENERIC_NAMES = new Set(["index", "page", "route", "routes", "layout", "types", "utils", "constants", "config", "styles", "helpers", "main", "app", "api"]);

const sh = (cmd) => execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const shSafe = (cmd) => { try { return sh(cmd); } catch { return ""; } };
const git = (args) => {
  try { return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const code = (s) => `\`${s}\``;
const list = (arr) => arr.map(code).join(", "); // complete: never cut a list short

const repo = (() => { const t = git(["rev-parse", "--show-toplevel"]); return t ? t.split("/").pop() : "repo"; })();
let before = (process.env.BEFORE_SHA || "").trim();
const after = (process.env.AFTER_SHA || "").trim() || "HEAD";
const baseBranch = (process.env.BASE_BRANCH || "").trim() || "main"; // repo default branch (new branches are compared to it)
const branch = (process.env.BRANCH || "").trim() || baseBranch;
// History back-fill support (used once to write the work done before this system existed):
//   HISTORY=1          -> wording "on this day" instead of "this push"
//   ENTRY_ONLY=<file>  -> write just the entry markdown to <file>, touch nothing else
//   BUILD_ONLY=1       -> only rebuild CHANGELOG.docx/.pdf from the existing source
const HISTORY = process.env.HISTORY === "1";
const ENTRY_ONLY = (process.env.ENTRY_ONLY || "").trim();
if (process.env.BUILD_ONLY === "1") { buildDocs(); process.exit(0); }

if (!before || before === ZERO || !["commit", "tree"].includes(git(["cat-file", "-t", before]))) {
  // New branch (or unknown "before"): document only what is not already on the default branch.
  const base = branch !== baseBranch ? git(["merge-base", `origin/${baseBranch}`, after]) : "";
  if (base && base === git(["rev-parse", after])) {
    console.log(`[changelog] branch '${branch}' has nothing new vs ${baseBranch} — skipping`);
    process.exit(0);
  }
  before = base || git(["rev-parse", `${after}^`]) || git(["hash-object", "-t", "tree", "/dev/null"]);
}

const when = git(["show", "-s", "--format=%cI", after]) || new Date().toISOString();
const dateOnly = when.slice(0, 10);
const timeOnly = when.slice(11, 16);

// ---- files in this push ------------------------------------------------------
const lines = {};
for (const l of git(["diff", "--numstat", "--no-renames", before, after]).split("\n").filter(Boolean)) {
  const [a, d, ...p] = l.split("\t");
  lines[p.join("\t")] = { add: a === "-" ? null : +a, del: d === "-" ? null : +d };
}
const files = [];
for (const l of git(["diff", "--name-status", "--no-renames", before, after]).split("\n").filter(Boolean)) {
  const [st, ...p] = l.split("\t");
  const path = p.join("\t");
  if (DOC_FILES.has(path)) continue;
  files.push({ path, status: st[0] === "A" ? "new" : st[0] === "D" ? "removed" : "modified", ...(lines[path] || { add: 0, del: 0 }) });
}
if (!files.length) {
  console.log("[changelog] no file changes in this push — skipping");
  process.exit(0);
}

// ---- code analysis helpers ---------------------------------------------------
const DECL = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/,
  /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/,
];
const declName = (line) => { for (const re of DECL) { const m = line.match(re); if (m) return m[1]; } return null; };
const ROUTE = /\b(?:router|app|route|api|server)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi;
const IMPORT = /(?:^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
const ENV = /(?:process\.env\.([A-Z][A-Z0-9_]+)|import\.meta\.env\.([A-Z][A-Z0-9_]+)|os\.getenv\(\s*['"]([A-Z][A-Z0-9_]+))/g;

const collect = (arr, re, pick) => {
  const out = new Set();
  for (const l of arr) for (const m of l.matchAll(re)) out.add(pick(m));
  return out;
};
const minusSet = (a, b) => [...a].filter((x) => !b.has(x));

function analyze(f) {
  const plus = [], minus = [], ctx = [];
  for (const l of git(["diff", "--unified=0", "--no-renames", before, after, "--", f.path]).split("\n")) {
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("@@")) { const c = l.replace(/^@@[^@]*@@\s?/, "").trim(); if (c) ctx.push(c); continue; }
    if (l.startsWith("+")) plus.push(l.slice(1));
    else if (l.startsWith("-")) minus.push(l.slice(1));
  }
  const pd = new Set(plus.map(declName).filter(Boolean));
  const md = new Set(minus.map(declName).filter(Boolean));
  const exportedMinus = new Set(minus.filter((l) => /^\s*export\b/.test(l)).map(declName).filter(Boolean));
  const addedDecl = minusSet(pd, md), removedDecl = minusSet(md, pd), changedDecl = [...pd].filter((x) => md.has(x));
  const touched = new Set(changedDecl);
  for (const c of ctx) { const n = declName(c); if (n && !pd.has(n) && !md.has(n)) touched.add(n); }
  const pr = collect(plus, ROUTE, (m) => `${m[1].toUpperCase()} ${m[2]}`), mr = collect(minus, ROUTE, (m) => `${m[1].toUpperCase()} ${m[2]}`);
  const pi = collect(plus, IMPORT, (m) => m[1] || m[2]), mi = collect(minus, IMPORT, (m) => m[1] || m[2]);
  const pe = collect(plus, ENV, (m) => m[1] || m[2] || m[3]), me = collect(minus, ENV, (m) => m[1] || m[2] || m[3]);
  return {
    addedDecl, removedDecl, touched: [...touched],
    removedExported: removedDecl.filter((n) => exportedMinus.has(n)),
    routesAdded: minusSet(pr, mr), routesRemoved: minusSet(mr, pr),
    importsAdded: minusSet(pi, mi), importsRemoved: minusSet(mi, pi),
    envAdded: minusSet(pe, me),
  };
}

function packageDiff(path) {
  const read = (rev) => { try { return JSON.parse(git(["show", `${rev}:${path}`]) || "{}"); } catch { return {}; } };
  const a = read(before), b = read(after), out = [];
  for (const sec of ["dependencies", "devDependencies"]) {
    const x = a[sec] || {}, y = b[sec] || {};
    for (const k of Object.keys(y)) if (!(k in x)) out.push(`added package ${code(k)} ${y[k]}`);
    for (const k of Object.keys(x)) if (!(k in y)) out.push(`removed package ${code(k)}`);
    for (const k of Object.keys(y)) if (k in x && x[k] !== y[k]) out.push(`upgraded ${code(k)} ${x[k]} → ${y[k]}`);
  }
  const sx = a.scripts || {}, sy = b.scripts || {};
  for (const k of Object.keys(sy)) if (sx[k] !== sy[k]) out.push(`${k in sx ? "changed" : "added"} npm script ${code(k)}`);
  return out;
}

function importers(path) {
  const ext = (path.match(/\.[^./]+$/) || [""])[0];
  const parts = path.slice(0, path.length - ext.length).split("/");
  const base = parts.pop(), parent = parts[parts.length - 1] || "";
  const tokens = [];
  if (GENERIC_NAMES.has(base.toLowerCase())) {
    if (parent) tokens.push(`${parent}/${base}`);
    if (base === "index" && parent) tokens.push(parent);
  } else tokens.push(base);
  if (!tokens.length) return [];
  // only real import / require / dynamic import() statements that point at this file
  const pat = `(from|import|require)[[:space:]]*\\(?[[:space:]]*['"]([^'"]*/)?(${tokens.map(esc).join("|")})(\\.(js|jsx|ts|tsx|mjs|cjs|vue))?['"]`;
  return git(["grep", "-l", "-E", pat, after, "--", ...CODE_GLOBS]).split("\n").filter(Boolean)
    .map((l) => l.slice(after.length + 1)).filter((p) => p !== path);
}
const usersOf = (name, exclude) =>
  git(["grep", "-l", "-w", "-F", name, after, "--", ...CODE_GLOBS]).split("\n").filter(Boolean)
    .map((l) => l.slice(after.length + 1)).filter((p) => p !== exclude);

// ---- build the per-file documentation ---------------------------------------
const lineInfo = (f) => (f.add === null ? "binary file" : f.status === "new" ? `${f.add} lines` : f.status === "removed" ? `${f.del} lines removed` : `+${f.add} / −${f.del} lines`);
const isCode = (f) => CODE_EXT.test(f.path) || f.path.endsWith("package.json");
const ordered = [...files].sort((a, b) => (isCode(b) - isCode(a)) || ((b.add || 0) + (b.del || 0)) - ((a.add || 0) + (a.del || 0)));
const detailed = new Set(ordered.filter(isCode).map((f) => f.path)); // every code file gets a full section

const impact = [];
const sections = { new: [], modified: [], removed: [] };
const others = { new: [], modified: [], removed: [] };

// analyse all detailed code files first, so code MOVED between files is not reported as removed
const results = new Map();
for (const f of ordered) if (detailed.has(f.path) && !f.path.endsWith("package.json")) results.set(f.path, analyze(f));
const addedWhere = new Map(); // name -> file that now defines it
for (const [p, a] of results) for (const n of a.addedDecl) if (!addedWhere.has(n)) addedWhere.set(n, p);
for (const [p, a] of results) {
  a.movedTo = a.removedDecl.filter((n) => addedWhere.has(n) && addedWhere.get(n) !== p).map((n) => [n, addedWhere.get(n)]);
  const moved = new Set(a.movedTo.map(([n]) => n));
  a.removedDecl = a.removedDecl.filter((n) => !moved.has(n));
  a.removedExported = a.removedExported.filter((n) => !moved.has(n));
}
for (const [p, a] of results) {
  const movedIn = [...results].flatMap(([q, b]) => (q === p ? [] : b.movedTo.filter(([, to]) => to === p).map(([n]) => n)));
  a.movedIn = new Set(movedIn);
  a.addedDecl = a.addedDecl.filter((n) => !a.movedIn.has(n));
}

for (const f of ordered) {
  if (!detailed.has(f.path)) { others[f.status].push(`- ${code(f.path)} — ${lineInfo(f)}`); continue; }
  const out = [`#### ${code(f.path)}`, "", `*${f.status === "new" ? "New file" : f.status === "removed" ? "Removed file" : "Existing file, modified"} — ${lineInfo(f)}*`, ""];

  if (f.path.endsWith("package.json")) {
    const pk = packageDiff(f.path);
    out.push(...(pk.length ? pk.map((x) => `- ${x[0].toUpperCase()}${x.slice(1)}`) : ["- Package metadata changed (no dependency changes)."]));
    if (pk.some((x) => /package/.test(x))) impact.push(`Dependencies changed in ${code(f.path)} — run \`npm install\` and rebuild the Docker image before deploying.`);
    sections[f.status].push(out.join("\n"));
    continue;
  }

  const a = results.get(f.path);
  const bullets = [];
  const movedGroups = {};
  for (const [n, to] of a.movedTo) (movedGroups[to] ||= []).push(n);
  if (f.status === "new") {
    if (a.addedDecl.length) bullets.push(`Defines: ${list(a.addedDecl)}.`);
    if (a.movedIn.size) bullets.push(`Code moved here from other files: ${list([...a.movedIn])}.`);
    if (a.routesAdded.length) bullets.push(`Adds API endpoints: ${list(a.routesAdded)}.`);
    if (a.importsAdded.length) bullets.push(`Uses: ${list(a.importsAdded)}.`);
    if (!bullets.length) bullets.push("Data / content file (no functions or components).");
  } else if (f.status === "removed") {
    if (a.removedDecl.length) bullets.push(`It defined: ${list(a.removedDecl)}.`);
    if (a.routesRemoved.length) bullets.push(`Its API endpoints are gone: ${list(a.routesRemoved)}.`);
  } else {
    if (a.addedDecl.length) bullets.push(`Added: ${list(a.addedDecl)}.`);
    if (a.movedIn.size) bullets.push(`Code moved here from other files: ${list([...a.movedIn])}.`);
    if (a.removedDecl.length) bullets.push(`Removed: ${list(a.removedDecl)}.`);
    for (const [to, names] of Object.entries(movedGroups)) bullets.push(`Moved ${list(names)} to ${code(to)}.`);
    if (a.touched.length) bullets.push(`Changed the code inside: ${list(a.touched)}.`);
    if (a.routesAdded.length) bullets.push(`New API endpoints: ${list(a.routesAdded)}.`);
    if (a.routesRemoved.length) bullets.push(`Removed API endpoints: ${list(a.routesRemoved)}.`);
    if (a.importsAdded.length) bullets.push(`Now also uses: ${list(a.importsAdded)}.`);
    if (a.importsRemoved.length) bullets.push(`No longer uses: ${list(a.importsRemoved)}.`);
    if (!bullets.length) bullets.push("Small edits to existing lines (no functions, routes or imports added or removed).");
  }
  if (a.envAdded.length) bullets.push(`Reads environment variables: ${list(a.envAdded)}.`);
  out.push(...bullets.map((b) => `- ${b}`));
  sections[f.status].push(out.join("\n"));

  // ---- impact
  if (f.status !== "new" && CODE_EXT.test(f.path) && !/(^|\/)(__tests__|tests?)\/|\.(test|spec)\./.test(f.path)) {
    const deps = importers(f.path);
    if (f.status === "removed" && deps.length) impact.push(`⚠ ${code(f.path)} was removed but is still imported by ${list(deps)} — those files will break.`);
    else if (deps.length) impact.push(`${code(f.path)} is used by ${deps.length} other file(s): ${list(deps)} — check that they still work.`);
    // removed exported code that another file still imports from THIS file
    if (deps.length && f.status === "modified") for (const n of a.removedExported) {
      const users = new Set(usersOf(n, f.path));
      const broken = deps.filter((d) => users.has(d));
      if (broken.length) impact.push(`⚠ ${code(n)} was removed from ${code(f.path)} but ${list(broken)} still import(s) it from there — they may break.`);
    }
  }
  for (const r of a.routesRemoved) impact.push(`⚠ API endpoint ${code(r)} was removed — any page or app calling it will now get an error.`);
  for (const r of a.routesAdded) impact.push(`New API endpoint ${code(r)} is available.`);
  for (const e of a.envAdded) impact.push(`Code now reads ${code(e)} — make sure it is set in the \`.env\` / deployment.`);
}

for (const f of files) if (CONFIG_FILE.test(f.path)) impact.push(`Build/deploy configuration changed: ${code(f.path)} — re-check the build and deployment.`);
const testFiles = files.filter((f) => /(^|\/)(__tests__|tests?)\/|\.(test|spec)\./.test(f.path));
if (testFiles.length) impact.push(`${testFiles.length} test file(s) were added or changed — run the tests.`);

// ---- overview ------------------------------------------------------------------
const count = (s) => files.filter((f) => f.status === s).length;
const totalAdd = files.reduce((s, f) => s + (f.add || 0), 0), totalDel = files.reduce((s, f) => s + (f.del || 0), 0);
const areas = {};
for (const f of files) { const d = f.path.includes("/") ? f.path.split("/").slice(0, -1).slice(0, 3).join("/") : "(project root)"; areas[d] = (areas[d] || 0) + 1; }
const topAreas = Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d, n]) => `${code(d)} (${n})`);

const overview =
`${HISTORY ? `On this day, branch ${code(branch)} received changes to` : `This push to branch ${code(branch)} changed`} **${files.length} file(s)**: ${count("new")} new, ${count("modified")} modified, ${count("removed")} removed (+${totalAdd} / −${totalDel} lines).

Main areas touched: ${topAreas.join(", ")}.`;

const part = (title, key, otherTitle) => {
  const body = [...sections[key]];
  if (others[key].length) body.push(`**${otherTitle}**\n\n${others[key].join("\n")}`);
  return body.length ? `### ${title}\n\n${body.join("\n\n")}\n\n` : "";
};

const entry =
`## ${HISTORY ? `${dateOnly} — branch \`${branch}\` (history)` : `${dateOnly} ${timeOnly} — branch \`${branch}\``}

### Overview

${overview}

${part("New files", "new", "Other new files")}${part("Changes to existing files", "modified", "Other modified files")}${part("Removed files", "removed", "Other removed files")}### Impact

${(impact.length ? [...new Set(impact)] : ["No other files depend on the changed code — the impact stays inside the files listed above."]).map((x) => `- ${x}`).join("\n")}

---
`;

if (ENTRY_ONLY) {
  writeFileSync(ENTRY_ONLY, entry);
  console.log(`[changelog] entry for ${dateOnly} (${files.length} file(s)) -> ${ENTRY_ONLY}`);
  process.exit(0);
}

// ---------------------------------------------------------------- update source (keeps all history)
const HEADER_NOTE = "> Auto-generated on every push, to any branch. Newest entry first. Old entries are never removed.";
let doc;
if (existsSync(SOURCE)) {
  doc = readFileSync(SOURCE, "utf8").replace(/^> Auto-generated on every [^\n]*$/m, HEADER_NOTE);
} else {
  doc =
`---
title: "Change Documentation — ${repo}"
---

# Change Documentation — ${repo}

${HEADER_NOTE}

${MARKER}
`;
}
if (!doc.includes(MARKER)) doc = doc.replace(/\n\n/, `\n\n${MARKER}\n`);
mkdirSync(dirname(SOURCE), { recursive: true });
writeFileSync(SOURCE, doc.replace(MARKER, `${MARKER}\n\n${entry}`));
console.log(`[changelog] documented ${files.length} file(s) on ${branch} ${dateOnly} ${timeOnly} -> ${SOURCE}`);
buildDocs();

// ---------------------------------------------------------------- keep only the latest version on the changelog branch
// The PDF is rebuilt in full on every push; keeping every old version would grow the
// repo by megabytes per push. The document itself holds all history, so the branch
// only needs its latest state: commit it with no parent and force-push (like gh-pages).
// Only inside the GitHub Action (serialised by its concurrency group).
const docBranch = (process.env.DOC_BRANCH || "").trim();
if (process.env.GITHUB_ACTIONS === "true" && docBranch && docBranch !== baseBranch) {
  const id = { ...process.env, GIT_AUTHOR_NAME: "aaziko-flow bot", GIT_AUTHOR_EMAIL: "github-actions[bot]@users.noreply.github.com",
    GIT_COMMITTER_NAME: "aaziko-flow bot", GIT_COMMITTER_EMAIL: "github-actions[bot]@users.noreply.github.com" };
  try {
    execFileSync("git", ["add", DOCX, PDF, SOURCE], { stdio: "ignore" });
    const tree = git(["write-tree"]);
    const c = execFileSync("git", ["commit-tree", tree, "-m", `docs: document push to ${branch} [skip changelog]`], { encoding: "utf8", env: id }).trim();
    execFileSync("git", ["push", "-q", "--force", "origin", `${c}:refs/heads/${docBranch}`], { stdio: "inherit" });
    execFileSync("git", ["reset", "-q", "--soft", c]); // so the workflow's own commit step finds nothing left to do
    console.log(`[changelog] saved latest document to '${docBranch}' (${c.slice(0, 7)}, single commit)`);
  } catch (e) {
    console.error(`[changelog] single-commit save failed, the workflow will commit normally: ${e?.message || e}`);
  }
}

function buildDocs() {
// ---------------------------------------------------------------- build the Word .docx
try {
  sh(`pandoc ${JSON.stringify(SOURCE)} -o ${JSON.stringify(DOCX)} --toc --toc-depth=2`);
  console.log(`[changelog] built ${DOCX}`);
} catch (e) {
  console.error(`[changelog] pandoc failed (is pandoc installed?): ${e?.message || e}`);
  process.exitCode = 0;
}

// ---------------------------------------------------------------- build the PDF (GitHub shows PDFs in the browser; it cannot show .docx)
// pandoc -> standalone HTML -> headless Chrome "print to PDF" (Chrome is preinstalled on GitHub runners)
try {
  const tmpHtml = ".aaziko-flow/.changelog-tmp.html";
  const tmpCss = ".aaziko-flow/.changelog-tmp.css";
  writeFileSync(tmpCss,
`body{font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#1a1a1a;max-width:820px;margin:0 auto;padding:24px}
h1{font-size:24px;border-bottom:2px solid #333;padding-bottom:6px}
h2{font-size:19px;margin-top:32px;border-bottom:1px solid #ccc;padding-bottom:4px}
h3{font-size:15px;margin-top:18px}
h4{font-size:13px;margin:14px 0 2px}
code{font-family:"DejaVu Sans Mono",monospace;font-size:12px;color:#7a2e0e}
blockquote{color:#555;border-left:3px solid #ccc;margin:0;padding-left:12px}
hr{border:0;border-top:1px solid #ddd;margin:24px 0}
nav#TOC{background:#f7f7f7;padding:8px 16px}
header#title-block-header{display:none}`);
  sh(`pandoc ${JSON.stringify(SOURCE)} -s --toc --toc-depth=2 -c ${JSON.stringify(tmpCss.split("/").pop())} -o ${JSON.stringify(tmpHtml)}`);
  const chrome = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
    .find((b) => shSafe(`command -v ${b}`));
  if (!chrome) throw new Error("no Chrome/Chromium found");
  sh(`${chrome} --headless=new --no-sandbox --disable-gpu --no-pdf-header-footer --disable-pdf-tagging --print-to-pdf=${JSON.stringify(PDF)} ${JSON.stringify("file://" + process.cwd() + "/" + tmpHtml)}`);
  shSafe(`rm -f ${JSON.stringify(tmpHtml)} ${JSON.stringify(tmpCss)}`);
  console.log(`[changelog] built ${PDF}`);
} catch (e) {
  console.error(`[changelog] PDF build failed: ${e?.message || e}`);
  process.exitCode = 0;
}
}
