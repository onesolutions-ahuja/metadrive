export type RecordFilterOperator =
  | 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'
  | 'contains' | 'startsWith' | 'includes' | 'excludes' | 'in';

export type RecordFilter = {
  field: string;
  operator: RecordFilterOperator;
  value: string | string[];
};

export type QueryField = {
  api_name: string;
  data_type: string;
  rollup_source_data_type?: string | null;
};

export type RecordCursor = {
  field: string | null;
  direction: 'asc' | 'desc';
  value: string | null;
  id: string;
};

const apiName = /^[A-Za-z][A-Za-z0-9_]*$/;
const operators = new Set<RecordFilterOperator>([
  'eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'includes', 'excludes', 'in',
]);
const typedColumns: Record<string, { column: string; cast: string }> = {
  number: { column: 'value_number', cast: 'numeric' },
  currency: { column: 'value_number', cast: 'numeric' },
  percent: { column: 'value_number', cast: 'numeric' },
  date: { column: 'value_date', cast: 'date' },
  datetime: { column: 'value_datetime', cast: 'timestamptz' },
  boolean: { column: 'value_boolean', cast: 'boolean' },
};

export function parseFilterLogic(logic: string | undefined, count: number): string {
  if (!Number.isInteger(count) || count < 0 || count > 20)
    throw new Error('Invalid record filter count');
  if (count === 0) {
    if (logic?.trim()) throw new Error('Filter logic requires filters');
    return '';
  }
  if (!logic?.trim()) return Array.from({ length: count }, (_, index) => `f${index}`).join(' AND ');

  const tokens = logic.match(/\d+|AND|OR|\(|\)/gi) ?? [];
  if (tokens.join('').toLowerCase() !== logic.replace(/\s+/g, '').toLowerCase())
    throw new Error('Invalid record filter logic');
  let position = 0;
  const used=new Set<number>();
  const parsePrimary = (): string => {
    const token = tokens[position++];
    if (token === '(') {
      const result = parseOr();
      if (tokens[position++] !== ')') throw new Error('Invalid record filter logic');
      return `(${result})`;
    }
    const index = Number(token);
    if (!Number.isInteger(index) || index < 1 || index > count)
      throw new Error('Invalid record filter reference');
    if(used.has(index))throw new Error('Duplicate record filter reference');
    used.add(index);
    return `f${index - 1}`;
  };
  const parseAnd = (): string => {
    let value = parsePrimary();
    while (tokens[position]?.toUpperCase() === 'AND') {
      position++;
      value = `(${value} AND ${parsePrimary()})`;
    }
    return value;
  };
  const parseOr = (): string => {
    let value = parseAnd();
    while (tokens[position]?.toUpperCase() === 'OR') {
      position++;
      value = `(${value} OR ${parseAnd()})`;
    }
    return value;
  };
  const result = parseOr();
  if (position !== tokens.length||used.size!==count) throw new Error('Invalid record filter logic');
  return result;
}

export function parseRecordFilters(raw: string | undefined): RecordFilter[] {
  if (raw === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid record filters');
  }
  if (!Array.isArray(parsed) || parsed.length > 20) throw new Error('Invalid record filters');
  return parsed.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid record filter');
    const filter = item as Record<string, unknown>;
    if (typeof filter.field !== 'string' || !apiName.test(filter.field) ||
        typeof filter.operator !== 'string' || !operators.has(filter.operator as RecordFilterOperator) ||
        (typeof filter.value !== 'string' && !Array.isArray(filter.value)) ||
        (Array.isArray(filter.value) && filter.value.some(value => typeof value !== 'string')))
      throw new Error('Invalid record filter');
    return {
      field: filter.field,
      operator: filter.operator as RecordFilterOperator,
      value: filter.value as string | string[],
    };
  });
}

export function parseRecordCursor(raw: string | undefined): RecordCursor | undefined {
  if (raw === undefined) return undefined;
  if (raw.length > 2048) throw new Error('Invalid record cursor');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid record cursor');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid record cursor');
  const cursor = parsed as Record<string, unknown>;
  if ((cursor.field !== null && (typeof cursor.field !== 'string' || !apiName.test(cursor.field))) ||
      (cursor.direction !== 'asc' && cursor.direction !== 'desc') ||
      (cursor.value !== null && (typeof cursor.value !== 'string' || cursor.value.length > 512)) ||
      typeof cursor.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursor.id))
    throw new Error('Invalid record cursor');
  return cursor as RecordCursor;
}

