import {
  type StrictEnvNumberConstraints,
  type StrictEnvOptions,
  type StrictEnvSpec,
  type StrictEnvSpecToType,
} from './env-type';
import { StrictEnvValidationError } from './errors';

/**
 * Pattern for boolean env values that parse as `true`.
 * Matches `1`, `true`, `yes`, and `on` (case-insensitive) on the full trimmed string.
 */
const TRUE_BOOLEAN_PATTERN = /^(1|true|yes|on)$/i;

/**
 * Parses a string as a finite number for environment variables.
 *
 * @param raw - Normalized environment variable value (trimmed when `trim` is enabled).
 * @returns Parsed number, or `undefined` when the value is not a finite number.
 */
const parseNumber = (raw: string): number | undefined => {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return undefined;
  }
  return n;
};

/**
 * Parses a normalized string as a boolean environment variable value.
 *
 * @param normalizedRaw - Normalized environment variable value (trimmed when `trim` is enabled).
 * @returns `true` for `1`/`true`/`yes`/`on` (case-insensitive); otherwise `false`.
 */
const parseBooleanEnvValue = (normalizedRaw: string): boolean => TRUE_BOOLEAN_PATTERN.test(normalizedRaw);

/**
 * Default trim behavior per spec type.
 * Parsed types trim by default; strings preserve the raw value unless opted in.
 *
 * @param spec - Environment variable spec.
 * @returns Whether leading/trailing whitespace should be trimmed before validation.
 */
const defaultTrimForSpec = (spec: StrictEnvSpec): boolean => spec.type !== 'string';

/**
 * Normalizes a raw environment variable value before validation.
 *
 * @param raw - Raw value from `process.env`, if present.
 * @param trim - Whether to trim leading/trailing whitespace.
 * @returns Normalized value, or `undefined` when unset.
 */
const normalizeEnvRaw = (raw: string | undefined, trim: boolean): string | undefined => {
  if (raw == null) {
    return undefined;
  }
  if (!trim) {
    return raw;
  }
  return raw.trim();
};

/**
 * Validates a parsed number against optional {@link StrictEnvNumberConstraints}.
 *
 * @template K - Environment variable key type.
 * @param key - Environment variable name.
 * @param raw - Raw value from `process.env`, if present.
 * @param n - Parsed finite number.
 * @param constraints - Optional `min`, `max`, `exclusiveMin`, `exclusiveMax`, and/or `integer` constraints.
 * @throws {StrictEnvValidationError} When the number fails an integer or range constraint.
 */
const validateNumberConstraints = <K extends string>(
  key: K,
  raw: string | undefined,
  n: number,
  constraints: StrictEnvNumberConstraints,
): void => {
  // Integer first so e.g. Port `80.5` reports "expected integer", not a range error.
  if (constraints.integer === true && !Number.isInteger(n)) {
    throw new StrictEnvValidationError([{
      key,
      message: `Env ${key}: expected integer, got "${raw}"`,
      raw,
      kind: 'invalid_number',
    }]);
  }

  if (constraints.min !== undefined && n < constraints.min) {
    throw new StrictEnvValidationError([{
      key,
      message: `Env ${key}: must be >= ${constraints.min}, got ${n}`,
      raw,
      kind: 'invalid_number',
    }]);
  }

  if (constraints.exclusiveMin !== undefined && n <= constraints.exclusiveMin) {
    throw new StrictEnvValidationError([{
      key,
      message: `Env ${key}: must be > ${constraints.exclusiveMin}, got ${n}`,
      raw,
      kind: 'invalid_number',
    }]);
  }

  if (constraints.max !== undefined && n > constraints.max) {
    throw new StrictEnvValidationError([{
      key,
      message: `Env ${key}: must be <= ${constraints.max}, got ${n}`,
      raw,
      kind: 'invalid_number',
    }]);
  }

  if (constraints.exclusiveMax !== undefined && n >= constraints.exclusiveMax) {
    throw new StrictEnvValidationError([{
      key,
      message: `Env ${key}: must be < ${constraints.exclusiveMax}, got ${n}`,
      raw,
      kind: 'invalid_number',
    }]);
  }
};

/** Options accepted by `parseEnvValue` (subset of {@link StrictEnvOptions}). */
type ParseEnvValueOptions<S extends StrictEnvSpec> = Pick<StrictEnvOptions<S>, 'trim'>;

/**
 * Parses a single environment variable according to the given spec.
 *
 * Central validation helper shared by `resolve` and `resolves`.
 * Throws a single-entry {@link StrictEnvValidationError} so `resolve` can propagate it
 * and `resolves` can collect one error per key.
 *
 * Missing or empty (`""`) values use `defaultValue` when provided. When `trim` is enabled,
 * whitespace-only values are treated as empty. Number specs delegate to `parseNumber`, then
 * optional `min` / `max` / `exclusiveMin` / `exclusiveMax` / `integer` constraints
 * (see {@link StrictEnvNumberConstraints}).
 * Boolean specs treat `1`/`true`/`yes`/`on` (case-insensitive, after normalization) as `true`.
 * Enum specs require an exact match in `choices` (after normalization).
 *
 * @template K - Environment variable key type.
 * @template S - Environment variable spec type.
 * @param key - Environment variable name.
 * @param spec - Type spec for the value.
 * @param raw - Raw value from `process.env`, if present.
 * @param defaultValue - Fallback from {@link StrictEnvOptions.default} when `raw` is missing or empty.
 * @param options - Optional trim override (`trim` defaults per spec type).
 * @returns Parsed value.
 * @throws {StrictEnvValidationError} When the variable is missing, empty without a default,
 *   whitespace-only without a default (when trimming), or invalid for the spec.
 */
export const parseEnvValue = <K extends string, S extends StrictEnvSpec>(
  key: K,
  spec: S,
  raw: string | undefined,
  defaultValue: StrictEnvSpecToType<S> | undefined,
  options?: ParseEnvValueOptions<S>,
): StrictEnvSpecToType<S> => {
  const trim = options?.trim ?? defaultTrimForSpec(spec);
  const normalizedRaw = normalizeEnvRaw(raw, trim);
  const hasDefault = defaultValue !== undefined;

  if (normalizedRaw == null || normalizedRaw === '') {
    if (hasDefault) {
      return defaultValue as StrictEnvSpecToType<S>;
    }
    throw new StrictEnvValidationError([{
      key,
      message: `Missing required environment variable: ${key}`,
      raw,
      kind: 'missing',
    }]);
  }

  switch (spec.type) {
    case 'number': {
      const n = parseNumber(normalizedRaw);
      if (n === undefined) {
        throw new StrictEnvValidationError([{
          key,
          message: `Env ${key}: expected number, got "${raw}"`,
          raw,
          kind: 'invalid_number',
        }]);
      }
      validateNumberConstraints(key, raw, n, spec);
      return n as StrictEnvSpecToType<S>;
    }
    case 'boolean':
      return parseBooleanEnvValue(normalizedRaw) as StrictEnvSpecToType<S>;
    case 'enum':
      if (!spec.choices.includes(normalizedRaw)) {
        throw new StrictEnvValidationError([{
          key,
          message: `Env ${key}: must be one of [${spec.choices.join(', ')}]`,
          raw,
          kind: 'invalid_enum',
        }]);
      }
      return normalizedRaw as StrictEnvSpecToType<S>;
    default:
      return normalizedRaw as StrictEnvSpecToType<S>;
  }
};
