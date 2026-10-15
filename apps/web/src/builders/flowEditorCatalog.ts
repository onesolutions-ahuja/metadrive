import type { FlowDefinitionMetadata } from '../metadata';
export const flowTypeOptions: Array<{ type: FlowDefinitionMetadata['flowType']; description: string }> = [
    { type: 'Screen Flow', description: 'Guide a user through screens and actions.' },
    { type: 'Record-Triggered Flow', description: 'Run when a record is created or updated.' },
    { type: 'Autolaunched Flow', description: 'Run in the background or from another flow.' },
    { type: 'Flow Orchestration', description: 'Coordinate durable approval stages and human work items.' },
    { type: 'Schedule-Triggered Flow', description: 'Run records on a scheduled basis.' },
    { type: 'Platform Event-Triggered Flow', description: 'Run when a platform event is published.' }
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
