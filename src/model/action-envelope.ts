export interface ActionEnvelope {
  protocolVersion: 1
  action: {
    name: string
    arguments: Record<string, unknown>
    rationale?: string
  }
}

export class ActionEnvelopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionEnvelopeError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateActionEnvelope(value: unknown): ActionEnvelope {
  if (!isRecord(value) || value.protocolVersion !== 1 || !isRecord(value.action)) {
    throw new ActionEnvelopeError('expected protocolVersion 1 with an action object')
  }
  const { name, arguments: actionArguments, rationale } = value.action
  if (typeof name !== 'string' || name.length === 0) {
    throw new ActionEnvelopeError('action.name must be a non-empty string')
  }
  if (!isRecord(actionArguments)) {
    throw new ActionEnvelopeError('action.arguments must be an object')
  }
  if (rationale !== undefined && typeof rationale !== 'string') {
    throw new ActionEnvelopeError('action.rationale must be a string when present')
  }
  return {
    protocolVersion: 1,
    action: {
      name,
      arguments: { ...actionArguments },
      ...(typeof rationale === 'string' ? { rationale } : {})
    }
  }
}

export function parseActionEnvelope(text: string): ActionEnvelope {
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    throw new ActionEnvelopeError('model output is not valid JSON')
  }
  return validateActionEnvelope(decoded)
}

export function parseActionEnvelopeForAllowedAction(
  text: string,
  allowedActions: ReadonlySet<string>
): ActionEnvelope {
  const envelope = parseActionEnvelope(text)
  if (!allowedActions.has(envelope.action.name)) {
    throw new ActionEnvelopeError(`action ${JSON.stringify(envelope.action.name)} is not allowed`)
  }
  return envelope
}
