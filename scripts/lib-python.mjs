// The harness of the Python checks (check-python.mjs): writes a generated
// filter-design.py to a temp folder and runs it the ways the checks need.
//   runFile(code, { matplotlib })  python -W error on the file, its console
//                       a strict cp1252 one; matplotlib hidden (an import
//                       that fails) unless asked for, then on the Agg backend
//                       (its "cannot be shown" warning, the backend's and not
//                       the file's, let through): { status, stdout, stderr }
//   readResults(code, extra)  the file run through runpy, stdout discarded,
//                       and the names its results comment lists read back as
//                       JSON, with the names of `extra` (SETTINGS a check
//                       reads: resistors, placement...) when the file holds
//                       them: { results, missing, stop, stdout }. A file that
//                       stops (SystemExit) gives stop, its message, and the
//                       names it had computed before it (the same code run
//                       again in a plain namespace, which keeps them); one
//                       that fails gives stop as the error's type and message.
//   inspect(code)       { ascii, parse38 (null, or the error of
//                       ast.parse(feature_version=(3, 8))), newer (the names
//                       of library APIs newer than 3.8 it uses), imports (the
//                       modules it imports), twice (the functions defined
//                       more than once at the top level: the last would
//                       silently replace the others) }
//   resultNames(code)   the names the comment "After a run, these names hold
//                       the results: ..." lists
//   editSetting(code, name, value)  the file with the line `name = ...` of
//                       its SETTINGS set to `name = value` (value: Python text)
//   cleanup()           removes the temp folder
// Python 3.8 or newer must be on PATH as `python`.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = null;
let count = 0;

/** The temp folder, with the driver and the package that hides matplotlib, made on first use. */
function folder() {
	if (dir) return dir;
	dir = mkdtempSync(join(tmpdir(), 'rbt56-python-'));
	mkdirSync(join(dir, 'nompl', 'matplotlib'), { recursive: true });
	writeFileSync(join(dir, 'nompl', 'matplotlib', '__init__.py'), 'raise ImportError("matplotlib hidden by the check")\n');
	writeFileSync(join(dir, 'driver.py'), DRIVER);
	return dir;
}

/** Writes the code to a fresh file of the temp folder and returns its path. */
function fileOf(code) {
	const path = join(folder(), `filter-design-${++count}.py`);
	writeFileSync(path, code);
	return path;
}

