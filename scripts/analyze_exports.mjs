// analyze_exports.mjs
//
// Reports exported symbols in src/**/*.ts that are never referenced anywhere
// in the program (cross-file usage, re-exports, includes, and test references
// all count as "used"). Dead-file detection is handled by the companion Python
// script; this focuses on per-symbol reachability.
//
// Reference detection uses the TypeChecker symbol graph: we collect every
// identifier *use* in the program (excluding the symbol's own declaration and
// re-export specifiers), resolve each to a symbol, and compare. This correctly
// follows ".js"->".ts" imports, type-only usage, and re-exports.
//
// Default exports are always treated as alive (served entry surface).
//
// Usage: node scripts/analyze_exports.mjs [repo_root]
// Prints JSON: { "deadExports": [ { "file": "src/foo.ts", "name": "bar" }, ... ] }

import ts from "typescript";
import path from "node:path";
import fs from "node:fs";

const repoRoot = path.resolve(process.argv[2] || process.cwd());
const srcDir = path.join(repoRoot, "src");

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

const files = walk(srcDir);

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: false,
  skipLibCheck: true,
  noEmit: true,
};

function resolveModuleNames(moduleNames, containingFile) {
  return moduleNames.map((name) => {
    if (name.startsWith(".") || path.isAbsolute(name)) {
      const base = path.resolve(path.dirname(containingFile), name);
      const candidates = [
        base + ".ts",
        base.replace(/\.js$/, ".ts"),
        path.join(base, "index.ts"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return { resolvedFileName: c, extension: ts.Extension.Ts };
        }
      }
      return {
        resolvedFileName: base,
        extension: ts.Extension.Ts,
        isExternalLibraryImport: true,
      };
    }
    return {
      resolvedFileName: path.join(repoRoot, "node_modules", name),
      extension: ts.Extension.Ts,
      isExternalLibraryImport: true,
    };
  });
}

const host = ts.createCompilerHost(compilerOptions);
host.resolveModuleNames = resolveModuleNames;
const program = ts.createProgram(files, compilerOptions, host);
const checker = program.getTypeChecker();

// Pre-collect canonical symbols for every identifier use across the program.
// "Canonical" = chase through alias symbols (import specifiers, re-exports) so
// a use in another file resolves to the same symbol as the export.
const usedCanons = new Set();

function canon(sym) {
  let s = sym;
  let guard = 0;
  while (s && s.flags & ts.SymbolFlags.Alias && guard++ < 8) {
    const aliased = checker.getAliasedSymbol(s);
    if (!aliased || aliased === s) break;
    s = aliased;
  }
  return s;
}

function visit(node) {
  if (ts.isIdentifier(node)) {
    const parent = node.parent;
    if (
      (ts.isFunctionDeclaration(parent) ||
        ts.isClassDeclaration(parent) ||
        ts.isInterfaceDeclaration(parent) ||
        ts.isTypeAliasDeclaration(parent) ||
        ts.isEnumDeclaration(parent)) &&
      parent.name === node
    ) {
      // declaration name — definition, not a use; descend into children
    } else if (
      (ts.isVariableDeclaration(parent) ||
        ts.isPropertySignature(parent) ||
        ts.isParameter(parent) ||
        ts.isBindingElement(parent)) &&
      parent.name === node
    ) {
      // variable/param name — skip self; descend into initializer/type
    } else {
      const sym = checker.getSymbolAtLocation(node);
      if (sym) usedCanons.add(canon(sym));
    }
  }
  ts.forEachChild(node, visit);
}

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  if (!sf.fileName.startsWith(srcDir)) continue;
  visit(sf);
}

const deadExports = [];

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const fn = sf.fileName;
  if (!fn.startsWith(srcDir)) continue;

  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) continue;

  const exports = checker.getExportsOfModule(moduleSymbol);
  for (const exp of exports) {
    if (exp.escapedName === "default") continue; // served entry surface

    const decls = exp.declarations || [];
    let localDecl = null;
    for (const d of decls) {
      if (d.getSourceFile().fileName !== fn) continue;
      if (
        ts.isExportSpecifier(d) ||
        ts.isImportSpecifier(d) ||
        ts.isExportAssignment(d)
      ) {
        continue; // re-exported from elsewhere; counted in its own file
      }
      localDecl = d;
      break;
    }
    if (!localDecl) continue;

    // The export's logical symbol is `exp`; chase aliases to its canonical
    // form, then check whether any use's canonical symbol matches.
    if (usedCanons.has(canon(exp))) continue;

    deadExports.push({
      file: path.relative(repoRoot, fn),
      name: String(exp.escapedName),
    });
  }
}

console.log(JSON.stringify({ deadExports }));
