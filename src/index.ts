/**
 * Spec for a string environment variable.
 * Values are returned as-is unless `trim: true` is set in {@link StrictEnvOptions}
 * (whitespace-only values are then treated as missing).
 * Defaults belong in {@link StrictEnvOptions}, not on this spec.
 */
export type StrictEnvTypeString = { type: 'string' };

/**
 * Optional constraints for a numeric environment variable spec.
 * Used by {@link StrictEnvType.Number} when called as a factory, and by sugar specs
 * such as {@link StrictEnvType.PositiveInt} / {@link StrictEnvType.NegativeInt}.
 */
export type StrictEnvNumberConstraints = {
  /** Inclusive lower bound. */
  min?: number;
  /** Inclusive upper bound. */
  max?: number;
  /** When `true`, the value must be an integer (`Number.isInteger`). */
  integer?: boolean;
};

/**
 * Spec for a numeric environment variable.
 * Values are parsed with `Number()`; `NaN`, `Infinity`, and `-Infinity` are rejected.
 * Optional {@link StrictEnvNumberConstraints} (`min`, `max`, `integer`) narrow accepted values.
 * Defaults belong in {@link StrictEnvOptions}, not on this spec.
 */
export type StrictEnvTypeNumber = { type: 'number' } & StrictEnvNumberConstraints;

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
 * Spec for a boolean environment variable.
 * Parses `1`, `true`, `yes`, `on` (case-insensitive, after normalization) as `true`;
 * any other non-empty value as `false`.
 * Trims leading/trailing whitespace by default (see {@link StrictEnvOptions.trim}).
 * Defaults belong in {@link StrictEnvOptions}, not on this spec.
 */
export type StrictEnvTypeBoolean = { type: 'boolean' };

/**
 * Spec for an enum environment variable with a fixed set of choices.
 * The value must be one of `choices` (compared after normalization); otherwise validation fails.
 * Trims leading/trailing whitespace by default (see {@link StrictEnvOptions.trim}).
 * Defaults belong in {@link StrictEnvOptions}, not on this spec.
 *
 * @template T - Literal string union of allowed values.
 */
export type StrictEnvTypeEnum<T extends string = string> = { type: 'enum'; choices: readonly T[] };

/** Union of all environment variable spec types. */
export type StrictEnvSpec =
  | StrictEnvTypeString
  | StrictEnvTypeNumber
  | StrictEnvTypeBoolean
  | StrictEnvTypeEnum;

/**
 * Discriminated union of error kinds emitted during environment variable parsing.
 *
 * - `missing` — Variable unset, empty string, or whitespace-only (when trim is enabled) without a default.
 * - `invalid_number` — Value is not a finite number, not an integer when required, or outside `min`/`max`
 *   (see {@link StrictEnvTypeNumber}).
 * - `invalid_enum` — Value is not one of the allowed enum choices.
 */
export type StrictEnvErrorKind = 'missing' | 'invalid_number' | 'invalid_enum';

/**
 * A structured validation error entry for a single environment variable.
 *
 * @template K - Environment variable key type.
 */
export type StrictEnvValidationEntry<K extends string = string> = {
  /** Environment variable name. */
  key: K;
  /** Human-readable error message. */
  message: string;
  /** Raw value from `process.env`, if present. */
  raw?: string;
  /** Error category for programmatic handling. */
  kind: StrictEnvErrorKind;
};

/**
 * Base error class for this package.
 *
 * @example
 * ```ts
 * try {
 *   StrictEnvResolver.resolve('PORT', StrictEnvType.Number);
 * } catch (e) {
 *   if (e instanceof StrictEnvError) {
 *     // Handle all strict-env-resolver errors
 *   }
 * }
 * ```
 */
export abstract class StrictEnvError extends Error {
  /**
   * @param message - Error message.
   */
  protected constructor(message: string) {
    super(message);
    this.name = 'StrictEnvError';
  }
}

