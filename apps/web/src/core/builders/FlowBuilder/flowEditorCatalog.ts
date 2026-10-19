import type { FlowDefinitionMetadata } from '../../metadata/Definitions/metadata';
export const flowTypeOptions: Array<{ type: FlowDefinitionMetadata['flowType']; description: string }> = [
    { type: 'Screen Flow', description: 'Guide a user through screens and actions.' },
    { type: 'Autolaunched Flow', description: 'Run in the background or from another flow.' }
  ];
export const formulaFunctions = [
    'TRUE', 'FALSE', 'IF', 'CASE', 'AND', 'OR', 'NOT', 'XOR', 'ISNEW', 'ISCLONE', 'ISCHANGED', 'PRIORVALUE', 'ISBLANK', 'ISNULL', 'BLANKVALUE', 'NULLVALUE', 'EXACT',
    'ISNUMBER', 'LEN', 'ASCII', 'LOWER', 'UPPER', 'TRIM', 'PROPER', 'LEFT', 'RIGHT', 'MID', 'FIND',
    'SUBSTITUTE', 'CONCATENATE', 'CONTAINS', 'BEGINS', 'ISPICKVAL', 'INCLUDES', 'VALUE', 'TEXT', 'DATE',
    'DATEVALUE', 'DATETIMEVALUE', 'TIME', 'TIMEVALUE', 'TODAY', 'NOW', 'TIMENOW', 'YEAR', 'MONTH', 'DAY',
    'WEEKDAY', 'WEEKNUM', 'HOUR', 'MINUTE', 'SECOND', 'MILLISECOND', 'ADDDAYS', 'DAYS', 'ADDMONTHS',
    'TZOFFSET', 'ABS', 'SQRT', 'POWER', 'EXP', 'LN', 'LOG', 'PI', 'DEGREES', 'RADIANS', 'SIN', 'COS',
    'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2', 'SINH', 'COSH', 'TANH', 'COT', 'SIGN', 'CEILING', 'MCEILING',
    'FLOOR', 'MFLOOR', 'MIN', 'MAX', 'MOD', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'TRUNC', 'REGEX', 'GEOLOCATION',
    'DISTANCE', 'CURRENCYRATE', 'CONVERTCURRENCY', 'CASESAFEID', 'HYPERLINK', 'IMAGE', 'URLENCODE',
    'ENCODEURL', 'URLDECODE', 'HTMLENCODE', 'JSENCODE', 'REPT', 'REVERSE', 'LPAD', 'RPAD', 'BR'
  ];
export const formulaOperators = ['+', '-', '*', '/', '^', '&', '=', '<>', '!=', '<', '<=', '>', '>=', 'AND', 'OR'];
