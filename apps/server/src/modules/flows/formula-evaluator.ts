import { flowLocalDateTimeToInstant } from '../../core/local-time.js';

/** Declarative formula runtime shared by record fields and Flow expressions. */
function parseFormulaDate(value: unknown, functionName: string): Date {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?)?$/.test(text)) {
    throw new Error(`${functionName} requires an ISO date or date/time value.`);
  }
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(text);
  if (offset && (Number(offset[2]) > 14 || (Number(offset[2]) === 14 && Number(offset[3]) !== 0))) {
    throw new Error(`${functionName} requires an ISO time-zone offset no greater than 14:00.`);
  }
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  if (year < 1) throw new Error(`${functionName} requires a year from 0001 through 9999.`);
  const civilDate = formulaUtcDate(year, month - 1, day);
  if (civilDate.getUTCFullYear() !== year || civilDate.getUTCMonth() !== month - 1 || civilDate.getUTCDate() !== day) {
    throw new Error(`${functionName} requires a valid date.`);
  }
  const dateTime = text.length === 10 ? `${text}T00:00:00.000Z`
    : /(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? text : `${text}Z`;
  const date = new Date(dateTime);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new Error(`${functionName} requires a valid date.`);
  }
  return date;
}

function formulaUtcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, day);
  return date;
}