/**
 * Validation error that carries one or more environment variable issues.
 *
 * Thrown by `StrictEnvResolver.resolve()` (single-entry `errors`) and
 * `StrictEnvResolver.resolveAll()` (multi-entry `errors`).
 * Individual entries are produced by the internal `parseEnvValue` helper.
 *
 * @template K - Union of environment variable keys included in `errors`.
 */
export class StrictEnvValidationError<K extends string = string> extends StrictEnvError {
  /**
   * Formats validation errors into a human-readable error message.
   *
   * @template K - Environment variable key type.
   * @param errors - Validation error entries to format.
   * @returns Multi-line summary listing each key and message.
   */
  public static format<K extends string>(errors: readonly StrictEnvValidationEntry<K>[]): string {
    const lines = errors.map((e) => `- ${e.key}: ${e.message}${e.raw == null ? '' : ` (raw="${e.raw}")`}`);
    return `Invalid environment variables (${errors.length}):\n${lines.join('\n')}`;
  }

  /**
   * Structured list of validation errors.
   */
  public readonly errors: readonly StrictEnvValidationEntry<K>[];
  /**
   * Convenience list of keys included in `errors`.
   */
  public readonly keys: readonly K[];

  /**
   * Creates a new validation error from one or more `StrictEnvValidationEntry` entries.
   *
   * @param errors - One or more structured validation errors.
   */
  public constructor(errors: readonly StrictEnvValidationEntry<K>[]) {
    const msg = StrictEnvValidationError.format(errors);
    super(msg);
    this.name = 'StrictEnvValidationError';
    this.errors = errors;
    this.keys = errors.map((e) => e.key);
  }
}

/**
 * Builds a numeric env spec from optional constraints.
 *
 * @param constraints - Optional `min`, `max`, and/or `integer` bounds.
 * @returns Number spec for use with `resolve` or `resolveAll`.
 */
const createNumberSpec = (constraints?: StrictEnvNumberConstraints): StrictEnvTypeNumber => ({
  type: 'number',
  ...(constraints?.min !== undefined ? { min: constraints.min } : {}),
  ...(constraints?.max !== undefined ? { max: constraints.max } : {}),
  ...(constraints?.integer !== undefined ? { integer: constraints.integer } : {}),
});

/**
 * Unconstrained finite-number spec, also callable as a factory for constrained specs.
 *
 * @example
 * ```ts
 * StrictEnvType.Number
 * StrictEnvType.Number({ min: 0 })
 * StrictEnvType.Number({ min: 1, max: 65535, integer: true })
 * ```
 */
type StrictEnvNumberSpecFactory = {
  (constraints?: StrictEnvNumberConstraints): StrictEnvTypeNumber;
} & StrictEnvTypeNumber;

const NumberSpec: StrictEnvNumberSpecFactory = Object.assign(
  (constraints?: StrictEnvNumberConstraints): StrictEnvTypeNumber => createNumberSpec(constraints),
  { type: 'number' } as const satisfies StrictEnvTypeNumber,
);

/**
 * Predefined spec constants for use with `resolve` or as schema values in `resolveAll`.
 * Specs describe type only; provide `default` / `trim` via {@link StrictEnvOptions}
 * (third argument of `resolve`, or a `[spec, options]` tuple in `resolveAll`).
 */