/** python with these arguments in the temp folder, matplotlib hidden unless `matplotlib`. */
function python(args, { matplotlib = false } = {}) {
	const env = { ...process.env, PYTHONIOENCODING: 'cp1252:strict', PYTHONDONTWRITEBYTECODE: '1' };
	if (matplotlib) env.MPLBACKEND = 'Agg';
	else env.PYTHONPATH = join(folder(), 'nompl');
	const r = spawnSync('python', args, { cwd: folder(), env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.error) throw r.error;
	return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

export function runFile(code, { matplotlib = false } = {}) {
	const path = fileOf(code);
	const warn = matplotlib ? ['-W', 'error', '-W', 'ignore:FigureCanvasAgg is non-interactive:UserWarning'] : ['-W', 'error'];
	return python([...warn, path], { matplotlib });
}

/** The names the results comment lists, in order. */
export function resultNames(code) {
	const lines = code.split('\n');
	const at = lines.findIndex((l) => /^# After a run, these names hold the results:/.test(l));
	if (at < 0) return [];
	let text = lines[at].replace(/^# After a run, these names hold the results:/, '');
	for (let i = at + 1; i < lines.length && /^# /.test(lines[i]); i++) text += ` ${lines[i].slice(2)}`;
	return text
		.replace(/\.\s*$/, '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export function readResults(code, extra = []) {
	const path = fileOf(code);
	const names = resultNames(code);
	const r = python(['-W', 'error', join(folder(), 'driver.py'), 'results', path, names.join(','), extra.join(',')]);
	if (r.status !== 0) throw new Error(`the driver failed on ${path}: ${r.stderr.slice(-2000)}`);
	return JSON.parse(r.stdout);
}

export function inspect(code) {
	const path = fileOf(code);
	const r = python([join(folder(), 'driver.py'), 'inspect', path]);
	if (r.status !== 0) throw new Error(`the driver failed on ${path}: ${r.stderr.slice(-2000)}`);
	return JSON.parse(r.stdout);
}

export function editSetting(code, name, value) {
	const re = new RegExp(`^${name} = [^\\n]*$`, 'm');
	if (!re.test(code)) throw new Error(`no setting ${name} in the file`);
	return code.replace(re, `${name} = ${value}`);
}

export function cleanup() {
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = null;
}

/*
 * The driver, run by python: `results <file> <names>` and `inspect <file>`,
 * each printing one line of JSON.
 */
const DRIVER = `import ast
import contextlib
import io
import json
import runpy
import sys

# library names newer than Python 3.8 (attributes and modules), by version
NEWER = {
    "cbrt": "3.11", "exp2": "3.11", "nextafter": "3.9", "ulp": "3.9", "lcm": "3.9",
    "sumprod": "3.12", "fma": "3.13", "pairwise": "3.10", "batched": "3.12",
    "removeprefix": "3.9", "removesuffix": "3.9", "bit_count": "3.10", "cache": "3.9",
    "randbytes": "3.9", "aiter": "3.10", "anext": "3.10", "zoneinfo": "3.9",
    "graphlib": "3.9", "tomllib": "3.11",
}


def results(path, names, extra):
    out = {"stop": None, "results": {}, "missing": []}
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            g = runpy.run_path(path, run_name="__main__")
    except (SystemExit, Exception) as e:
        # (a stop gives its message; an error, its type and message, as a stop the checks then report)
        out["stop"] = str(e.code) if isinstance(e, SystemExit) else f"{type(e).__name__}: {e}"
        g = {"__name__": "__main__", "__file__": path}
        with open(path, encoding="ascii") as f:
            code = compile(f.read(), path, "exec")
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                exec(code, g)
        except (SystemExit, Exception):
            pass
    out["stdout"] = buf.getvalue()
    for name in names:
        if name in g:
            out["results"][name] = g[name]
        else:
            out["missing"].append(name)
    for name in extra:
        if name in g:
            out["results"][name] = g[name]
    print(json.dumps(out, allow_nan=False))


def inspect(path):
    with open(path, "rb") as f:
        raw = f.read()
    out = {"ascii": all(b < 128 for b in raw), "parse38": None, "newer": [], "imports": [], "twice": []}
    try:
        tree = ast.parse(raw.decode("ascii", "replace"), feature_version=(3, 8))
    except SyntaxError as e:
        out["parse38"] = f"{e.msg} (line {e.lineno})"
        print(json.dumps(out))
        return
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr in NEWER:
            out["newer"].append(f"{node.attr} ({NEWER[node.attr]})")
        if isinstance(node, ast.Name) and node.id in NEWER:
            out["newer"].append(f"{node.id} ({NEWER[node.id]})")
        if isinstance(node, ast.keyword) and node.arg == "strict":
            out["newer"].append("strict= (3.10)")
        if isinstance(node, ast.Import):
            out["imports"] += [a.name for a in node.names]
        if isinstance(node, ast.ImportFrom):
            out["imports"].append(node.module)
    defined = [node.name for node in tree.body if isinstance(node, ast.FunctionDef)]
    out["twice"] = sorted({name for name in defined if defined.count(name) > 1})
    print(json.dumps(out))


if __name__ == "__main__":
    if sys.argv[1] == "results":
        names = [n for n in sys.argv[3].split(",") if n]
        results(sys.argv[2], names, [n for n in sys.argv[4].split(",") if n])
    else:
        inspect(sys.argv[2])
`;
