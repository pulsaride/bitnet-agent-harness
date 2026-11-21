export interface SchemaValidationResult {
  readonly valid: boolean
  readonly errors?: readonly string[]
}

const SUPPORTED = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'enum', 'const', 'minimum', 'maximum', 'minItems', 'maxItems'])

function validate(schema: unknown, value: unknown, location = '$'): string[] {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return [`${location}: schema must be an object`]
  const record = schema as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!SUPPORTED.has(key)) throw new Error(`unsupported schema keyword: ${key}`)
  }
  if (record.enum && Array.isArray(record.enum) && !record.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) return [`${location}: not in enum`]
  if ('const' in record && JSON.stringify(record.const) !== JSON.stringify(value)) return [`${location}: wrong constant`]
  if (typeof record.type === 'string') {
    const matches = record.type === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value)
      : record.type === 'array' ? Array.isArray(value)
        : record.type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
          : typeof value === record.type
    if (!matches) return [`${location}: expected ${record.type}`]
  }
  const errors: string[] = []
  if (typeof record.minLength === 'number' && typeof value === 'string' && value.length < record.minLength) errors.push(`${location}: string too short`)
  if (typeof record.maxLength === 'number' && typeof value === 'string' && value.length > record.maxLength) errors.push(`${location}: string too long`)
  if (typeof record.pattern === 'string' && typeof value === 'string' && !new RegExp(record.pattern).test(value)) errors.push(`${location}: pattern mismatch`)
  if (typeof record.minimum === 'number' && typeof value === 'number' && value < record.minimum) errors.push(`${location}: below minimum`)
  if (typeof record.maximum === 'number' && typeof value === 'number' && value > record.maximum) errors.push(`${location}: above maximum`)
  if (Array.isArray(value)) {
    if (typeof record.minItems === 'number' && value.length < record.minItems) errors.push(`${location}: too few items`)
    if (typeof record.maxItems === 'number' && value.length > record.maxItems) errors.push(`${location}: too many items`)
    if (record.items) for (const [index, item] of value.entries()) errors.push(...validate(record.items, item, `${location}[${index}]`))
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const object = value as Record<string, unknown>
    const properties = typeof record.properties === 'object' && record.properties !== null ? record.properties as Record<string, unknown> : {}
    for (const required of Array.isArray(record.required) ? record.required : []) {
      if (typeof required === 'string' && !(required in object)) errors.push(`${location}: missing ${required}`)
    }
    for (const [key, child] of Object.entries(object)) {
      if (key in properties) errors.push(...validate(properties[key], child, `${location}.${key}`))
      else if (record.additionalProperties === false) errors.push(`${location}: unexpected ${key}`)
    }
  }
  return errors
}

export function validateJsonSchema(value: unknown, schema: unknown): SchemaValidationResult {
  const errors = validate(schema, value)
  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

export function requireValidJsonSchema(value: unknown, schema: unknown, label = 'value'): void {
  const result = validateJsonSchema(value, schema)
  if (!result.valid) throw new Error(`${label} failed schema validation: ${(result.errors ?? []).join('; ')}`)
}
