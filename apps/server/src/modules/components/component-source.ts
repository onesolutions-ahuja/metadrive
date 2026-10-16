import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

export function hasDefaultComponentExport(compiledJs: string): boolean {
  return /\bexports\.default\b|\bdefault\s*:/.test(compiledJs);
}

export function scopeLibraryCss(cssSource: string, apiName: string): string {
  const root = postcss.parse(cssSource, { from: `${apiName}.css` });
  const scopeClass = `metadrive-component-${apiName.toLowerCase()}`;
  root.walkRules((rule) => {
    let parent = rule.parent;
    while (parent && parent.type !== 'root') {
      if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
      parent = parent.parent;
    }
    rule.selector = selectorParser((selectors) => {
      selectors.each((selector) => {
        const rootPseudo = selector.nodes[0]?.type === 'pseudo' && selector.nodes[0].value === ':root';
        if (rootPseudo) {
          selector.nodes.splice(0, 1, selectorParser.className({ value: scopeClass }));
        } else {
          selector.prepend(selectorParser.combinator({ value: ' ' }));
          selector.prepend(selectorParser.className({ value: scopeClass }));
        }
      });
    }).processSync(rule.selector);
  });
  return root.toString();
}

