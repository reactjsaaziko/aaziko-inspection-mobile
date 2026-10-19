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

function packageDiff(path) { // plain sentences about external libraries
  const read = (rev) => { try { return JSON.parse(git(["show", `${rev}:${path}`]) || "{}"); } catch { return {}; } };
  const a = read(before), b = read(after), out = [];
  for (const sec of ["dependencies", "devDependencies"]) {
    const x = a[sec] || {}, y = b[sec] || {}, kind = sec === "devDependencies" ? "development tool" : "external library";
    for (const k of Object.keys(y)) if (!(k in x)) out.push(`The ${kind} ${k} was added (version ${y[k]}).`);
    for (const k of Object.keys(x)) if (!(k in y)) out.push(`The ${kind} ${k} was removed.`);
    for (const k of Object.keys(y)) if (k in x && x[k] !== y[k]) out.push(`The ${kind} ${k} was upgraded from version ${x[k]} to ${y[k]}.`);
  }
  const sx = a.scripts || {}, sy = b.scripts || {};
  for (const k of Object.keys(sy)) if (sx[k] !== sy[k]) out.push(`The ${words(k).join(" ")} command of the project was ${k in sx ? "changed" : "added"}.`);
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

// ---- plain-English wording: the document has ONLY sentences — no file names, paths, code names or links ----
const ACR = { api: "API", apis: "APIs", pdf: "PDF", pdfs: "PDFs", url: "link", urls: "links", id: "ID", ids: "IDs", otp: "OTP", hs: "HS", rfq: "RFQ", rfqs: "RFQs",
  lsq: "LSQ", ai: "AI", seo: "SEO", ui: "screen", csv: "CSV", html: "HTML", json: "JSON", jwt: "login token", sms: "SMS", gst: "GST", kyc: "KYC", crm: "CRM",
  faq: "FAQ", faqs: "FAQs", nav: "navigation", btn: "button", img: "image", imgs: "images", msg: "message", msgs: "messages", qty: "quantity", cfg: "configuration",
  config: "configuration", db: "database", req: "request", res: "response", i18n: "translations", dto: "data", ws: "live connection", usd: "USD", inr: "INR",
  b2b: "B2B", cta: "call-to-action", mui: "MUI", en: "English", hi: "Hindi", gu: "Gujarati", ar: "Arabic", fr: "French", es: "Spanish",
  vi: "Vietnamese", zh: "Chinese", js: "", ts: "", jsx: "", tsx: "", mjs: "", cjs: "" };
const VERB = { handle: "handling of", on: "reaction to", use: "shared logic for", get: "getting", fetch: "loading", load: "loading", set: "setting", update: "updating",
  create: "creating", add: "adding", delete: "deleting", remove: "removing", render: "display of", format: "formatting", fmt: "formatting", is: "the check for",
  has: "the check for", can: "the check whether it can", should: "the decision whether to", validate: "validation of", build: "building", parse: "reading",
  to: "conversion to", calc: "calculation of", calculate: "calculation of", compute: "calculation of", init: "setup of", toggle: "switching", open: "opening",
  close: "closing", submit: "submitting", send: "sending", save: "saving", show: "showing", hide: "hiding", go: "going to", check: "checking", reset: "resetting",
  apply: "applying", map: "mapping", normalize: "cleaning up", sanitize: "cleaning", verify: "verification of", generate: "generating", upload: "uploading",
  download: "downloading", export: "exporting", import: "importing", sync: "syncing", process: "processing", select: "selecting", filter: "filtering",
  sort: "sorting", search: "searching", scroll: "scrolling", resolve: "working out", ensure: "making sure of", assert: "checking", find: "finding", list: "listing",
  read: "reading", write: "writing", track: "tracking", notify: "notifying", register: "registering" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const words = (s) => String(s).replace(/^[_$]+/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  .replace(/[_\-.\s/@()[\]]+/g, " ").trim().toLowerCase().split(" ").filter(Boolean).map((w) => (w in ACR ? ACR[w] : w)).filter(Boolean);
const human = (id) => {
  const w = words(id);
  const s = w.length > 1 && VERB[w[0]] ? `${VERB[w[0]]} ${w.slice(1).join(" ")}` : w.join(" ");
  return s.replace(/\b(\w+) \1\b/g, "$1"); // "going to to slide" -> "going to slide"
};
const joinNat = (arr) => { const a = [...new Set(arr.filter(Boolean))]; return a.length <= 1 ? (a[0] || "") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pl = (n, one, many) => (n === 1 ? one : many);
const fmtDate = (d) => { const [y, m, day] = d.split("-").map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; };
const STRUCT_DIR = /^(src|app|lib|source|dist|server|client|java|kotlin|com|res|components?|utils?|helpers?|hooks?|store|api|routes?|controllers?|models?|middlewares?|configs?|__tests__|tests?|e2e|common|shared|services?)$/i;
const GENERIC_FILE = new Set(["index", "page", "route", "routes", "layout", "main", "app", "server", "default", "mod", "init", "__init__"]);
const KINDS = [
  [/(^|\/)(__tests__|tests?|e2e)\/|\.(test|spec)\.[^.]+$/, "automated test set"],
  [/(^|\/)(i18n|locales?|translations?)\//, "translation set"],
  [/(^|\/)routes?\/|\.routes?\.[^.]+$|Route\.[jt]sx?$/, "routing"],
  [/(^|\/)controllers?\/|\.controller\.[^.]+$/, "request handling"],
  [/(^|\/)models?\/|\.model\.[^.]+$|\.schema\.[^.]+$/, "data model"],
  [/(^|\/)middlewares?\/|\.middleware\.[^.]+$/, "request checks"],
  [/(^|\/)(store|redux|slices?)\/|Api\.[jt]sx?$|(^|\/)api\//, "data loading"],
  [/(^|\/)hooks?\/|\/use[A-Z][^/]*\.[jt]sx?$/, "shared logic"],
  [/(^|\/)(utils?|helpers?|common)\//, "helper"],
  [/(^|\/)configs?\/|\.config\.[^.]+$/, "configuration"],
  [/(^|\/)components?\//, "component"],
  [/(^|\/)services?\/|\.service\.[^.]+$/, "service logic"],
  [/\.(jsx|tsx|vue)$/, "screen"],
  [/\.(js|ts|mjs|cjs|py)$/, "logic"],
];
function place(path) { // where in the project, in words
  const segs = path.split("/").slice(0, -1);
  const cp = segs.indexOf("(control-panel)"), pub = segs.indexOf("(public)"), svc = segs.findIndex((s) => /^services?$/.test(s));
  if (cp >= 0) { const sec = segs[cp + 1] === "apps" ? segs[cp + 2] : segs[cp + 1]; return sec ? `the ${human(sec)} section of the control panel` : "the control panel"; }
  if (pub >= 0) { const sec = segs[pub + 1]; return sec ? `the ${human(sec)} section of the public website` : "the public website"; }
  if (svc >= 0 && segs[svc + 1]) { const n = human(segs[svc + 1]); return `the ${n}${/service/.test(n) ? "" : " service"}`; }
  const d = segs.filter((s) => !STRUCT_DIR.test(s) && !s.startsWith(".")).pop();
  return d ? `the ${human(d)} area` : "";
}
function describe(path) { // e.g. "the contract invoice screen in the order process section of the control panel"
  const segs = path.split("/"), file = segs[segs.length - 1];
  let base = file.replace(/\.(test|spec)(?=\.[^.]+$)/, "").replace(/\.[^.]+$/, "").replace(/\.(routes?|controller|model|schema|service|middleware|config)$/i, "");
  if (GENERIC_FILE.has(base.toLowerCase()) || /^\[.*\]$/.test(base)) base = segs[segs.length - 2] || base;
  const kind = (KINDS.find(([re]) => re.test(path)) || [null, "file"])[1];
  let name = human(base)
    .replace(/ (route|routes|router|api|service|controller|model|schema|util|utils|helper|helpers|config|configuration|component|logic|tests?)$/i, "")
    .replace(/^(test|tests) /i, "") || human(base);
  if (kind === "screen") name = name.replace(/ (page|view|screen)$/, "");
  if (kind === "automated test set") name = `automated test set for ${name}`;
  else if (kind === "translation set") name = `${name} translation set`;
  else if (!name.split(" ").includes(kind.split(" ").pop())) name = `${name} ${kind}`;
  let where = place(path);
  const dup = `the ${human(base)} section of `;
  if (where.startsWith(dup)) where = where.slice(dup.length);
  if (where === `the ${human(base)} area`) where = "";
  return where ? `the ${name} in ${where}` : `the ${name}`;
}
const RVERB = { GET: "fetching", POST: "creating or sending", PUT: "updating", PATCH: "updating", DELETE: "deleting" };
const routeHuman = (r) => { const [m, p] = r.split(" "); const noun = p.split("/").filter((s) => s && !s.startsWith(":") && !/^(api|v\d+)$/i.test(s) && !/^\{.*\}$/.test(s)).map(human).join(" "); return `${RVERB[m] || "handling"} ${noun || "the main data"}`; };
const importHuman = (spec) => {
  if (/^(\.|@\/|~\/|\/|src\/)/.test(spec)) { const s = spec.split("/").filter((x) => x && x !== "." && x !== ".."); let b = s.pop() || spec; if (GENERIC_FILE.has(b.toLowerCase())) b = s.pop() || b; return `the ${human(b.replace(/\.[^.]+$/, ""))} part of the code`; }
  return `the ${human(spec.replace(/^node:/, ""))} library`;
};
const envHuman = (e) => words(e).join(" ");
const isTest = (p) => /(^|\/)(__tests__|tests?|e2e)\/|\.(test|spec)\./.test(p);
const FILETYPE = [
  [/^\.aaziko-flow\/|(^|\/)aaziko-changelog\.yml$/, "automatic change documentation"],
  [/\.(css|scss|sass|less)$/i, "styling"], [/(^|\/)(i18n|locales?)\/|\.po$/, "translation"], [/\.(png|jpe?g|gif|svg|webp|ico|avif|bmp)$/i, "image"],
  [/\.(woff2?|ttf|otf|eot)$/i, "font"], [/\.(md|txt|rst)$/i, "written documentation"],
  [/(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.env[^/]*|nginx[^/]*\.conf|Jenkinsfile|\.github\/.*|\.gitlab-ci\.yml)$/, "build and deployment setting"],
  [/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/, "dependency lock"], [/\.(json|ya?ml|toml|ini|xml|properties|gradle)$/i, "settings and data"],
  [/\.html?$/i, "page template"], [/\.sql$/i, "database script"], [/\.(sh|bash|ps1|bat)$/i, "script"],
  [/\.(mp4|mp3|wav|webm|pdf|docx?|xlsx?|pptx?|zip)$/i, "media and document"],
];

// ---- per-file sentences -------------------------------------------------------
const isDocSystem = (p) => /^\.aaziko-flow\/|(^|\/)aaziko-changelog\.yml$/.test(p); // this documentation system's own files
const isCode = (f) => !isDocSystem(f.path) && (CODE_EXT.test(f.path) || /(^|\/)package\.json$/.test(f.path));
const ordered = [...files].sort((a, b) => (isCode(b) - isCode(a)) || ((b.add || 0) + (b.del || 0)) - ((a.add || 0) + (a.del || 0)));
const detailed = new Set(ordered.filter(isCode).map((f) => f.path)); // every code file gets its own sentence

const impact = [];
const said = { new: [], modified: [], removed: [] };
const otherGroups = { new: {}, modified: {}, removed: {} }; // type -> { count, places }

// analyse all code files first, so code MOVED between files is not reported as removed
const results = new Map();
for (const f of ordered) if (detailed.has(f.path) && !f.path.endsWith("package.json")) results.set(f.path, analyze(f));
const addedWhere = new Map();
for (const [p, a] of results) for (const n of a.addedDecl) if (!addedWhere.has(n)) addedWhere.set(n, p);
for (const [p, a] of results) {
  a.movedTo = a.removedDecl.filter((n) => addedWhere.has(n) && addedWhere.get(n) !== p).map((n) => [n, addedWhere.get(n)]);
  const moved = new Set(a.movedTo.map(([n]) => n));
  a.removedDecl = a.removedDecl.filter((n) => !moved.has(n));
  a.removedExported = a.removedExported.filter((n) => !moved.has(n));
}
for (const [p, a] of results) {
  a.movedIn = new Set([...results].flatMap(([q, b]) => (q === p ? [] : b.movedTo.filter(([, to]) => to === p).map(([n]) => n))));
  a.addedDecl = a.addedDecl.filter((n) => !a.movedIn.has(n));
}

let packagesChanged = false;
for (const f of ordered) {
  if (!detailed.has(f.path)) {
    const t = (FILETYPE.find(([re]) => re.test(f.path)) || [null, "other"])[1];
    const g = (otherGroups[f.status][t] ||= { count: 0, places: new Set() });
    g.count++; const w = place(f.path); if (w) g.places.add(w);
    continue;
  }
  if (f.path.endsWith("package.json")) {
    const pk = packageDiff(f.path);
    if (pk.length) { said[f.status].push(...pk); packagesChanged = true; }
    else said[f.status].push(`The project description${place(f.path) ? ` of ${place(f.path)}` : ""} was updated, without any change to its external libraries.`);
    continue;
  }
  const a = results.get(f.path), d = describe(f.path), bits = [];
  const movedGroups = {};
  for (const [n, to] of a.movedTo) (movedGroups[to] ||= []).push(n);
  if (f.status === "new") {
    if (a.addedDecl.length) bits.push(`it provides ${joinNat(a.addedDecl.map(human))}`);
    if (a.movedIn.size) bits.push(`it takes over ${joinNat([...a.movedIn].map(human))} from other parts of the code`);
    if (a.routesAdded.length) bits.push(`it offers new services for ${joinNat(a.routesAdded.map(routeHuman))}`);
    if (a.envAdded.length) bits.push(`it uses the ${joinNat(a.envAdded.map(envHuman))} ${pl(a.envAdded.length, "setting", "settings")}`);
    said.new.push(`A new ${d.replace(/^the /, "")} was added${bits.length ? `; ${bits.join("; ")}` : ""}.`);
  } else if (f.status === "removed") {
    if (a.removedDecl.length) bits.push(`it provided ${joinNat(a.removedDecl.map(human))}`);
    if (a.routesRemoved.length) bits.push(`it offered services for ${joinNat(a.routesRemoved.map(routeHuman))}`);
    said.removed.push(`${cap(d)} was removed${bits.length ? `; ${bits.join("; ")}` : ""}.`);
  } else {
    if (a.addedDecl.length) bits.push(`it now includes ${joinNat(a.addedDecl.map(human))}`);
    if (a.movedIn.size) bits.push(`it took over ${joinNat([...a.movedIn].map(human))} from other parts of the code`);
    if (a.removedDecl.length) bits.push(`${joinNat(a.removedDecl.map(human))} ${pl(a.removedDecl.length, "was", "were")} taken out`);
    for (const [to, names] of Object.entries(movedGroups)) bits.push(`${joinNat(names.map(human))} ${pl(names.length, "was", "were")} moved to ${describe(to)}`);
    if (a.touched.length) bits.push(`the logic for ${joinNat(a.touched.map(human))} was updated`);
    if (a.routesAdded.length) bits.push(`it now offers services for ${joinNat(a.routesAdded.map(routeHuman))}`);
    if (a.routesRemoved.length) bits.push(`it no longer offers services for ${joinNat(a.routesRemoved.map(routeHuman))}`);
    if (a.importsAdded.length) bits.push(`it now also relies on ${joinNat(a.importsAdded.map(importHuman))}`);
    if (a.importsRemoved.length) bits.push(`it no longer relies on ${joinNat(a.importsRemoved.map(importHuman))}`);
    if (a.envAdded.length) bits.push(`it now uses the ${joinNat(a.envAdded.map(envHuman))} ${pl(a.envAdded.length, "setting", "settings")}`);
    if (!bits.length) bits.push("small adjustments were made to its existing lines");
    said.modified.push(`${cap(d)} was changed: ${bits.join("; ")}.`);
  }

  // ---- impact, in sentences
  if (f.status !== "new" && CODE_EXT.test(f.path) && !isTest(f.path)) {
    const deps = importers(f.path);
    const users = joinNat(deps.map(describe));
    if (f.status === "removed" && deps.length) impact.push(`Warning: ${d} was removed, but ${users} still ${pl(deps.length, "uses", "use")} it, so ${pl(deps.length, "it", "they")} will stop working.`);
    else if (deps.length) impact.push(`Because ${d} changed, ${users} ${pl(deps.length, "depends", "depend")} on it and should be checked.`);
    if (deps.length && f.status === "modified") for (const n of a.removedExported) {
      const u = new Set(usersOf(n, f.path)), broken = deps.filter((x) => u.has(x));
      if (broken.length) impact.push(`Warning: ${human(n)} was taken out of ${d}, but ${joinNat(broken.map(describe))} still ${pl(broken.length, "uses", "use")} it.`);
    }
  }
  for (const r of a.routesRemoved) impact.push(`Warning: the service for ${routeHuman(r)} was removed, so any screen or app that calls it will now get an error.`);
  for (const r of a.routesAdded) impact.push(`A new service for ${routeHuman(r)} is now available.`);
  for (const e of a.envAdded) impact.push(`Before deploying, the ${envHuman(e)} setting must be configured on the server.`);
}
for (const status of ["new", "modified", "removed"]) {
  const verb = { new: "added", modified: "updated", removed: "removed" }[status];
  for (const [t, g] of Object.entries(otherGroups[status])) {
    const what = t === "other" ? pl(g.count, "other file", "other files") : `${t} ${pl(g.count, "file", "files")}`;
    said[status].push(`${cap(`${g.count} ${what}`)} ${pl(g.count, "was", "were")} ${verb}${g.places.size ? ` in ${joinNat([...g.places])}` : ""}.`);
  }
}
if (packagesChanged) impact.push("External libraries changed, so they must be installed again and the application rebuilt before deploying.");
if (files.some((f) => CONFIG_FILE.test(f.path) && !isDocSystem(f.path))) impact.push("Build or deployment settings changed, so the build and the deployment should be checked.");
const testCount = files.filter((f) => isTest(f.path)).length;
if (testCount) impact.push(`${testCount} automated test ${pl(testCount, "file was", "files were")} added or changed, so the tests should be run.`);

// ---- summary --------------------------------------------------------------------
const count = (s) => files.filter((f) => f.status === s).length;
const totalAdd = files.reduce((s, f) => s + (f.add || 0), 0), totalDel = files.reduce((s, f) => s + (f.del || 0), 0);
const areas = {};
for (const f of files) { const w = place(f.path) || "the main project folder"; areas[w] = (areas[w] || 0) + 1; }
const topAreas = Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
const summary =
`${HISTORY ? `On ${fmtDate(dateOnly)}, the ${branch} branch received changes to` : `On ${fmtDate(dateOnly)} at ${timeOnly}, a push to the ${branch} branch changed`} ${files.length} ${pl(files.length, "file", "files")}: ${count("new")} added, ${count("modified")} changed and ${count("removed")} removed, with ${totalAdd} lines added and ${totalDel} lines removed in total. Most of the work was in ${joinNat(topAreas)}.`;

const part = (title, list) => (list.length ? `### ${title}\n\n${list.map((s) => `- ${s}`).join("\n")}\n\n` : "");
const entry =
`## ${fmtDate(dateOnly)}${HISTORY ? "" : `, ${timeOnly}`} — ${branch} branch${HISTORY ? " (history)" : ""}

### Summary

${summary}

${part("What was added", said.new)}${part("What was changed", said.modified)}${part("What was removed", said.removed)}### Impact

${(impact.length ? [...new Set(impact)] : ["These changes are self-contained; no other part of the project depends on them."]).map((x) => `- ${x}`).join("\n")}

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