export const StrictEnvType = {
  /** Spec for a string value (returned as-is unless `trim: true` is set in options). */
  String: { type: 'string' } as const satisfies StrictEnvTypeString,
  /**
   * Spec for a finite numeric value (`Number()` parsing; rejects `NaN` and `Infinity`).
   * Use as `StrictEnvType.Number`, or call as `StrictEnvType.Number({ min, max, integer })`.
   */
  Number: NumberSpec,
  /**
   * Spec for a positive integer (`>= 1`). Sugar for `Number({ min: 1, integer: true })`.
   */
  PositiveInt: createNumberSpec({ min: 1, integer: true }),
  /**
   * Spec for a negative integer (`<= -1`). Sugar for `Number({ max: -1, integer: true })`.
   */
  NegativeInt: createNumberSpec({ max: -1, integer: true }),
  /** Spec for a boolean value (`1`/`true`/`yes`/`on` → `true`; other non-empty values → `false`). */
  Boolean: { type: 'boolean' } as const satisfies StrictEnvTypeBoolean,
  /**
   * Returns a spec that restricts the value to one of the given choices.
   *
   * @param choices - Allowed string literals.
   * @returns Enum spec for use with `resolve` or `resolveAll`.
   */
  Enum: <T extends string>(choices: readonly T[]) => ({ type: 'enum', choices }) as StrictEnvTypeEnum<T>,
} as const;

/**
 * Infers the return type from the given spec.
 * @template S - A `StrictEnvSpec` variant.
 */
export type StrictEnvSpecToType<S> =
  S extends StrictEnvTypeString ? string
    : S extends StrictEnvTypeNumber ? number
      : S extends StrictEnvTypeBoolean ? boolean
        : S extends StrictEnvTypeEnum<infer T> ? T
          : never;

/**
 * Options for reading an environment variable with an optional default.
 * Used as the third argument to `resolve` or as the second element of a `[spec, options]` tuple in `resolveAll`.
 *
 * `trim` defaults to `true` for `number`, `boolean`, and `enum` specs (whitespace-only values are
 * treated as missing). For `string` specs it defaults to `false` (values are returned as-is).
 *
 * @template S - Environment variable spec type.
 */
export type StrictEnvOptions<S extends StrictEnvSpec> = {
  /** Fallback when the variable is unset, empty (`""`), or whitespace-only (when `trim` is enabled). */
  default?: StrictEnvSpecToType<S>;
  /** When `true`, trims leading/trailing whitespace before validation. */
  trim?: boolean;
};

/**
 * Schema entry for a single env var.
 *
 * Either a spec alone, or a `[spec, options]` tuple to attach {@link StrictEnvOptions}
 * (for example `default` and/or `trim`).
 */
export type StrictEnvSchemaEntry<S extends StrictEnvSpec = StrictEnvSpec> = S | readonly [S, StrictEnvOptions<S>];

/**
 * Schema object used by `resolveAll()`.
 *
 * Keys are env var names; values are specs or `[spec, options]` tuples.
 */
export type StrictEnvSchema = Record<string, StrictEnvSchemaEntry>;

/**
 * Extracts the spec type from a schema entry or `[spec, options]` tuple.
 *
 * @template E - Schema entry type.
 */
type StrictEnvSchemaEntryToSpec<E> = E extends readonly [infer S, unknown] ? S : E;

/**
 * Maps a schema object to the resulting parsed environment object type.
 *
 * @template TSchema - Schema object type passed to `resolveAll`.
 */
export type StrictEnvSchemaToType<TSchema extends StrictEnvSchema> = {
  [K in keyof TSchema]: StrictEnvSpecToType<StrictEnvSchemaEntryToSpec<TSchema[K]> & StrictEnvSpec>;
};

/**
 * Discriminated result of parsing a single environment variable.
 *
 * On success, `value` holds the parsed result. On failure, `error` holds a structured
 * `StrictEnvValidationEntry` entry (never throws).
 *
 * @template K - Environment variable key type.
 * @template S - Environment variable spec type.
 */
type ParseEnvValueResult<K extends string, S extends StrictEnvSpec> =
  | { ok: true; value: StrictEnvSpecToType<S> }
  | { ok: false; error: StrictEnvValidationEntry<K> };

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
 * @param constraints - Optional `min`, `max`, and/or `integer` constraints.
 * @returns `undefined` when valid; otherwise a structured validation error.
 */
