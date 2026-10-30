import ts from 'typescript';
export interface ProtocolRules { readonly sdkOwners: Readonly<Record<string, readonly string[]>>; readonly clientWords: readonly string[]; readonly paginationOwner: string }
const marker = '@modelcontextprotocol/sdk';
const nodesOf = (root: ts.Node): ts.Node[] => { const rows: ts.Node[] = []; const visit = (node: ts.Node) => { rows.push(node); ts.forEachChild(node, visit); }; visit(root); return rows; };
/** Keep every SDK reference visible and bound to a declared owner and static module role. */
export function sdkOwners(files: Readonly<Record<string, string>>, rules: ProtocolRules) {
  const owners = [], issues: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    if (!text.includes(marker)) continue;
    owners.push(path); const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const imports = nodesOf(tree).filter(ts.isImportDeclaration).filter(n => ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text.startsWith(marker));
    for (const item of imports) if (!rules.sdkOwners[path]?.includes((item.moduleSpecifier as ts.StringLiteral).text)) issues.push(`${path}: undeclared SDK owner or role`);
    for (let at = text.indexOf(marker); at >= 0; at = text.indexOf(marker, at + marker.length)) if (!imports.some(n => at >= n.moduleSpecifier.getStart(tree) && at < n.moduleSpecifier.end)) issues.push(`${path}: SDK reference outside a static import`);
  }
  return { owners: owners.sort(), issues };
}
const binding = (name: string, at: ts.Node): ts.VariableDeclaration | undefined => {
  for (let node: ts.Node | undefined = at; node; node = node.parent) {
    if (ts.isFunctionLike(node) && node.parameters.some(p => ts.isIdentifier(p.name) && p.name.text === name)) return;
    if (ts.isBlock(node) || ts.isSourceFile(node)) for (const statement of node.statements) if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration;
  }
  return undefined;
};
/** Exempt only cursor labels passed to an SDK Client.listTools call and nextCursor on that exact call's result. */
function paginationFields(path: string, text: string, rules: ProtocolRules): readonly (readonly [number, number])[] {
  if (path !== rules.paginationOwner) return [];
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true), nodes = nodesOf(tree), aliases = new Set<string>(), calls = new Set<ts.CallExpression>(), spans: [number, number][] = [];
  for (const node of nodes.filter(ts.isImportDeclaration)) if (ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === marker + '/client/index.js' && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings))
    for (const item of node.importClause.namedBindings.elements) if ((item.propertyName ?? item.name).text === 'Client') aliases.add(item.name.text);
  for (const node of nodes.filter(ts.isCallExpression)) if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'listTools' && ts.isIdentifier(node.expression.expression)) {
    const declaration = binding(node.expression.expression.text, node), init = declaration?.initializer;
    const name = init && ts.isNewExpression(init) && ts.isIdentifier(init.expression) ? init.expression.text : '';
    let parameterShadow = false; for (let parent: ts.Node | undefined = init; parent; parent = parent.parent) if (ts.isFunctionLike(parent) && parent.parameters.some(p => ts.isIdentifier(p.name) && p.name.text === name)) parameterShadow = true;
    if (declaration && (declaration.parent.flags & ts.NodeFlags.Const) && name && aliases.has(name) && !binding(name, init!) && !parameterShadow) calls.add(node);
  }
  for (const node of nodes) {
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === 'cursor') {
      const direct = (expression: ts.Expression): boolean => expression === node.parent || (ts.isParenthesizedExpression(expression) && direct(expression.expression)) || (ts.isConditionalExpression(expression) && (direct(expression.whenTrue) || direct(expression.whenFalse)));
      if (ts.isObjectLiteralExpression(node.parent) && [...calls].some(call => call.arguments[0] && direct(call.arguments[0]))) spans.push([node.name.getStart(tree), node.name.end]);
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'nextCursor' && ts.isIdentifier(node.expression)) {
      const result = binding(node.expression.text, node), init = result?.initializer;
      if (result && (result.parent.flags & ts.NodeFlags.Const) && init && ts.isAwaitExpression(init) && ts.isCallExpression(init.expression) && calls.has(init.expression)) spans.push([node.name.getStart(tree), node.name.end]);
    }
  }
  return spans;
}
export function clientWords(files: Readonly<Record<string, string>>, rules: ProtocolRules): readonly string[] {
  return Object.entries(files).flatMap(([path, text]) => {
    const fields = paginationFields(path, text, rules), lower = text.toLowerCase();
    return rules.clientWords.filter(word => { for (let at = lower.indexOf(word); at >= 0; at = lower.indexOf(word, at + word.length)) if (word !== 'cursor' || !fields.some(([start, end]) => at >= start && at + word.length <= end)) return true; return false; }).map(word => `${path}: ${word}`);
  });
}

/** Every named source kind stays in an admitted adapter; comments, imports and literals count alike. */
export const kindWords = (files: Readonly<Record<string, string>>, adapters: readonly string[], words: readonly string[]) => Object.entries(files).filter(([path]) => !adapters.includes(path)).flatMap(([path, text]) => words.filter(word => text.toLowerCase().includes(word)).map(word => `${path}: ${word}`));
