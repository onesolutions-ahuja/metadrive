/** Strict parser for metadata-defined numbered Flow condition expressions. */
export function evaluateCustomConditionLogic(expression: string, checks: boolean[]): boolean {
  if (expression.length > 2000) throw new Error('Custom condition logic cannot exceed 2000 characters.');
  const tokens: Array<string | number> = [];
  let offset = 0;
  while (offset < expression.length) {
    const match = /^\s*(\d+|AND\b|OR\b|\(|\))/i.exec(expression.slice(offset));
    if (!match) {
      if (/^\s*$/.test(expression.slice(offset))) break;
      throw new Error(`Custom condition logic has invalid syntax near "${expression.slice(offset, offset + 12)}".`);
    }
    const token = match[1];
    tokens.push(/^\d+$/.test(token) ? Number(token) : token.toUpperCase());
    if (tokens.length > 512) throw new Error('Custom condition logic cannot contain more than 512 tokens.');
    offset += match[0].length;
  }
  let cursor = 0;
  let nesting = 0;
  const peek = () => tokens[cursor];
  const parsePrimary = (): boolean => {
    const token = tokens[cursor++];
    if (token === '(') {
      nesting += 1;
      if (nesting > 100) throw new Error('Custom condition logic cannot nest parentheses more than 100 levels.');
      const value = parseOr();
      if (tokens[cursor++] !== ')') throw new Error('Custom condition logic has an unmatched opening parenthesis.');
      nesting -= 1;
      return value;
    }
    if (typeof token !== 'number') throw new Error('Custom condition logic must reference numbered conditions.');
    if (!Number.isInteger(token) || token < 1 || token > checks.length) {
      throw new Error(`Custom condition logic references condition ${token}, but only ${checks.length} condition(s) exist.`);
    }
    return checks[token - 1];
  };
  const parseAnd = (): boolean => {
    let value = parsePrimary();
    while (peek() === 'AND') {
      cursor += 1;
      const right = parsePrimary();
      value = value && right;
    }
    return value;
  };
  const parseOr = (): boolean => {
    let value = parseAnd();
    while (peek() === 'OR') {
      cursor += 1;
      const right = parseAnd();
      value = value || right;
    }
    return value;
  };
  if (!tokens.length) throw new Error('Custom condition logic cannot be blank.');
  const result = parseOr();
  if (cursor !== tokens.length) {
    throw new Error(tokens[cursor] === ')' ? 'Custom condition logic has an unmatched closing parenthesis.' : 'Custom condition logic is missing an operator.');
  }
  return result;
}

