/**
 * Static, side-effect-free Flow formula grammar validation.
 *
 * Activation must not execute a formula against artificial null input resources:
 * VALUE(InputText), DATEVALUE(InputDate), and similar valid expressions would be
 * rejected solely because the record/interview has not been supplied yet.
 *
 * The runtime evaluator is still authoritative for types and values. This
 * parser validates every branch (including lazy IF/CASE/AND/OR branches) and
 * reports whether runtime resource references are present.
 */
const FUNCTIONS = new Set((
  'TRUE FALSE IF CASE AND OR NOT XOR ISNEW ISCLONE ISCHANGED PRIORVALUE ' +
  'ISBLANK ISNULL BLANKVALUE NULLVALUE EXACT ISNUMBER LEN ASCII LOWER UPPER TRIM ' +
  'PROPER LEFT RIGHT MID FIND SUBSTITUTE CONCATENATE CONTAINS BEGINS ISPICKVAL ' +
  'INCLUDES VALUE TEXT DATE DATEVALUE DATETIMEVALUE TIME TIMEVALUE TODAY NOW ' +
  'TIMENOW YEAR MONTH DAY WEEKDAY WEEKNUM HOUR MINUTE SECOND MILLISECOND ' +
  'ADDDAYS DAYS ADDMONTHS TZOFFSET ABS SQRT POWER EXP LN LOG PI DEGREES ' +
  'RADIANS SIN COS TAN ASIN ACOS ATAN ATAN2 SINH COSH TANH COT SIGN ' +
  'CEILING MCEILING FLOOR MFLOOR MIN MAX MOD ROUND ROUNDUP ROUNDDOWN TRUNC ' +
  'REGEX GEOLOCATION DISTANCE CURRENCYRATE CONVERTCURRENCY CASESAFEID ' +
  'HYPERLINK IMAGE URLENCODE ENCODEURL URLDECODE HTMLENCODE JSENCODE REPT ' +
  'REVERSE LPAD RPAD BR'
).split(' '));
const GLOBAL_CONSTANTS = new Set(['TRUE', 'FALSE', 'NULL']);
const REF = /^[A-Za-z_$][A-Za-z0-9_.$]*$/;
const MERGE_REF = /^\{!?([A-Za-z_$][A-Za-z0-9_.$]*)\}$/;
const NUM = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const STRING = /^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")$/;
const TOKEN = /\s*(<=|>=|<>|!=|==|&&|\|\||\{!?[A-Za-z_$][A-Za-z0-9_.$]*\}|[()+\-*/%^&=<>!,]|(?:\d+(?:\.\d+)?|\.\d+)|(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|[A-Za-z_$][A-Za-z0-9_.$]*)/y;

function tokenize(expression) {
  if (typeof expression !== 'string' || !expression.trim()) throw new Error('Formula requires an expression.');
  if (expression.length > 10_000) throw new Error('Formula exceeds the 10,000-character limit.');
  const tokens = [];
  for (let offset = 0; offset < expression.length;) {
    TOKEN.lastIndex = offset;
    const match = TOKEN.exec(expression);
    if (!match) {
      if (/^\s*$/.test(expression.slice(offset))) break;
      throw new Error('Formula contains an unsupported token near "' + expression.slice(offset, offset + 16) + '".');
    }
    tokens.push(match[1]);
    if (tokens.length > 2_000) throw new Error('Formula exceeds the 2,000-token limit.');
    offset = TOKEN.lastIndex;
  }
  return tokens;
}

const ARITY = {
  TRUE: [0, 0], FALSE: [0, 0], TODAY: [0, 0], NOW: [0, 0],
  TIMENOW: [0, 0], PI: [0, 0], BR: [0, 0], ISNEW: [0, 0], ISCLONE: [0, 0],
  IF: [3, 3], AND: [2, 255], OR: [2, 255], XOR: [2, 255],
  CASE: [4, 255], ISCHANGED: [1, 1], PRIORVALUE: [1, 1],
  NOT: [1, 1], LEN: [1, 1], LEFT: [2, 2], RIGHT: [2, 2],
  MID: [3, 3], VALUE: [1, 1], DATEVALUE: [1, 1],
  DATETIMEVALUE: [1, 1], TIMEVALUE: [1, 1],
  DATE: [3, 3], TIME: [3, 3], MOD: [2, 2],
  GEOLOCATION: [2, 2], DISTANCE: [3, 3],
  CURRENCYRATE: [1, 1], CONVERTCURRENCY: [1, 1],
  SUBSTITUTE: [3, 4], FIND: [2, 3], CONCATENATE: [2, 255],
  HYPERLINK: [2, 3], IMAGE: [2, 4], REGEX: [2, 2],
  ROUND: [1, 2], ROUNDUP: [1, 2], ROUNDDOWN: [1, 2],
  TRUNC: [1, 2], LPAD: [2, 3], RPAD: [2, 3],
  ISBLANK: [1, 1], ISNULL: [1, 1], BLANKVALUE: [2, 2], NULLVALUE: [2, 2],
  EXACT: [2, 2], ISNUMBER: [1, 1], ASCII: [1, 1], LOWER: [1, 1],
  UPPER: [1, 1], TRIM: [1, 1], PROPER: [1, 1], CONTAINS: [2, 2],
  BEGINS: [2, 2], ISPICKVAL: [2, 2], INCLUDES: [2, 2], TEXT: [1, 1],
  YEAR: [1, 1], MONTH: [1, 1], DAY: [1, 1], WEEKDAY: [1, 1],
  HOUR: [1, 1], MINUTE: [1, 1], SECOND: [1, 1], ABS: [1, 1],
  SQRT: [1, 1], POWER: [2, 2], EXP: [1, 1], LN: [1, 1],
  SIGN: [1, 1], CEILING: [1, 1], FLOOR: [1, 1], MIN: [2, 255], MAX: [2, 255],
  REPT: [2, 2], REVERSE: [1, 1]
};

/** Return {hasReferences, references}; throw for invalid grammar or unsupported functions. */
export function validateFlowFormulaSyntax(expression) {
  const tokens = tokenize(expression);
  const references = new Set();
  let cursor = 0;
  let depth = 0;
  const peek = () => tokens[cursor];
  const next = () => tokens[cursor++];
  const expect = (expected) => {
    if (next() !== expected) throw new Error(expected === ')' ? 'Formula function is missing a closing parenthesis.' : 'Formula is missing "' + expected + '".');
  };
  const nested = (parse) => {
    if (++depth > 128) throw new Error('Formula exceeds the nesting limit.');
    try { parse(); } finally { depth--; }
  };
  function or() {
    and();
    while (['OR', '||'].includes(peek()?.toUpperCase())) { next(); and(); }
  }
  function and() {
    comparison();
    while (['AND', '&&'].includes(peek()?.toUpperCase())) { next(); comparison(); }
  }
  function comparison() {
    concat();
    if (['=', '==', '!=', '<>', '>', '<', '>=', '<='].includes(peek())) {
      next(); concat();
    }
  }
  function concat() {
    additive();
    while (peek() === '&') { next(); additive(); }
  }
  function additive() {
    multiply();
    while (peek() === '+' || peek() === '-') { next(); multiply(); }
  }
  function multiply() {
    unary();
    while (peek() === '*' || peek() === '/' || peek() === '%') { next(); unary(); }
  }
  function unary() {
    if (peek() === '+' || peek() === '-' || peek() === '!') { next(); nested(unary); }
    else power();
  }
  function power() {
    primary();
    if (peek() === '^') { next(); nested(unary); }
  }
  function primary() {
    const token = next();
    if (!token) throw new Error('Formula ended unexpectedly.');
    if (token === '(') { nested(or); expect(')'); return; }
    if (NUM.test(token) || STRING.test(token)) return;
    const bracketReference = MERGE_REF.exec(token);
    const name = bracketReference?.[1] ?? token;
    if (!REF.test(name)) throw new Error('Unexpected "' + token + '" in formula.');
    if (!bracketReference && peek() === '(') {
      const normalized = name.toUpperCase();
      if (!FUNCTIONS.has(normalized)) throw new Error('Unsupported formula function "' + name + '".');
      next(); // (
      let count = 0;
      if (peek() !== ')') {
        for (;;) {
          nested(or);
          count++;
          if (peek() !== ',') break;
          next();
          if (peek() === ')' || peek() === ',') throw new Error(name + ' cannot contain an empty argument.');
        }
      }
      expect(')');
      const limits = ARITY[normalized];
      if (limits && (count < limits[0] || count > limits[1])) {
        throw new Error(name + ' requires ' + (limits[0] === limits[1]
          ? 'exactly ' + limits[0] : 'between ' + limits[0] + ' and ' + limits[1]) + ' arguments.');
      }
      if (normalized === 'CASE' && count % 2 !== 0) {
        throw new Error('CASE requires an expression, value/result pairs, and a default result.');
      }
    } else if (bracketReference || !GLOBAL_CONSTANTS.has(name.toUpperCase())) {
      references.add(name);
    }
  }
  nested(or);
  if (cursor !== tokens.length) throw new Error('Unexpected "' + peek() + '" after formula expression.');
  return { hasReferences: references.size > 0, references: [...references] };
}