const validateNumberConstraints = <K extends string>(
  key: K,
  raw: string | undefined,
  n: number,
  constraints: StrictEnvNumberConstraints,
): StrictEnvValidationEntry<K> | undefined => {
  if (constraints.integer === true && !Number.isInteger(n)) {
    return { key, message: `Env ${key}: expected integer, got "${raw}"`, raw, kind: 'invalid_number' };
  }
  if (constraints.min !== undefined && n < constraints.min) {
    return {
      key,
      message: `Env ${key}: must be >= ${constraints.min}, got ${n}`,
      raw,
      kind: 'invalid_number',
    };
  }
  if (constraints.max !== undefined && n > constraints.max) {
    return {
      key,
      message: `Env ${key}: must be <= ${constraints.max}, got ${n}`,
      raw,
      kind: 'invalid_number',
    };
  }
  return undefined;
};

/** Options accepted by `parseEnvValue` (subset of `StrictEnvOptions`). */
type ParseEnvValueOptions<S extends StrictEnvSpec> = Pick<StrictEnvOptions<S>, 'trim'>;

/**
 * Resolves a schema entry into its spec and optional per-key options.
 *
 * @param entry - Schema entry or `[spec, options]` tuple.
 * @returns Parsed spec and options for `resolveAll`.
 */
const resolveSchemaEntry = (
  entry: StrictEnvSchemaEntry,
): { spec: StrictEnvSpec; options: StrictEnvOptions<StrictEnvSpec> | undefined } => ({
  spec: (Array.isArray(entry) ? entry[0] : entry) as StrictEnvSpec,
  options: (Array.isArray(entry) ? entry[1] : undefined) as StrictEnvOptions<StrictEnvSpec> | undefined,
});

/**
 * Parses a single environment variable according to the given spec.
 *
 * Central validation helper shared by `resolve` and `resolveAll`. Does not throw;
 * callers decide whether to throw immediately or collect errors.
 *
 * Missing or empty (`""`) values use `defaultValue` when provided. When `trim` is enabled,
 * whitespace-only values are treated as empty. Number specs delegate to `parseNumber`, then
 * optional `min` / `max` / `integer` constraints (see {@link StrictEnvNumberConstraints}).
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
 * @returns Parsed value or a structured validation error.
 */
const parseEnvValue = <K extends string, S extends StrictEnvSpec>(
  key: K,
  spec: S,
  raw: string | undefined,
  defaultValue: StrictEnvSpecToType<S> | undefined,
  options?: ParseEnvValueOptions<S>,
): ParseEnvValueResult<K, S> => {
  const trim = options?.trim ?? defaultTrimForSpec(spec);
  const normalizedRaw = normalizeEnvRaw(raw, trim);
  const hasDefault = defaultValue !== undefined;

  if (normalizedRaw == null || normalizedRaw === '') {
    if (hasDefault) {
      return { ok: true, value: defaultValue as StrictEnvSpecToType<S> };
    }
    return {
      ok: false,
      error: { key, message: `Missing required environment variable: ${key}`, raw, kind: 'missing' },
    };
  }

  switch (spec.type) {
    case 'number': {
      const n = parseNumber(normalizedRaw);
      if (n === undefined) {
        return {
          ok: false,
          error: { key, message: `Env ${key}: expected number, got "${raw}"`, raw, kind: 'invalid_number' },
        };
      }
      const constraintError = validateNumberConstraints(key, raw, n, spec);
      if (constraintError !== undefined) {
        return { ok: false, error: constraintError };
      }
      return { ok: true, value: n as StrictEnvSpecToType<S> };
    }
    case 'boolean':
      return { ok: true, value: parseBooleanEnvValue(normalizedRaw) as StrictEnvSpecToType<S> };
    case 'enum':
      if (!spec.choices.includes(normalizedRaw)) {
        return {
          ok: false,
          error: {
            key,
            message: `Env ${key}: must be one of [${spec.choices.join(', ')}]`,
            raw,
            kind: 'invalid_enum',
          },
        };
      }
      return { ok: true, value: normalizedRaw as StrictEnvSpecToType<S> };
    default:
      return { ok: true, value: normalizedRaw as StrictEnvSpecToType<S> };
  }
};

