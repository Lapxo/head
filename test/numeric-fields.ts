import ts from 'typescript';
/** A diagnostic's string conversion is text. Numeric conversions and expressions still require a declared numeric kind. */
export function numericFields(files: Readonly<Record<string, string>>): readonly string[] {
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [], strict: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = path => files[path] === undefined ? undefined : ts.createSourceFile(path, files[path]!, ts.ScriptTarget.Latest, true);
  host.fileExists = path => files[path] !== undefined; host.readFile = path => files[path]; host.writeFile = () => {};
  const program = ts.createProgram(Object.keys(files), options, host), checker = program.getTypeChecker(), found: string[] = [];
  const caught = (expression: ts.Expression): boolean => ts.isIdentifier(expression) && !!checker.getSymbolAtLocation(expression)?.declarations?.some(d => ts.isVariableDeclaration(d) && ts.isCatchClause(d.parent));
  const numeric = (expression: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(expression)) return numeric(expression.expression);
    if (ts.isCallExpression(expression)) {
      if (ts.isIdentifier(expression.expression) && expression.expression.text === 'String') return !!checker.getSymbolAtLocation(expression.expression)?.declarations?.length || !expression.arguments[0] || !caught(expression.arguments[0]);
      if (ts.isIdentifier(expression.expression) && expression.expression.text === 'Number') return true;
      if (ts.isPropertyAccessExpression(expression.expression) && (expression.expression.name.text === 'toFixed' || ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === 'Math')) return true;
    }
    return ts.isNumericLiteral(expression) || ts.isPropertyAccessExpression(expression) && (expression.name.text === 'length' || ts.isIdentifier(expression.expression) && expression.expression.text === 'Math') || !!(checker.getTypeAtLocation(expression).flags & ts.TypeFlags.NumberLike);
  };
  for (const path of Object.keys(files)) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1]))
        for (const property of node.arguments[1].properties) if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && numeric(property.initializer)) found.push(`${node.arguments[0].text}.${property.name.text}`);
      ts.forEachChild(node, visit);
    };
    visit(program.getSourceFile(path)!);
  }
  return found;
}
