import { createRequire } from 'node:module';
import { existsSync, realpathSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
// TypeScript 7 exposes its AST and native project API through these exports.
const ts = requireWeb('typescript/unstable/ast');
const { API } = requireWeb('typescript/unstable/sync');
const projectRoot = fileURLToPath(new URL('../apps/web/src/', import.meta.url));

export function checkBoundaries(root = projectRoot) {
  const files = readdirSync(root, { recursive: true }).filter(file => /\.[cm]?tsx?$/.test(file));
  const errors = [];
  const api = new API({ cwd: root });
  try {
    const snapshot = api.updateSnapshot({ openFiles: files.map(file => resolve(root, file)) });
    for (const file of files) {
      const full = resolve(root, file);
      const source = snapshot.getDefaultProjectForFile(full)?.program.getSourceFile(full);
      if (!source) { errors.push(`${file}: cannot parse source`); continue; }
      const local = file.replaceAll('\\', '/');
      const owner = /^games\/([^/]+)\//.exec(local)?.[1];
      const shell = /^(app\/|features\/|shared\/|main\.tsx$)/.test(local);
      const registry = local === 'games/registry.ts';
      function inspect(node, argument, dynamic = false) {
        if (!argument || !ts.isStringLiteralLikeNode(argument)) {
          if (dynamic && !registry) errors.push(`${local}: dynamic import must have a resolvable literal specifier`);
          return;
        }
        const specifier = argument.text;
        if (!specifier.startsWith('.') && !isAbsolute(specifier)) {
          if (dynamic && !registry) {
            try { createRequire(full).resolve(specifier); } catch { errors.push(`${local}: cannot resolve ${specifier}`); }
          }
          return;
        }
        const path = resolve(dirname(full), specifier.split('?')[0]);
        const resolved = [path, path + '.ts', path + '.tsx', path + '.js', join(path, 'index.ts'), join(path, 'index.tsx')].find(candidate => existsSync(candidate) && statSync(candidate).isFile());
        if (!resolved) { errors.push(`${local}: cannot resolve ${specifier}`); return; }
        const target = relative(realpathSync(root), realpathSync(resolved)).replaceAll('\\', '/');
        const targetOwner = /^games\/([^/]+)\//.exec(target)?.[1];
        let reason;
        if (owner && targetOwner && owner !== targetOwner) reason = 'cross-game import';
        if (owner && /^(app|features)\//.test(target)) reason = 'game importing shell';
        if (shell && target.startsWith('games/') && !/^games\/(registry|types)\.tsx?$/.test(target)) reason = 'shell importing game implementation';
        if (reason) {
          const pos = source.getLineAndCharacterOfPosition(node.getStart());
          errors.push(`${local}:${pos.line + 1}: ${reason}: ${specifier}`);
        }
      }
      function visit(node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier) inspect(node, node.moduleSpecifier);
        } else if (ts.isImportTypeNode(node)) {
          inspect(node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : node.argument);
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          inspect(node, node.arguments[0], true);
        } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) inspect(node, node.moduleReference.expression);
        node.forEachChild(visit);
      }
      visit(source);
    }
    return errors;
  } finally { api.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkBoundaries();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Game import boundaries: PASS');
}