/**
 * Reads and parses an environment variable according to the given spec.
 *
 * Delegates validation to `parseEnvValue`. Missing or empty (`""`) values use
 * `options.default` when provided; otherwise a `StrictEnvValidationError` is thrown.
 * Whitespace-only values are treated as missing when `trim` is enabled.
 * For `StrictEnvType.Number`, values are parsed as finite numbers (see {@link StrictEnvTypeNumber}).
 *
 * @template K - Environment variable key type.
 * @template S - Environment variable spec type.
 * @param key - Environment variable name (e.g. `"PORT"`, `"NODE_ENV"`).
 * @param spec - Type spec; defaults to `StrictEnvType.String` when omitted.
 * @param options - Optional `{ default, trim }`; see {@link StrictEnvOptions}.
 * @returns Parsed value with type inferred from `spec`.
 * @throws {StrictEnvValidationError} When the variable is missing, empty without a default,
 *   whitespace-only without a default (when trimming), or invalid for the spec.
 */
const resolve = <K extends string, S extends StrictEnvSpec = StrictEnvTypeString>(
  key: K,
  spec: S = StrictEnvType.String as S,
  options?: StrictEnvOptions<S>,
): StrictEnvSpecToType<S> => {
  const result = parseEnvValue(key, spec, process.env[key], options?.default, options);
  if (!result.ok) {
    throw new StrictEnvValidationError([result.error]);
  }
  return result.value;
};

/**
 * Reads and parses multiple environment variables according to the given schema.
 *
 * Always evaluates every key in `schema`. Each entry is validated via `parseEnvValue`;
 * all errors are collected and thrown once in a single `StrictEnvValidationError`.
 * Number specs use the same finite-number rules as `resolve`.
 *
 * @template TSchema - Schema object type.
 * @param schema - Map of environment variable names to specs or `[spec, options]` tuples
 *   (see {@link StrictEnvOptions} for per-key `default` / `trim`).
 * @returns Parsed environment object with types inferred from the schema.
 * @throws {StrictEnvValidationError} When one or more variables are missing, empty without a default,
 *   whitespace-only without a default (when trimming), or invalid.
 */
const resolveAll = <TSchema extends StrictEnvSchema>(schema: TSchema): StrictEnvSchemaToType<TSchema> => {
  const envs: Partial<StrictEnvSchemaToType<TSchema>> = {};
  const errors: StrictEnvValidationEntry<Extract<keyof TSchema, string>>[] = [];

  for (const key of Object.keys(schema) as Array<Extract<keyof TSchema, string>>) {
    const { spec, options } = resolveSchemaEntry(schema[key]);

    const result = parseEnvValue(key, spec, process.env[key], options?.default, options);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    envs[key] = result.value as StrictEnvSchemaToType<TSchema>[typeof key];
  }

  if (errors.length > 0) throw new StrictEnvValidationError(errors);
  return envs as StrictEnvSchemaToType<TSchema>;
};

/**
 * Type-safe environment variable resolver for Node.js `process.env`.
 *
 * @example
 * ```ts
 * const port = StrictEnvResolver.resolve('PORT', StrictEnvType.PositiveInt);
 * const envs = StrictEnvResolver.resolveAll({
 *   PORT: StrictEnvType.PositiveInt,
 *   DEBUG: [StrictEnvType.Boolean, { default: false }],
 * });
 * ```
 */
export const StrictEnvResolver = {
  /** Reads and parses a single environment variable. See {@link resolve}. */
  resolve,
  /** Reads and parses multiple environment variables in one pass. See {@link resolveAll}. */
  resolveAll,
} as const;