export function compileRecordFilters(
  filters: readonly RecordFilter[],
  logic: string | undefined,
  fields: ReadonlyMap<string, QueryField>,
  firstParameter: number,
): { predicate: string; parameters: unknown[] } {
  if (filters.length > 20) throw new Error('Too many record filters');
  const parameters: unknown[] = [];
  const predicates = filters.map((filter, index) => {
    if (!apiName.test(filter.field)) throw new Error('Invalid list field');
    const field = fields.get(filter.field);
    if (!field || ['formula', 'geolocation', 'address', 'encryptedtext'].includes(field.data_type))
      throw new Error('Invalid list field');
    if (!operators.has(filter.operator))
      throw new Error('Invalid record filter operator');
    const sourceType = field.data_type === 'rollup' ? field.rollup_source_data_type : field.data_type;
    const typed = sourceType ? typedColumns[sourceType] : undefined;
    const fieldParameter = `$${firstParameter + parameters.length}`;
    parameters.push(filter.field);
    const valueParameter = `$${firstParameter + parameters.length}`;
    if (filter.operator === 'in') {
      if (!Array.isArray(filter.value) || !filter.value.length || filter.value.length > 100 ||
          filter.value.some(value => typeof value !== 'string' || value.length > 512))
        throw new Error('Invalid IN filter values');
      parameters.push(filter.value);
      const column = typed ? `fv.${typed.column}` : `COALESCE(fv.value_text,fv.reference_record_id::text)`;
      const cast = typed ? `::${typed.cast}[]` : '::text[]';
      return `EXISTS(SELECT 1 FROM md_record_values fv WHERE fv.tenant_id=r.tenant_id
        AND fv.record_id=r.id AND fv.object_api=r.object_api AND fv.field_api=${fieldParameter}
        AND ${column}=ANY(${valueParameter}${cast}))`;
    }
    if (typeof filter.value !== 'string' || filter.value.length > 2000)
      throw new Error('Invalid record filter value');
    if ((filter.operator === 'includes' || filter.operator === 'excludes') &&
        field.data_type === 'multipicklist') {
      const includedValues=filter.value.split(';');
      if(includedValues.some(value=>!value||value.length>512)
        ||includedValues.length>200||new Set(includedValues).size!==includedValues.length)
        throw new Error('Invalid multi-select filter values');
      parameters.push(includedValues);
      const membership = `COALESCE((SELECT array_agg(mv.value ORDER BY mv.sort_order)
        FROM md_record_multi_values mv WHERE mv.tenant_id=r.tenant_id AND mv.record_id=r.id
          AND mv.object_api=r.object_api AND mv.field_api=${fieldParameter}),ARRAY[]::text[])`;
      return filter.operator==='includes'
        ?`${membership} @> ${valueParameter}::text[]`
        :`NOT (${membership} @> ${valueParameter}::text[])`;
    }
    if (filter.operator === 'contains' || filter.operator === 'startsWith') {
      if (!['text', 'email', 'phone', 'url', 'picklist'].includes(field.data_type))
        throw new Error('Text operators require a text field');
      const escapedValue = filter.value.replace(/[\\%_]/g, '\\$&');
      parameters.push(filter.operator === 'contains' ? `%${escapedValue}%` : `${escapedValue}%`);
      return `EXISTS(SELECT 1 FROM md_record_values fv WHERE fv.tenant_id=r.tenant_id
        AND fv.record_id=r.id AND fv.object_api=r.object_api AND fv.field_api=${fieldParameter}
        AND lower(fv.value_text) LIKE lower(${valueParameter}) ESCAPE '\\')`;
    }
    if (filter.operator === 'includes'||filter.operator==='excludes')
      throw new Error('Includes requires a multi-select picklist');
    if (filter.operator === 'ne') {
      parameters.push(filter.value);
      const comparison = typed
        ? `fv.${typed.column}=${valueParameter}::${typed.cast}`
        : `COALESCE(fv.value_text,fv.reference_record_id::text)=${valueParameter}`;
      return `NOT EXISTS(SELECT 1 FROM md_record_values fv WHERE fv.tenant_id=r.tenant_id
        AND fv.record_id=r.id AND fv.object_api=r.object_api AND fv.field_api=${fieldParameter}
        AND ${comparison})`;
    }
    const sqlOperators: Record<string, string> = { eq: '=', lt: '<', lte: '<=', gt: '>', gte: '>=' };
    const sqlOperator = sqlOperators[filter.operator];
    if (!sqlOperator) throw new Error('Invalid record filter operator');
    parameters.push(filter.value);
    const comparison = typed
      ? `fv.${typed.column}${sqlOperator}${valueParameter}::${typed.cast}`
      : `COALESCE(fv.value_text,fv.reference_record_id::text)${sqlOperator}${valueParameter}`;
    return `EXISTS(SELECT 1 FROM md_record_values fv WHERE fv.tenant_id=r.tenant_id
      AND fv.record_id=r.id AND fv.object_api=r.object_api AND fv.field_api=${fieldParameter}
      AND ${comparison})`;
  });
  const expression = parseFilterLogic(logic, filters.length);
  const predicate = expression.replace(/f(\d+)/g, (_, index: string) => predicates[Number(index)]);
  return { predicate, parameters };
}
