import {
  type StrictEnvBooleanVocabulary,
  type StrictEnvNumberConstraints,
  type StrictEnvOptions,
  type StrictEnvSpec,
  type StrictEnvSpecToType,
} from './env-type';
import { StrictEnvValidationError } from './errors';

/**
 * Flag vocabulary tokens that parse as `true` (case-insensitive).
 * `1`, `true`, `yes`, and `on`.
 */
const BOOLEAN_FLAG_TRUE_TOKENS: readonly string[] = ['1', 'true', 'yes', 'on'];

/**
 * Flag vocabulary tokens that parse as `false` (case-insensitive).
 * `0`, `false`, `no`, and `off`. Tokens outside both flag sets are rejected.
 */
const BOOLEAN_FLAG_FALSE_TOKENS: readonly string[] = ['0', 'false', 'no', 'off'];

/** Literal vocabulary token that parses as `true`. */
const BOOLEAN_LITERAL_TRUE_TOKENS: readonly string[] = ['true'];

/** Literal vocabulary token that parses as `false`. */
const BOOLEAN_LITERAL_FALSE_TOKENS: readonly string[] = ['false'];

/** True and false tokens for one boolean vocabulary. */
type BooleanTokenSet = {
  trueTokens: readonly string[];
  falseTokens: readonly string[];
};

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
 * Token sets for a boolean vocabulary.
 * Omitted vocabulary uses the flag set so `{ type: 'boolean' }` stays valid.
 *
 * @param vocabulary - Token vocabulary from the boolean spec, if set.
 * @returns True and false tokens for that vocabulary.
 */
const booleanTokenSet = (vocabulary: StrictEnvBooleanVocabulary | undefined): BooleanTokenSet => {
  if (vocabulary === 'literal') {
    return {
      trueTokens: BOOLEAN_LITERAL_TRUE_TOKENS,
      falseTokens: BOOLEAN_LITERAL_FALSE_TOKENS,
    };
  }
  return {
    trueTokens: BOOLEAN_FLAG_TRUE_TOKENS,
    falseTokens: BOOLEAN_FLAG_FALSE_TOKENS,
  };
};

/**
 * Parses a normalized string as a boolean environment variable value.
 *
 * @param normalizedRaw - Normalized environment variable value (trimmed when `trim` is enabled).
 * @param vocabulary - Token vocabulary. Omitted values use the flag set.
 * @returns `true` or `false` when the token is in the vocabulary; `undefined` when it is not.
 */
const parseBooleanEnvValue = (
  normalizedRaw: string,
  vocabulary: StrictEnvBooleanVocabulary | undefined,
): boolean | undefined => {
  const token = normalizedRaw.toLowerCase();
  const { trueTokens, falseTokens } = booleanTokenSet(vocabulary);
  if (trueTokens.includes(token)) {
    return true;
  }
  if (falseTokens.includes(token)) {
    return false;
  }
  return undefined;
};

/** Whether leading and trailing whitespace is removed before validation. */
type EnvWhitespace = 'trim' | 'preserve';

/**
 * Default whitespace handling per spec type.
 * Parsed types trim by default; strings preserve the raw value unless opted in.
 *
 * @param spec - Environment variable spec.
 * @returns `preserve` for strings, `trim` for every other spec.
 */
const defaultTrimForSpec = (spec: StrictEnvSpec): EnvWhitespace => {
  if (spec.type === 'string') {
    return 'preserve';
  }
  return 'trim';
};

/**
 * Normalizes a raw environment variable value before validation.
 *
 * @param raw - Raw value from `process.env`, if present.
 * @param whitespace - `trim` removes leading and trailing whitespace. `preserve` keeps the raw value.
 * @returns Normalized value, or `undefined` when unset.
 */
const normalizeEnvRaw = (raw: string | undefined, whitespace: EnvWhitespace): string | undefined => {
  if (raw == null) {
    return undefined;
  }
  if (whitespace === 'preserve') {
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
 * Maps the public `trim` option onto {@link EnvWhitespace}.
 * An omitted `trim` uses {@link defaultTrimForSpec}.
 *
 * @param spec - Environment variable spec.
 * @param options - Optional trim override from {@link StrictEnvOptions}.
 * @returns Whitespace mode for normalization.
 */
const whitespaceForOptions = <S extends StrictEnvSpec>(
  spec: S,
  options?: ParseEnvValueOptions<S>,
): EnvWhitespace => {
  if (options?.trim === true) {
    return 'trim';
  }
  if (options?.trim === false) {
    return 'preserve';
  }
  return defaultTrimForSpec(spec);
};

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
 * Boolean specs accept a closed, case-insensitive token set after normalization.
 * `vocabulary: 'flag'` (the default, including when omitted) accepts
 * `1`/`true`/`yes`/`on` as `true` and `0`/`false`/`no`/`off` as `false`.
 * `vocabulary: 'literal'` accepts only `true` and `false`.
 * Any other non-empty value fails with `kind: 'invalid_boolean'`.
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
  const normalizedRaw = normalizeEnvRaw(raw, whitespaceForOptions(spec, options));
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
    case 'boolean': {
      const parsed = parseBooleanEnvValue(normalizedRaw, spec.vocabulary);
      if (parsed === undefined) {
        const { trueTokens, falseTokens } = booleanTokenSet(spec.vocabulary);
        const choices = [...trueTokens, ...falseTokens].join(', ');
        throw new StrictEnvValidationError([{
          key,
          message: `Env ${key}: must be one of [${choices}], got "${raw}"`,
          raw,
          kind: 'invalid_boolean',
        }]);
      }
      return parsed as StrictEnvSpecToType<S>;
    }
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