function formulaDateParts(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function formulaLocalDate(date: Date, timeZone: string): string {
  const parts = formulaDateParts(date, timeZone);
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
}

function formulaLocalTime(date: Date, timeZone: string): string {
  const parts = formulaDateParts(date, timeZone);
  return `${parts.hour}:${parts.minute}:${parts.second}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
}

function formulaTimezoneOffset(date: Date, timeZone: string): number {
  const parts = formulaDateParts(date, timeZone);
  const localAsUtc = formulaUtcDate(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  localAsUtc.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0);
  return localAsUtc.getTime() - Math.floor(date.getTime() / 1000) * 1000;
}

function parseFormulaDateTime(value: unknown, timeZone: string, functionName: string): Date {
  const text = String(value ?? '').trim();
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(text);
  if (!localMatch || /(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return parseFormulaDate(value, functionName);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', fractionText = '0'] = localMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fractionText.padEnd(3, '0'));
  const civilDate = formulaUtcDate(year, month - 1, day);
  if (year < 1 || civilDate.getUTCFullYear() !== year || civilDate.getUTCMonth() !== month - 1
    || civilDate.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new Error(`${functionName} requires a valid local date and time.`);
  }
  const instant = flowLocalDateTimeToInstant(civilDate, hour, minute, timeZone);
  if (!instant) throw new Error(`${functionName} local time does not exist in time zone "${timeZone}" because of a daylight-saving transition.`);
  instant.setUTCSeconds(second, millisecond);
  return instant;
}

function isFormulaDateTimeText(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]/.test(String(value ?? '').trim());
}

function parseFormulaDateInContext(value: unknown, timeZone: string, functionName: string): Date {
  return isFormulaDateTimeText(value)
    ? parseFormulaDateTime(value, timeZone, functionName)
    : parseFormulaDate(value, functionName);
}

function parseFormulaNumberText(value: unknown, locale: string): number {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('VALUE requires text that can be converted to a number.');
  const formatter = new Intl.NumberFormat(locale);
  const sampleParts = formatter.formatToParts(-1234567890123.5);
  const group = sampleParts.find((part) => part.type === 'group')?.value;
  const decimal = sampleParts.find((part) => part.type === 'decimal')?.value ?? '.';
  const minus = sampleParts.find((part) => part.type === 'minusSign')?.value ?? '-';
  const groupSizes = sampleParts.filter((part) => part.type === 'integer')
    .map((part) => part.value.length).slice(1).reverse();
  const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false });
  let normalized = text;
  for (let digit = 0; digit <= 9; digit += 1) {
    const localizedDigit = digitFormatter.format(digit);
    if (localizedDigit !== String(digit)) normalized = normalized.replaceAll(localizedDigit, String(digit));
  }
  if (minus !== '-') normalized = normalized.replaceAll(minus, '-');
  const exponentParts = normalized.split(/[eE]/);
  if (exponentParts.length > 2) throw new Error('VALUE requires text that can be converted to a number.');
  let mantissa = exponentParts[0];
  const exponent = exponentParts[1];
  if (exponent !== undefined && !/^[+-]?\d+$/.test(exponent)) {
    throw new Error('VALUE requires text that can be converted to a number.');
  }
  const decimalIndex = mantissa.indexOf(decimal);
  const groupIndex = group ? mantissa.indexOf(group) : -1;
  if (groupIndex >= 0 && decimalIndex >= 0 && groupIndex > decimalIndex) {
    throw new Error('VALUE requires text that can be converted to a number.');
  }
  if (group && mantissa.includes(group)) {
    const integerText = mantissa.split(decimal)[0];
    const integerSign = /^[+-]/.test(integerText) ? integerText[0] : '';
    const groups = integerText.slice(integerSign.length).split(group);
    const rightGroups = groups.slice(1).reverse();
    const validGrouping = groups[0].length >= 1
      && groups[0].length <= (groupSizes.at(-1) ?? 3)
      && rightGroups.every((part, index) => part.length === (groupSizes[index] ?? groupSizes.at(-1) ?? 3));
    if (!validGrouping) {
      const standardNumber = Number(text);
      if (Number.isFinite(standardNumber)) return standardNumber;
      throw new Error('VALUE requires text that can be converted to a number.');
    }
    mantissa = mantissa.replaceAll(group, '');
  }
  if (decimal !== '.') {
    if (mantissa.split(decimal).length > 2) throw new Error('VALUE requires text that can be converted to a number.');
    mantissa = mantissa.replace(decimal, '.');
  }
  const normalizedText = exponent === undefined ? mantissa : `${mantissa}e${exponent}`;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalizedText)) {
    const standardNumber = Number(text);
    if (Number.isFinite(standardNumber)) return standardNumber;
    throw new Error('VALUE requires text that can be converted to a number.');
  }
  const number = Number(normalizedText);
  if (!Number.isFinite(number)) throw new Error('VALUE requires text that can be converted to a finite number.');
  return number;
}

function roundFormulaNumber(value: number, precision: number, mode: 'round' | 'up' | 'down'): number {
  const negative = value < 0;
  const [mantissa, exponentPart] = Math.abs(value).toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const coefficient = BigInt(`${whole}${fraction}`);
  const shift = Number(exponentPart ?? 0) - fraction.length + precision;
  let rounded: bigint;
  if (shift >= 0) {
    rounded = coefficient * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    const quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    const increment = mode === 'up' ? remainder !== 0n
      : mode === 'round' ? remainder * 2n >= divisor
        : false;
    rounded = quotient + (increment ? 1n : 0n);
  }
  const result = Number(`${negative ? '-' : ''}${rounded}e${-precision}`);
  if (!Number.isFinite(result)) throw new Error('Formula arithmetic must produce a finite number.');
  return result;
}

export function isSafeFlowRegex(pattern: string): boolean {
  const quantifiers = pattern.match(/[*+?]|\{\d+(?:,\d*)?\}/g) ?? [];
  return pattern.length <= 128
    && !/[()|]/.test(pattern)
    && !/\\[1-9]/.test(pattern)
    && !/\.\*|\.\+/.test(pattern)
    && quantifiers.length <= 2
    && !/\{\d{4,}(?:,\d*)?\}/.test(pattern);
}

function encodeFormulaHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]!);
}

function encodeFormulaUrl(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function safeFormulaUrl(value: unknown, functionName: string): string {
  const url = String(value ?? '').trim();
  if (!url) throw new Error(`${functionName} requires a non-blank URL.`);
  if (url.startsWith('//') || /[\u0000-\u0020\\]/.test(url)) {
    throw new Error(`${functionName} requires an HTTP(S) or relative URL.`);
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(url) && !/^https?:\/\//i.test(url)) {
    throw new Error(`${functionName} supports only HTTP(S) URLs.`);
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    } catch {
      throw new Error(`${functionName} requires a valid HTTP(S) URL.`);
    }
  }
  return url;
}

export function evaluateFormula(
  expression: string,
  resolveField: (name: string) => unknown,
  formulaContext: {
    isNew?: boolean;
    isClone?: boolean;
    hasPrior?: boolean;
    resolvePriorField?: (name: string) => unknown;
    timeZone?: string;
    locale?: string;
    currentUser?: Record<string, unknown>;
    flowVariables?: Record<string, unknown>;
    corporateCurrency?: string;
    currencyRates?: Record<string, number>;
    userCurrencyIsoCode?: string;
    currencyIsoCode?: string;
  } = {}
): unknown {
  const timeZone = formulaContext.timeZone ?? 'UTC';
  const locale = formulaContext.locale ?? 'en-US';
  if (expression.length > 10_000) throw new Error('Formula exceeds the 10,000-character limit.');
  const tokens: string[] = [];
  const tokenPattern = /\s*(<=|>=|<>|!=|==|&&|\|\||\{!?[A-Za-z_$][A-Za-z0-9_.$]*\}|[()+\-*/%^&=<>!,]|(?:\d+(?:\.\d+)?|\.\d+)|(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|[A-Za-z_$][A-Za-z0-9_.$]*)/y;
  let offset = 0;
  while (offset < expression.length) {
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(expression);
    if (!match) {
      if (/^\s*$/.test(expression.slice(offset))) break;
      throw new Error(`Formula contains an unsupported token near "${expression.slice(offset, offset + 16)}".`);
    }
    tokens.push(match[1]);
    if (tokens.length > 2_000) throw new Error('Formula exceeds the 2,000-token limit.');
    offset = tokenPattern.lastIndex;
  }
  let cursor = 0;
  const peek = () => tokens[cursor];
  const consume = (token?: string) => {
    const current = tokens[cursor];
    if (token !== undefined && current?.toUpperCase() !== token.toUpperCase()) throw new Error(`Expected "${token}" in formula.`);
    cursor += 1;
    return current;
  };
  const truthy = (value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('Logical formula conditions must evaluate to Boolean values.');
    return value;
  };
  const finiteNumber = (value: unknown, functionName: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`${functionName} requires finite numeric arguments.`);
    return numeric;
  };
  const formulaValuesEqual = (left: unknown, right: unknown) => {
    if (typeof left === 'string' && typeof right === 'string') {
      return left.toLocaleLowerCase(locale) === right.toLocaleLowerCase(locale);
    }
    return left === right
      || ((left === null || left === undefined) && (right === null || right === undefined));
  };
  const checkedFormulaText = (value: string, functionName = 'Formula') => {
    if (value.length > 100_000) throw new Error(`${functionName} result exceeds the 100,000-character limit.`);
    return value;
  };
  const skipLogicalOperand = (operators: string[]) => {
    let nesting = 0;
    while (cursor < tokens.length) {
      const current = tokens[cursor];
      const normalized = current.toUpperCase();
      if (nesting === 0 && (operators.includes(normalized) || current === ',' || current === ')')) break;
      if ((normalized === 'AND' || normalized === 'OR') && tokens[cursor + 1] === '(') {
        cursor += 1;
        continue;
      }
      if (current === '(') nesting += 1;
      else if (current === ')') nesting -= 1;
      cursor += 1;
    }
  };
  const parseOr = (): unknown => {
    let value = parseAnd();
    while (peek()?.toUpperCase() === 'OR' || peek() === '||') {
      consume();
      if (truthy(value)) {
        skipLogicalOperand(['OR', '||']);
      } else {
        value = truthy(parseAnd());
      }
    }
    return value;
  };
  const parseAnd = (): unknown => {
    let value = parseComparison();
    while (peek()?.toUpperCase() === 'AND' || peek() === '&&') {
      consume();
      if (!truthy(value)) {
        skipLogicalOperand(['OR', '||']);
        return false;
      }
      value = truthy(parseComparison());
    }
    return value;
  };
  const parseComparison = (): unknown => {
    const left = parseConcat();
    const operator = peek();
    if (!operator || !['=', '==', '!=', '<>', '>', '<', '>=', '<='].includes(operator)) return left;
    consume();
    const right = parseConcat();
    if (operator === '=' || operator === '==' || operator === '!=' || operator === '<>') {
      const equal = formulaValuesEqual(left, right);
      return operator === '=' || operator === '==' ? equal : !equal;
    }
    const isDate = (value: unknown): value is string =>
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value);
    let comparison: number;
    if (isDate(left) && isDate(right)) {
      comparison = Math.sign(parseFormulaDate(left, 'Date comparison').getTime()
        - parseFormulaDate(right, 'Date comparison').getTime());
    } else if (typeof left === 'string' && typeof right === 'string') {
      const leftText = left.toLocaleLowerCase(locale);
      const rightText = right.toLocaleLowerCase(locale);
      comparison = leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    } else if (typeof left === 'number' && Number.isFinite(left)
      && typeof right === 'number' && Number.isFinite(right)) {
      const leftNumber = left;
      const rightNumber = right;
      comparison = leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
    } else {
      throw new Error('Ordered formula comparisons require compatible numbers, text, or dates.');
    }
    if (operator === '>') return comparison > 0;
    if (operator === '<') return comparison < 0;
    if (operator === '>=') return comparison >= 0;
    return comparison <= 0;
  };
  const parseConcat = (): unknown => {
    let value = parseAdditive();
    while (peek() === '&') {
      consume('&');
      const left = String(value ?? '');
      const right = String(parseAdditive() ?? '');
      if (left.length + right.length > 100_000) throw new Error('Formula text result exceeds the 100,000-character limit.');
      value = left + right;
    }
    return value;
  };
  const parseAdditive = (): unknown => {
    let value = parseMultiplicative();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseMultiplicative();
      const leftDateText = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value);
      const rightDateText = typeof right === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(right);
      if (leftDateText && rightDateText && operator === '-') {
        value = (parseFormulaDate(value, 'Date subtraction').getTime()
          - parseFormulaDate(right, 'Date subtraction').getTime()) / 86_400_000;
      } else if (leftDateText && typeof right === 'number') {
        if (!Number.isInteger(right)) throw new Error('Date arithmetic requires a whole number of days.');
        const date = parseFormulaDate(value, 'Date arithmetic');
        date.setTime(date.getTime() + (operator === '+' ? right : -right) * 86_400_000);
        if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
          throw new Error('Date arithmetic produced a date outside the supported range.');
        }
        value = String(value).length === 10 ? date.toISOString().slice(0, 10) : date.toISOString();
      } else {
        const result = operator === '+' ? Number(value) + Number(right) : Number(value) - Number(right);
        if (!Number.isFinite(result)) throw new Error('Formula arithmetic must produce a finite number.');
        value = result;
      }
    }
    return value;
  };
  const parseMultiplicative = (): unknown => {
    let value = parseUnary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = consume();
      const right = Number(parseUnary());
      if (operator === '/' && right === 0) throw new Error('Formula cannot divide by zero.');
      if (operator === '%' && right === 0) throw new Error('Formula cannot use modulo by zero.');
      const result = operator === '*' ? Number(value) * right : operator === '/' ? Number(value) / right : Number(value) % right;
      if (!Number.isFinite(result)) throw new Error('Formula arithmetic must produce a finite number.');
      value = result;
    }
    return value;
  };
  const parseUnary = (): unknown => {
    if (peek() === '-') {
      consume('-');
      return -Number(parseUnary());
    }
    if (peek() === '!') {
      consume('!');
      return !truthy(parseUnary());
    }
    if (peek() === '+') {
      consume('+');
      return Number(parseUnary());
    }
    return parsePower();
  };
  const parsePower = (): unknown => {
    const value = parsePrimary();
    if (peek() !== '^') return value;
    consume('^');
    return Number(value) ** Number(parseUnary());
  };
  const parsePrimary = (): unknown => {
    const token = peek();
    if (token === undefined) throw new Error('Formula ended unexpectedly.');
    if (token === '(') {
      consume('(');
      const value = parseOr();
      consume(')');
      return value;
    }
    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) {
      consume();
      return Number(token);
    }
    if (token.startsWith("'") || token.startsWith('"')) {
      consume();
      return token.slice(1, -1).replace(/\\(['"\\])/g, '$1');
    }
    const mergeReference = /^\{!?([A-Za-z_$][A-Za-z0-9_.$]*)\}$/.exec(token);
    const identifier = mergeReference?.[1] ?? token;
    if (/^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(identifier)) {
      consume();
      const name = identifier.toUpperCase();
      if (name === 'TRUE' && peek() !== '(') return true;
      if (name === 'FALSE' && peek() !== '(') return false;
      if (name === 'NULL') return null;
      if (identifier.startsWith('$User.')) {
        let value: unknown = formulaContext.currentUser;
        for (const segment of identifier.slice('$User.'.length).split('.')) {
          if (!value || typeof value !== 'object') return undefined;
          value = (value as Record<string, unknown>)[segment];
        }
        return value;
      }
      if (identifier.startsWith('$Flow.')) {
        let value: unknown = formulaContext.flowVariables;
        for (const segment of identifier.slice('$Flow.'.length).split('.')) {
          if (!value || typeof value !== 'object') return undefined;
          value = (value as Record<string, unknown>)[segment];
        }
        return value;
      }
      if (peek() !== '(' || mergeReference) return resolveField(identifier.replace(/^\$Record\./, ''));
      consume('(');
      if (name === 'IF' || name === 'CASE' || name === 'AND' || name === 'OR' || name === 'ISNEW' || name === 'ISCLONE'
        || name === 'ISCHANGED' || name === 'PRIORVALUE') {
        const argumentRanges: string[][] = [];
        let argumentStart = cursor;
        let nesting = 0;
        let closed = false;
        for (let index = cursor; index < tokens.length; index += 1) {
          const current = tokens[index];
          if (current === '(') nesting += 1;
          else if (current === ')') {
            if (nesting === 0) {
              if (index > argumentStart) argumentRanges.push(tokens.slice(argumentStart, index));
              else if (argumentRanges.length) throw new Error(`${token} cannot contain an empty argument.`);
              cursor = index + 1;
              closed = true;
              break;
            }
            nesting -= 1;
          } else if (current === ',' && nesting === 0) {
            if (index === argumentStart) throw new Error(`${token} cannot contain an empty argument.`);
            argumentRanges.push(tokens.slice(argumentStart, index));
            argumentStart = index + 1;
          }
        }
        if (!closed) throw new Error(`Formula function "${token}" is missing a closing parenthesis.`);
        if (name === 'ISNEW') {
          if (argumentRanges.length) throw new Error('ISNEW does not accept arguments.');
          if (formulaContext.isNew === undefined) throw new Error('ISNEW requires a record-triggered Flow context.');
          return formulaContext.isNew;
        }
        if (name === 'ISCLONE') {
          if (argumentRanges.length) throw new Error('ISCLONE does not accept arguments.');
          return formulaContext.isClone ?? false;
        }
        if (name === 'ISCHANGED' || name === 'PRIORVALUE') {
          if (argumentRanges.length !== 1 || !argumentRanges[0].length) {
            throw new Error(`${token} requires exactly one expression.`);
          }
          if (!formulaContext.hasPrior) return name === 'ISCHANGED' ? false : null;
          if (!formulaContext.resolvePriorField) {
            throw new Error(`${token} requires prior record values.`);
          }
          const expressionText = argumentRanges[0].join(' ');
          const priorValue = evaluateFormula(expressionText, formulaContext.resolvePriorField, formulaContext);
          if (name === 'PRIORVALUE') return priorValue;
          const currentValue = evaluateFormula(expressionText, resolveField, formulaContext);
          if (typeof currentValue === 'string' && typeof priorValue === 'string') {
            return currentValue.toLocaleLowerCase(locale) !== priorValue.toLocaleLowerCase(locale);
          }
          return currentValue !== priorValue;
        }
        if (name === 'IF') {
          if (argumentRanges.length !== 3) throw new Error('IF requires exactly 3 arguments.');
          const condition = evaluateFormula(argumentRanges[0].join(' '), resolveField, formulaContext);
          return evaluateFormula(argumentRanges[truthy(condition) ? 1 : 2].join(' '), resolveField, formulaContext);
        }
        if (name === 'CASE') {
          if (argumentRanges.length < 4 || argumentRanges.length > 255 || argumentRanges.length % 2 !== 0) {
            throw new Error('CASE requires an expression, one or more value/result pairs, and a default result.');
          }
          const expressionValue = evaluateFormula(argumentRanges[0].join(' '), resolveField, formulaContext);
          for (let index = 1; index < argumentRanges.length - 1; index += 2) {
            const candidate = evaluateFormula(argumentRanges[index].join(' '), resolveField, formulaContext);
            const matches = formulaValuesEqual(expressionValue, candidate);
            if (matches) return evaluateFormula(argumentRanges[index + 1].join(' '), resolveField, formulaContext);
          }
          return evaluateFormula(argumentRanges[argumentRanges.length - 1].join(' '), resolveField, formulaContext);
        }
        if (argumentRanges.length < 2 || argumentRanges.length > 255) {
          throw new Error(`${token} requires between 2 and 255 arguments.`);
        }
        if (name === 'AND') {
          for (const range of argumentRanges) {
            if (!truthy(evaluateFormula(range.join(' '), resolveField, formulaContext))) return false;
          }
          return true;
        }
        for (const range of argumentRanges) {
          if (truthy(evaluateFormula(range.join(' '), resolveField, formulaContext))) return true;
        }
        return false;
      }
      const args: unknown[] = [];
      if (peek() !== ')') {
        do {
          args.push(parseOr());
          if (peek() !== ',') break;
          consume(',');
        } while (true);
      }
      consume(')');
      const requireCount = (minimum: number, maximum = minimum) => {
        if (args.length < minimum || args.length > maximum) {
          const expected = minimum === maximum ? `exactly ${minimum}` : `between ${minimum} and ${maximum}`;
          throw new Error(`${token} requires ${expected} argument${maximum === 1 ? '' : 's'}.`);
        }
      };
      switch (name) {
        case 'TRUE':
        case 'FALSE':
          requireCount(0);
          return name === 'TRUE';
        case 'CASE': {
          if (args.length < 4 || args.length > 255 || args.length % 2 !== 0) {
            throw new Error('CASE requires an expression, one or more value/result pairs, and a default result.');
          }
          for (let index = 1; index < args.length - 1; index += 2) {
            const left = args[0];
            const right = args[index];
            const matches = formulaValuesEqual(left, right);
            if (matches) return args[index + 1];
          }
          return args[args.length - 1];
        }
        case 'XOR': {
          if (args.length < 2 || args.length > 255) throw new Error(`${token} requires between 2 and 255 arguments.`);
          const matches = args.map(truthy);
          return matches.filter(Boolean).length % 2 === 1;
        }
        case 'NOT':
          requireCount(1);
          return !truthy(args[0]);
        case 'ISBLANK':
        {
          if (args.length !== 1) throw new Error(`${token} requires exactly one argument.`);
          return args[0] === null || args[0] === undefined || args[0] === '';
        }
        case 'ISNULL':
          requireCount(1);
          return args[0] === null || args[0] === undefined;
        case 'EXACT':
          requireCount(2);
          return String(args[0] ?? '') === String(args[1] ?? '');
        case 'ISNUMBER': {
          if (args.length !== 1) throw new Error('ISNUMBER requires exactly one argument.');
          if (typeof args[0] === 'number') return Number.isFinite(args[0]);
          try {
            parseFormulaNumberText(args[0], locale);
            return true;
          } catch {
            return false;
          }
        }
        case 'BLANKVALUE':
        {
          if (args.length !== 2) throw new Error(`${token} requires exactly two arguments.`);
          return args[0] === null || args[0] === undefined || args[0] === '' ? args[1] : args[0];
        }
        case 'NULLVALUE':
          requireCount(2);
          return args[0] === null || args[0] === undefined ? args[1] : args[0];
        case 'CONTAINS':
        case 'BEGINS': {
          if (args.length !== 2) throw new Error(`${token} requires exactly two arguments.`);
          const text = String(args[0] ?? '');
          const search = String(args[1] ?? '');
          return name === 'CONTAINS' ? text.includes(search) : text.startsWith(search);
        }
        case 'CONCATENATE': {
          if (args.length < 2 || args.length > 255) throw new Error('CONCATENATE requires between 2 and 255 arguments.');
          const parts = args.map((value) => value === null || value === undefined ? '' : String(value));
          if (parts.reduce((length, part) => length + part.length, 0) > 100_000) {
            throw new Error('CONCATENATE result exceeds the 100,000-character limit.');
          }
          return parts.join('');
        }
        case 'REPT': {
          requireCount(2);
          const count = Number(args[1]);
          if (!Number.isInteger(count) || count < 0 || count > 100_000) throw new Error('REPT requires an integer repeat count from 0 through 100000.');
          const text = String(args[0] ?? '');
          if (text.length * count > 100_000) throw new Error('REPT result exceeds the 100,000-character limit.');
          return text.repeat(count);
        }
        case 'REVERSE':
          requireCount(1);
          return Array.from(String(args[0] ?? '')).reverse().join('');
        case 'LPAD':
        case 'RPAD': {
          requireCount(2, 3);
          const text = String(args[0] ?? '');
          const length = Number(args[1]);
          const pad = args[2] === undefined ? ' ' : String(args[2]);
          if (!Number.isInteger(length) || length < 0 || length > 100_000 || !pad) throw new Error(`${token} requires a valid target length and non-empty padding text.`);
          if (length <= text.length) return text.slice(name === 'LPAD' ? text.length - length : 0, name === 'LPAD' ? undefined : length);
          const padding = pad.repeat(Math.ceil((length - text.length) / pad.length)).slice(0, length - text.length);
          return name === 'LPAD' ? padding + text : text + padding;
        }
        case 'BR':
          requireCount(0);
          return '\n';
        case 'URLENCODE':
          requireCount(1);
          return encodeFormulaUrl(String(args[0] ?? ''));
        case 'ENCODEURL':
          requireCount(1);
          return encodeFormulaUrl(String(args[0] ?? ''));
        case 'URLDECODE': {
          requireCount(1);
          try {
            return decodeURIComponent(String(args[0] ?? ''));
          } catch {
            throw new Error('URLDECODE requires valid URL-encoded text.');
          }
        }
        case 'HTMLENCODE':
          requireCount(1);
          return encodeFormulaHtml(String(args[0] ?? ''));
        case 'JSENCODE':
          requireCount(1);
          return String(args[0] ?? '').replace(/[\\'"<>&\u0000-\u001f\u2028\u2029]/g, (character) => {
            const escapes: Record<string, string> = {
              '\\': '\\\\', "'": "\\'", '"': '\\"', '<': '\\x3C', '>': '\\x3E', '&': '\\x26',
              '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f',
              '\u2028': '\\u2028', '\u2029': '\\u2029'
            };
            return escapes[character] ?? `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`;
          });
        case 'HYPERLINK': {
          requireCount(2, 3);
          const url = safeFormulaUrl(args[0], token);
          const target = args[2] === undefined || args[2] === null || args[2] === '' ? '_blank' : String(args[2]);
          if (!['_blank', '_self', '_parent', '_top'].includes(target)) {
            throw new Error('HYPERLINK target must be _blank, _self, _parent, or _top.');
          }
          return checkedFormulaText(
            `<a href="${encodeFormulaHtml(url)}" target="${target}"${target === '_blank' ? ' rel="noopener noreferrer"' : ''}>${encodeFormulaHtml(String(args[1] ?? ''))}</a>`,
            token
          );
        }
        case 'IMAGE': {
          requireCount(2, 4);
          const url = safeFormulaUrl(args[0], token);
          const dimensions = args.slice(2).map((value) => {
            const size = Number(value);
            if (!Number.isInteger(size) || size < 1 || size > 10_000) {
              throw new Error('IMAGE dimensions must be integers from 1 through 10000.');
            }
            return size;
          });
          const height = dimensions[0];
          const width = dimensions[1];
          return checkedFormulaText(
            `<img src="${encodeFormulaHtml(url)}" alt="${encodeFormulaHtml(String(args[1] ?? ''))}"${height === undefined ? '' : ` height="${height}"`}${width === undefined ? '' : ` width="${width}"`}>`,
            token
          );
        }
        case 'ISPICKVAL':
          requireCount(2);
          return String(args[0] ?? '').toLocaleLowerCase(locale) === String(args[1] ?? '').toLocaleLowerCase(locale);
        case 'INCLUDES': {
          requireCount(2);
          const values = Array.isArray(args[0]) ? args[0].map(String) : String(args[0] ?? '').split(';');
          return values.some((value) => value.toLocaleLowerCase(locale) === String(args[1] ?? '').toLocaleLowerCase(locale));
        }
        case 'CASESAFEID': {
          requireCount(1);
          const id = String(args[0] ?? '');
          if (!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id)) {
            throw new Error('CASESAFEID requires a 15- or 18-character Salesforce ID.');
          }
          const baseId = id.slice(0, 15);
          const suffix = Array.from({ length: 3 }, (_, group) => {
            let bits = 0;
            for (let offset = 0; offset < 5; offset += 1) {
              const character = baseId[group * 5 + offset];
              if (character >= 'A' && character <= 'Z') bits |= 1 << offset;
            }
            return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'.charAt(bits);
          }).join('');
          if (id.length === 18 && id.slice(15) !== suffix) {
            throw new Error('CASESAFEID received an invalid 18-character Salesforce ID checksum.');
          }
          return baseId + suffix;
        }
        case 'LEN':
          requireCount(1);
          return String(args[0] ?? '').length;
        case 'ASCII':
          requireCount(1);
          return String(args[0] ?? '').codePointAt(0) ?? 0;
        case 'LOWER':
        case 'UPPER':
        case 'TRIM':
          requireCount(1);
          return name === 'LOWER' ? String(args[0] ?? '').toLocaleLowerCase(locale)
            : name === 'UPPER' ? String(args[0] ?? '').toLocaleUpperCase(locale)
              : String(args[0] ?? '').trim();
        case 'PROPER':
          requireCount(1);
          return String(args[0] ?? '').toLocaleLowerCase(locale)
            .replace(/(^|[\s\p{P}])(\p{L})/gu, (_match, boundary: string, letter: string) => `${boundary}${letter.toLocaleUpperCase(locale)}`);
        case 'LEFT':
        case 'RIGHT': {
          requireCount(2);
          const text = String(args[0] ?? '');
          const count = Number(args[1]);
          if (!Number.isInteger(count) || count < 0) throw new Error(`${token} requires a non-negative integer character count.`);
          return name === 'LEFT' ? text.slice(0, count) : count === 0 ? '' : text.slice(-count);
        }
        case 'MID': {
          requireCount(3);
          const text = String(args[0] ?? '');
          const start = Number(args[1]);
          const count = Number(args[2]);
          if (!Number.isInteger(start) || start < 1 || !Number.isInteger(count) || count < 0) {
            throw new Error('MID requires a positive 1-based start position and a non-negative integer character count.');
          }
          return text.slice(start - 1, start - 1 + count);
        }
        case 'FIND': {
          requireCount(2, 3);
          const start = args[2] === undefined ? 1 : Number(args[2]);
          if (!Number.isInteger(start) || start < 1) throw new Error('FIND start position must be a positive integer.');
          const found = String(args[1] ?? '').indexOf(String(args[0] ?? ''), start - 1);
          return found < 0 ? 0 : found + 1;
        }
        case 'SUBSTITUTE': {
          requireCount(3, 4);
          const text = String(args[0] ?? '');
          const search = String(args[1] ?? '');
          if (!search) throw new Error('SUBSTITUTE search text cannot be blank.');
          const replacement = String(args[2] ?? '');
          const instance = args[3] === undefined ? undefined : Number(args[3]);
          if (instance !== undefined && (!Number.isInteger(instance) || instance < 1)) {
            throw new Error('SUBSTITUTE instance number must be a positive integer.');
          }
          const matches = text.split(search);
          const occurrences = matches.length - 1;
          if (instance !== undefined) {
            let found = -1;
            let searchFrom = 0;
            for (let occurrence = 0; occurrence < instance; occurrence += 1) {
              found = text.indexOf(search, searchFrom);
              if (found < 0) return text;
              searchFrom = found + search.length;
            }
            const resultLength = text.length + replacement.length - search.length;
            if (resultLength > 100_000) throw new Error('SUBSTITUTE result exceeds the 100,000-character limit.');
            return checkedFormulaText(`${text.slice(0, found)}${replacement}${text.slice(found + search.length)}`, token);
          }
          const resultLength = text.length + occurrences * (replacement.length - search.length);
          if (resultLength > 100_000) throw new Error('SUBSTITUTE result exceeds the 100,000-character limit.');
          return checkedFormulaText(matches.join(replacement), token);
        }
        case 'VALUE': {
          requireCount(1);
          return parseFormulaNumberText(args[0], locale);
        }
        case 'DATEVALUE': {
          requireCount(1);
          const date = parseFormulaDateInContext(args[0], timeZone, 'DATEVALUE');
          return isFormulaDateTimeText(args[0])
            ? formulaLocalDate(date, timeZone)
            : date.toISOString().slice(0, 10);
        }
        case 'DATETIMEVALUE': {
          requireCount(1);
          return parseFormulaDateTime(args[0], timeZone, 'DATETIMEVALUE').toISOString();
        }
        case 'TIMEVALUE': {
          requireCount(1);
          const text = String(args[0] ?? '').trim();
          if (isFormulaDateTimeText(text)) return formulaLocalTime(parseFormulaDateInContext(text, timeZone, 'TIMEVALUE'), timeZone);
          const timeMatch = /^((?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(text);
          if (!timeMatch) {
            throw new Error('TIMEVALUE requires a valid ISO date/time or 24-hour time.');
          }
          const seconds = timeMatch[2] ?? '00';
          const milliseconds = (timeMatch[3] ?? '').padEnd(3, '0') || '000';
          return `${timeMatch[1]}:${seconds}.${milliseconds}`;
        }
        case 'TIME': {
          requireCount(3);
          const [hour, minute, second] = args.map(Number);
          if (![hour, minute, second].every(Number.isInteger)
            || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
            throw new Error('TIME requires valid hour, minute, and second values.');
          }
          return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000`;
        }
        case 'ADDDAYS': {
          requireCount(2);
          const date = parseFormulaDate(args[0], 'ADDDAYS');
          const days = Number(args[1]);
          if (!Number.isInteger(days)) throw new Error('ADDDAYS requires an integer day count.');
          date.setTime(date.getTime() + days * 86_400_000);
          if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
            throw new Error('ADDDAYS produced a date outside the supported range.');
          }
          return String(args[0]).length === 10 ? date.toISOString().slice(0, 10) : date.toISOString();
        }
        case 'DAYS': {
          requireCount(2);
          const end = parseFormulaDate(args[0], 'DAYS');
          const start = parseFormulaDate(args[1], 'DAYS');
          return Math.trunc((end.getTime() - start.getTime()) / 86_400_000);
        }
        case 'YEAR':
        case 'MONTH':
        case 'DAY': {
          if (args.length !== 1) throw new Error(`${token} requires exactly one argument.`);
          const date = parseFormulaDateInContext(args[0], timeZone, token);
          const parts = isFormulaDateTimeText(args[0]) ? formulaDateParts(date, timeZone) : {
            year: String(date.getUTCFullYear()),
            month: String(date.getUTCMonth() + 1),
            day: String(date.getUTCDate())
          };
          return name === 'YEAR' ? Number(parts.year)
            : name === 'MONTH' ? Number(parts.month)
              : Number(parts.day);
        }
        case 'WEEKDAY': {
          if (args.length !== 1) throw new Error('WEEKDAY requires exactly one argument.');
          const date = parseFormulaDateInContext(args[0], timeZone, 'WEEKDAY');
          const dateText = isFormulaDateTimeText(args[0]) ? formulaLocalDate(date, timeZone) : date.toISOString().slice(0, 10);
          const [year, month, day] = dateText.split('-').map(Number);
          return formulaUtcDate(year, month - 1, day).getUTCDay() + 1;
        }
        case 'WEEKNUM': {
          if (args.length < 1 || args.length > 2) throw new Error('WEEKNUM requires a date and an optional week-start type.');
          const instant = parseFormulaDateInContext(args[0], timeZone, 'WEEKNUM');
          const dateText = isFormulaDateTimeText(args[0]) ? formulaLocalDate(instant, timeZone) : instant.toISOString().slice(0, 10);
          const [dateYear, dateMonth, dateDay] = dateText.split('-').map(Number);
          const weekStart = args[1] === undefined ? 1 : Number(args[1]);
          if (weekStart !== 1 && weekStart !== 2) throw new Error('WEEKNUM week-start type must be 1 (Sunday) or 2 (Monday).');
          const yearStart = formulaUtcDate(dateYear, 0, 1);
          const dateStart = formulaUtcDate(dateYear, dateMonth - 1, dateDay);
          const dayOfYear = Math.floor((dateStart.getTime() - yearStart.getTime()) / 86_400_000) + 1;
          const startOffset = weekStart === 1 ? yearStart.getUTCDay() : (yearStart.getUTCDay() + 6) % 7;
          return Math.floor((dayOfYear + startOffset - 1) / 7) + 1;
        }
        case 'HOUR':
        case 'MINUTE':
        case 'SECOND':
        case 'MILLISECOND': {
          if (args.length !== 1) throw new Error(`${token} requires exactly one argument.`);
          const text = String(args[0] ?? '').trim();
          if (isFormulaDateTimeText(text)) {
            const instant = parseFormulaDateInContext(text, timeZone, token);
            if (name === 'MILLISECOND') return instant.getUTCMilliseconds();
            const parts = formulaDateParts(instant, timeZone);
            return name === 'HOUR' ? Number(parts.hour)
              : name === 'MINUTE' ? Number(parts.minute)
                : Number(parts.second);
          }
          if (name === 'MILLISECOND') {
            const match = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,3}))?$/.exec(text);
            if (!match) throw new Error('MILLISECOND requires a valid time or date/time value.');
            return Number((match[1] ?? '').padEnd(3, '0') || 0);
          }
          const date = parseFormulaDate(`2000-01-01T${text.length === 5 ? `${text}:00` : text}Z`, token);
          return name === 'HOUR' ? date.getUTCHours()
            : name === 'MINUTE' ? date.getUTCMinutes()
              : date.getUTCSeconds();
        }
        case 'TZOFFSET': {
          requireCount(1);
          const instant = parseFormulaDateTime(args[0], timeZone, token);
          return formulaTimezoneOffset(instant, timeZone);
        }
        case 'ADDMONTHS': {
          requireCount(2);
          const date = parseFormulaDate(args[0], 'ADDMONTHS');
          const months = Number(args[1]);
          if (!Number.isInteger(months)) throw new Error('ADDMONTHS requires an integer month count.');
          const sourceDay = date.getUTCDate();
          const sourceLastDay = formulaUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 0).getUTCDate();
          const targetFirst = formulaUtcDate(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
          const targetLastDay = formulaUtcDate(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0).getUTCDate();
          const day = sourceDay === sourceLastDay ? targetLastDay : Math.min(sourceDay, targetLastDay);
          targetFirst.setUTCDate(day);
          if (!Number.isFinite(targetFirst.getTime())
            || targetFirst.getUTCFullYear() < 1 || targetFirst.getUTCFullYear() > 9999) {
            throw new Error('ADDMONTHS produced a date outside the supported range.');
          }
          return targetFirst.toISOString().slice(0, 10);
        }
        case 'MOD': {
          requireCount(2);
          const dividend = finiteNumber(args[0], token);
          const divisor = finiteNumber(args[1], token);
          if (divisor === 0) {
            throw new Error('MOD requires finite numbers and a non-zero divisor.');
          }
          return dividend % divisor;
        }
        case 'ABS':
          requireCount(1);
          return Math.abs(finiteNumber(args[0], token));
        case 'SQRT': {
          requireCount(1);
          const numeric = finiteNumber(args[0], token);
          if (numeric < 0) throw new Error('SQRT requires a non-negative number.');
          return Math.sqrt(numeric);
        }
        case 'POWER': {
          requireCount(2);
          const result = finiteNumber(args[0], token) ** finiteNumber(args[1], token);
          if (!Number.isFinite(result)) throw new Error('POWER must produce a finite number.');
          return result;
        }
        case 'EXP':
          requireCount(1);
          {
            const result = Math.exp(finiteNumber(args[0], token));
            if (!Number.isFinite(result)) throw new Error('EXP must produce a finite number.');
            return result;
          }
        case 'LN': {
          requireCount(1);
          const numeric = finiteNumber(args[0], token);
          if (numeric <= 0) throw new Error('LN requires a positive number.');
          return Math.log(numeric);
        }
        case 'LOG': {
          requireCount(1, 2);
          const numeric = finiteNumber(args[0], token);
          const base = args[1] === undefined ? 10 : finiteNumber(args[1], token);
          if (numeric <= 0 || base <= 0 || base === 1) throw new Error('LOG requires a positive number and a positive base other than 1.');
          const result = Math.log(numeric) / Math.log(base);
          if (!Number.isFinite(result)) throw new Error('LOG must produce a finite number.');
          return result;
        }
        case 'PI':
          requireCount(0);
          return Math.PI;
        case 'DEGREES':
          requireCount(1);
          return finiteNumber(args[0], token) * 180 / Math.PI;
        case 'RADIANS':
          requireCount(1);
          return finiteNumber(args[0], token) * Math.PI / 180;
        case 'GEOLOCATION': {
          requireCount(2);
          const latitude = finiteNumber(args[0], token);
          const longitude = finiteNumber(args[1], token);
          if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new Error('GEOLOCATION latitude must be between -90 and 90 and longitude between -180 and 180.');
          }
          return { latitude, longitude };
        }
        case 'DISTANCE': {
          requireCount(3);
          const location = (value: unknown, argument: number) => {
            if (typeof value !== 'object' || value === null || Array.isArray(value)
              || typeof (value as Record<string, unknown>).latitude !== 'number'
              || typeof (value as Record<string, unknown>).longitude !== 'number') {
              throw new Error(`DISTANCE argument ${argument} must be a GEOLOCATION value.`);
            }
            const point = value as { latitude: number; longitude: number };
            if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
              || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
              throw new Error(`DISTANCE argument ${argument} contains invalid coordinates.`);
            }
            return point;
          };
          const first = location(args[0], 1);
          const second = location(args[1], 2);
          const unit = String(args[2]).toLowerCase();
          const radius = unit === 'mi' ? 3958.761316 : unit === 'km' ? 6371.0088 : undefined;
          if (radius === undefined) throw new Error('DISTANCE unit must be "mi" or "km".');
          const radians = (degrees: number) => degrees * Math.PI / 180;
          const latitudeDelta = radians(second.latitude - first.latitude);
          const longitudeDelta = radians(second.longitude - first.longitude);
          const haversine = Math.sin(latitudeDelta / 2) ** 2
            + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
            * Math.sin(longitudeDelta / 2) ** 2;
          const result = radius * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
          if (!Number.isFinite(result)) throw new Error('DISTANCE could not calculate a finite distance.');
          return result;
        }
        case 'CURRENCYRATE': {
          requireCount(1);
          const currencyIsoCode = String(args[0] ?? '').trim().toUpperCase();
          if (!/^[A-Z]{3}$/.test(currencyIsoCode)) {
            throw new Error('CURRENCYRATE requires a valid three-letter ISO 4217 currency code.');
          }
          const corporateCurrency = formulaContext.corporateCurrency ?? 'USD';
          if (currencyIsoCode === corporateCurrency) return 1;
          const conversionRate = formulaContext.currencyRates?.[currencyIsoCode];
          if (conversionRate === undefined || !Number.isFinite(conversionRate) || conversionRate <= 0) {
            throw new Error(`CURRENCYRATE currency "${currencyIsoCode}" is not active or has no configured exchange rate.`);
          }
          return conversionRate;
        }
        case 'CONVERTCURRENCY': {
          requireCount(1);
          if (args[0] === null || args[0] === undefined || args[0] === '') return null;
          const amount = finiteNumber(args[0], token);
          const corporateCurrency = formulaContext.corporateCurrency ?? 'USD';
          const sourceCurrency = (formulaContext.currencyIsoCode ?? corporateCurrency).toUpperCase();
          const targetCurrency = (formulaContext.userCurrencyIsoCode ?? corporateCurrency).toUpperCase();
          const rateFor = (currency: string) => {
            if (!/^[A-Z]{3}$/.test(currency)) {
              throw new Error(`CONVERTCURRENCY currency "${currency}" must be a valid three-letter ISO 4217 code.`);
            }
            const rate = currency === corporateCurrency ? 1 : formulaContext.currencyRates?.[currency];
            if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
              throw new Error(`CONVERTCURRENCY currency "${currency}" is not active or has no configured exchange rate.`);
            }
            return rate;
          };
          const converted = amount * rateFor(sourceCurrency) / rateFor(targetCurrency);
          if (!Number.isFinite(converted)) throw new Error('CONVERTCURRENCY must produce a finite number.');
          return converted;
        }
        case 'SIN':
        case 'COS':
        case 'TAN':
        case 'ASIN':
        case 'ACOS':
        case 'ATAN':
        case 'SINH':
        case 'COSH':
        case 'TANH': {
          requireCount(1);
          const numeric = Number(args[0]);
          if (!Number.isFinite(numeric)) throw new Error(`${token} requires a finite number.`);
          if ((name === 'ASIN' || name === 'ACOS') && Math.abs(numeric) > 1) {
            throw new Error(`${token} requires a value between -1 and 1.`);
          }
          const functions: Record<string, (value: number) => number> = {
            SIN: Math.sin, COS: Math.cos, TAN: Math.tan, ASIN: Math.asin, ACOS: Math.acos,
            ATAN: Math.atan, SINH: Math.sinh, COSH: Math.cosh, TANH: Math.tanh
          };
          const result = functions[name](numeric);
          if (!Number.isFinite(result)) throw new Error(`${token} did not produce a finite result.`);
          return result;
        }
        case 'ATAN2': {
          requireCount(2);
          const [x, y] = args.map((value) => finiteNumber(value, token));
          if (x === 0 && y === 0) {
            throw new Error('ATAN2 requires finite coordinates that are not both zero.');
          }
          return Math.atan2(x, y);
        }
        case 'COT': {
          requireCount(1);
          const tangent = Math.tan(finiteNumber(args[0], token));
          if (!Number.isFinite(tangent) || Math.abs(tangent) < Number.EPSILON) {
            throw new Error('COT is undefined for this value.');
          }
          return 1 / tangent;
        }
        case 'SIGN':
          requireCount(1);
          return Math.sign(finiteNumber(args[0], token));
        case 'CEILING':
          requireCount(1);
          return Math.ceil(finiteNumber(args[0], token));
        case 'MCEILING': {
          requireCount(1);
          const numeric = finiteNumber(args[0], token);
          return Math.sign(numeric) * Math.ceil(Math.abs(numeric));
        }
        case 'FLOOR':
          requireCount(1);
          return Math.floor(finiteNumber(args[0], token));
        case 'MFLOOR': {
          requireCount(1);
          const numeric = finiteNumber(args[0], token);
          return Math.sign(numeric) * Math.floor(Math.abs(numeric));
        }
        case 'MIN':
        case 'MAX': {
          if (!args.length || args.length > 255) throw new Error(`${token} requires between 1 and 255 numbers.`);
          const numbers = args.map((value) => finiteNumber(value, token));
          return name === 'MIN' ? Math.min(...numbers) : Math.max(...numbers);
        }
        case 'ROUND': {
          requireCount(1, 2);
          const precision = Number(args[1] ?? 0);
          if (!Number.isInteger(precision) || precision < -15 || precision > 15) throw new Error('ROUND precision must be an integer from -15 through 15.');
          const numeric = finiteNumber(args[0], token);
          return roundFormulaNumber(numeric, precision, 'round');
        }
        case 'ROUNDUP':
        case 'ROUNDDOWN': {
          requireCount(1, 2);
          const precision = Number(args[1] ?? 0);
          if (!Number.isInteger(precision) || precision < -15 || precision > 15) throw new Error(`${token} precision must be an integer from -15 through 15.`);
          const numeric = finiteNumber(args[0], token);
          return roundFormulaNumber(numeric, precision, name === 'ROUNDUP' ? 'up' : 'down');
        }
        case 'TRUNC': {
          requireCount(1, 2);
          const precision = Number(args[1] ?? 0);
          if (!Number.isInteger(precision) || precision < -15 || precision > 15) throw new Error('TRUNC precision must be an integer from -15 through 15.');
          const numeric = finiteNumber(args[0], token);
          return roundFormulaNumber(numeric, precision, 'down');
        }
        case 'REGEX': {
          requireCount(2);
          const text = String(args[0] ?? '');
          const pattern = String(args[1] ?? '');
          if (!isSafeFlowRegex(pattern) || text.length > 512) throw new Error('REGEX inputs use unsupported syntax or exceed the supported size.');
          try {
            return new RegExp(pattern).test(text);
          } catch {
            throw new Error('REGEX requires a valid regular expression.');
          }
        }
        case 'TEXT': {
          requireCount(1);
          if (args[0] === null || args[0] === undefined) return '';
          if (typeof args[0] === 'boolean') return args[0] ? 'TRUE' : 'FALSE';
          if (typeof args[0] === 'number') return new Intl.NumberFormat(locale, {
            useGrouping: false,
            maximumFractionDigits: 15
          }).format(args[0]);
          return String(args[0]);
        }
        case 'TODAY': {
          if (args.length !== 0) throw new Error('TODAY does not accept arguments.');
          return formulaLocalDate(new Date(), timeZone);
        }
        case 'NOW': {
          if (args.length !== 0) throw new Error('NOW does not accept arguments.');
          return new Date().toISOString();
        }
        case 'TIMENOW': {
          requireCount(0);
          return formulaLocalTime(new Date(), timeZone);
        }
        case 'DATE': {
          if (args.length !== 3) throw new Error('DATE requires exactly three arguments.');
          const [year, month, day] = args.map(Number);
          if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9999
            || month < 1 || month > 12 || day < 1 || day > 31) {
            throw new Error('DATE formula contains an invalid date.');
          }
          const date = formulaUtcDate(year, month - 1, day);
          if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year
            || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
            throw new Error('DATE formula contains an invalid date.');
          }
          return date.toISOString().slice(0, 10);
        }
        default: throw new Error(`Formula function "${token}" is not supported.`);
      }
    }
    throw new Error(`Unexpected token "${token}" in formula.`);
  };
  const result = parseOr();
  if (cursor !== tokens.length) throw new Error(`Unexpected token "${tokens[cursor]}" at the end of formula.`);
  if (typeof result === 'number' && !Number.isFinite(result)) {
    throw new Error('Formula arithmetic must produce a finite number.');
  }
  if (typeof result === 'string') checkedFormulaText(result);
  return result;
}

