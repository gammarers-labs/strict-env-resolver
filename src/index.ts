/**
 * Spec for a string environment variable.
 * Returned as-is by default (`trim` defaults to `false`). Set `trim: true` in options to trim
 * whitespace and treat whitespace-only values as missing.
 * The default value is passed via the third argument of `getEnv` or a `[spec, options]` tuple in `getEnvs`, not in the spec.
 */
export type SafeEnvTypeString = { type: 'string'; default?: string };

/**
 * Spec for a numeric environment variable.
 * Values must be decimal integers (optional leading `-`); whitespace-only, hex,
 * `Infinity`, `NaN`, and non-integer forms are rejected.
 * The default value is passed via the third argument of `getEnv` or a `[spec, options]` tuple in `getEnvs`, not in the spec.
 */
export type SafeEnvTypeNumber = { type: 'number'; default?: number };

/**
 * Pattern for strict decimal integer env values.
 * Allows an optional leading `-` followed by one or more digits.
 * Rejects hex (`0x…`), floats, exponents, `Infinity`, `NaN`, and signs other than leading `-`.
 */
const STRICT_INTEGER_PATTERN = /^-?\d+$/;

/**
 * Pattern for boolean env values that parse as `true`.
 * Matches `1`, `true`, `yes`, and `on` (case-insensitive) on the full trimmed string.
 */
const TRUE_BOOLEAN_PATTERN = /^(1|true|yes|on)$/i;

/**
 * Parses a string as a finite decimal integer for environment variables.
 *
 * Trims leading and trailing whitespace before validation. Whitespace-only input is invalid.
 *
 * @param raw - Raw environment variable value.
 * @returns Parsed integer, or `undefined` when the value is not a valid decimal integer.
 */
const parseStrictInteger = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (trimmed === '' || !STRICT_INTEGER_PATTERN.test(trimmed)) {
    return undefined;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return undefined;
  }
  return n;
};

/**
 * Parses a trimmed string as a boolean environment variable value.
 *
 * @param normalizedRaw - Trimmed raw environment variable value.
 * @returns `true` for `1`/`true`/`yes`/`on` (case-insensitive); otherwise `false`.
 */
const parseBooleanEnvValue = (normalizedRaw: string): boolean => TRUE_BOOLEAN_PATTERN.test(normalizedRaw);

/**
 * Spec for a boolean environment variable.
 * Parses `1`, `true`, `yes`, `on` (case-insensitive, after trim) as `true`; any other non-empty value as `false`.
 * Trims leading/trailing whitespace by default (see `SafeGetEnvOptions.trim`).
 * The default value is passed via the third argument of `getEnv` or a `[spec, options]` tuple in `getEnvs`, not in the spec.
 */
export type SafeEnvTypeBoolean = { type: 'boolean'; default?: boolean };

/**
 * Spec for an enum environment variable with a fixed set of choices.
 * The value must be one of `choices` (compared after trim); otherwise validation fails.
 * Trims leading/trailing whitespace by default (see `SafeGetEnvOptions.trim`).
 * The default value is passed via the third argument of `getEnv` or a `[spec, options]` tuple in `getEnvs`, not in the spec.
 *
 * @template T - Literal string union of allowed values.
 */
export type SafeEnvTypeEnum<T extends string = string> = { type: 'enum'; choices: readonly T[]; default?: T };

/** Union of all environment variable spec types. */
export type SafeEnvSpec =
  | SafeEnvTypeString
  | SafeEnvTypeNumber
  | SafeEnvTypeBoolean
  | SafeEnvTypeEnum;

/**
 * Discriminated union of error kinds emitted during environment variable parsing.
 *
 * - `missing` — Variable unset, empty string, or whitespace-only (when trim is enabled) without a default.
 * - `invalid_number` — Value is not a strict decimal integer (see `SafeEnvTypeNumber`).
 * - `invalid_enum` — Value is not one of the allowed enum choices.
 */
export type SafeEnvErrorKind = 'missing' | 'invalid_number' | 'invalid_enum';

/**
 * A structured validation error entry for a single environment variable.
 *
 * @template K - Environment variable key type.
 */
export type SafeEnvError<K extends string = string> = {
  /** Environment variable name. */
  key: K;
  /** Human-readable error message. */
  message: string;
  /** Raw value from `process.env`, if present. */
  raw?: string;
  /** Error category for programmatic handling. */
  kind: SafeEnvErrorKind;
};

/**
 * Base error class for this package.
 *
 * @example
 * ```ts
 * try {
 *   SafeEnvGetter.getEnv('PORT', SafeEnvType.Number);
 * } catch (e) {
 *   if (e instanceof SafeEnvGetterError) {
 *     // Handle all safe-env-getter errors
 *   }
 * }
 * ```
 */
export abstract class SafeEnvGetterError extends Error {
  /**
   * @param message - Error message.
   */
  protected constructor(message: string) {
    super(message);
    this.name = 'SafeEnvGetterError';
  }
}

/**
 * Validation error that carries one or more environment variable issues.
 *
 * Thrown by `SafeEnvGetter.getEnv()` (single-entry `errors`) and
 * `SafeEnvGetter.getEnvs()` (multi-entry `errors`).
 * Individual entries are produced by the internal `parseEnvValue` helper.
 *
 * @template K - Union of environment variable keys included in `errors`.
 */
export class SafeEnvGetterValidationError<K extends string = string> extends SafeEnvGetterError {
  /**
   * Formats validation errors into a human-readable error message.
   *
   * @template K - Environment variable key type.
   * @param errors - Validation error entries to format.
   * @returns Multi-line summary listing each key and message.
   */
  public static format<K extends string>(errors: readonly SafeEnvError<K>[]): string {
    const lines = errors.map((e) => `- ${e.key}: ${e.message}${e.raw == null ? '' : ` (raw="${e.raw}")`}`);
    return `Invalid environment variables (${errors.length}):\n${lines.join('\n')}`;
  }

  /**
   * Structured list of validation errors.
   */
  public readonly errors: readonly SafeEnvError<K>[];
  /**
   * Convenience list of keys included in `errors`.
   */
  public readonly keys: readonly K[];

  /**
   * Creates a new validation error from one or more `SafeEnvError` entries.
   *
   * @param errors - One or more structured validation errors.
   */
  public constructor(errors: readonly SafeEnvError<K>[]) {
    const msg = SafeEnvGetterValidationError.format(errors);
    super(msg);
    this.name = 'SafeEnvGetterValidationError';
    this.errors = errors;
    this.keys = errors.map((e) => e.key);
  }
}

/**
 * Predefined spec constants for use with `getEnv` or as schema values in `getEnvs`.
 * Provide defaults via the third argument of `getEnv` or a `[spec, { default }]` tuple in `getEnvs`.
 */
export const SafeEnvType = {
  /** Spec for a string value (returned as-is unless `trim: true` is set in options). */
  String: { type: 'string' } as const satisfies SafeEnvTypeString,
  /**
   * Spec for a strict decimal integer.
   * Rejects whitespace-only, hex, `Infinity`, `NaN`, and non-integer forms.
   */
  Number: { type: 'number' } as const satisfies SafeEnvTypeNumber,
  /** Spec for a boolean value (`1`/`true`/`yes`/`on` → `true`; other non-empty values → `false`). */
  Boolean: { type: 'boolean' } as const satisfies SafeEnvTypeBoolean,
  /**
   * Returns a spec that restricts the value to one of the given choices.
   *
   * @param choices - Allowed string literals.
   * @returns Enum spec for use with `getEnv` or `getEnvs`.
   */
  Enum: <T extends string>(choices: readonly T[]) => ({ type: 'enum', choices }) as SafeEnvTypeEnum<T>,
} as const;

/**
 * Infers the return type from the given spec.
 * @template S - A `SafeEnvSpec` variant.
 */
export type SafeEnvSpecToType<S> =
  S extends SafeEnvTypeString ? string
    : S extends SafeEnvTypeNumber ? number
      : S extends SafeEnvTypeBoolean ? boolean
        : S extends SafeEnvTypeEnum<infer T> ? T
          : never;

/**
 * Options for reading an environment variable with an optional default.
 * Used as the third argument to `getEnv` or as the second element of a `[spec, options]` tuple in `getEnvs`.
 *
 * `trim` defaults to `true` for `number`, `boolean`, and `enum` specs (whitespace-only values are
 * treated as missing). For `string` specs it defaults to `false` (values are returned as-is).
 *
 * @template S - Environment variable spec type.
 */
export type SafeGetEnvOptions<S extends SafeEnvSpec> = {
  default?: SafeEnvSpecToType<S>;
  /** When `true`, trims leading/trailing whitespace before validation. */
  trim?: boolean;
};

/**
 * Schema entry for a single env var.
 *
 * Either provide a spec directly, or a tuple of `[spec, options]` to attach a default.
 */
export type SafeEnvSchemaEntry<S extends SafeEnvSpec = SafeEnvSpec> = S | readonly [S, SafeGetEnvOptions<S>];

/**
 * Schema object used by `getEnvs()`.
 *
 * Keys are env var names, values are specs (optionally with defaults).
 */
export type SafeEnvSchema = Record<string, SafeEnvSchemaEntry>;

/**
 * Extracts the spec type from a schema entry or `[spec, options]` tuple.
 *
 * @template E - Schema entry type.
 */
type SafeEnvSchemaEntryToSpec<E> = E extends readonly [infer S, unknown] ? S : E;

/**
 * Maps a schema object to the resulting parsed environment object type.
 *
 * @template TSchema - Schema object type passed to `getEnvs`.
 */
export type SafeEnvSchemaToType<TSchema extends SafeEnvSchema> = {
  [K in keyof TSchema]: SafeEnvSpecToType<SafeEnvSchemaEntryToSpec<TSchema[K]> & SafeEnvSpec>;
};

/**
 * Discriminated result of parsing a single environment variable.
 *
 * On success, `value` holds the parsed result. On failure, `error` holds a structured
 * `SafeEnvError` entry (never throws).
 *
 * @template K - Environment variable key type.
 * @template S - Environment variable spec type.
 */
type ParseEnvValueResult<K extends string, S extends SafeEnvSpec> =
  | { ok: true; value: SafeEnvSpecToType<S> }
  | { ok: false; error: SafeEnvError<K> };

/**
 * Default trim behavior per spec type.
 * Parsed types trim by default; strings preserve the raw value unless opted in.
 *
 * @param spec - Environment variable spec.
 * @returns Whether leading/trailing whitespace should be trimmed before validation.
 */
const defaultTrimForSpec = (spec: SafeEnvSpec): boolean => spec.type !== 'string';

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

/** Options accepted by `parseEnvValue` (subset of `SafeGetEnvOptions`). */
type ParseEnvValueOptions<S extends SafeEnvSpec> = Pick<SafeGetEnvOptions<S>, 'trim'>;

/**
 * Resolves a schema entry into its spec and optional per-key options.
 *
 * @param entry - Schema entry or `[spec, options]` tuple.
 * @returns Parsed spec and options for `getEnvs`.
 */
const resolveSchemaEntry = (
  entry: SafeEnvSchemaEntry,
): { spec: SafeEnvSpec; options: SafeGetEnvOptions<SafeEnvSpec> | undefined } => ({
  spec: (Array.isArray(entry) ? entry[0] : entry) as SafeEnvSpec,
  options: (Array.isArray(entry) ? entry[1] : undefined) as SafeGetEnvOptions<SafeEnvSpec> | undefined,
});

/**
 * Parses a single environment variable according to the given spec.
 *
 * Central validation helper shared by `getEnv` and `getEnvs`. Does not throw;
 * callers decide whether to throw immediately or collect errors.
 *
 * Missing or empty (`""`) values use `defaultValue` when provided. When `trim` is enabled,
 * whitespace-only values are treated as empty. Number specs delegate to `parseStrictInteger`.
 * Boolean specs treat `1`/`true`/`yes`/`on` (case-insensitive, after trim) as `true`.
 * Enum specs require an exact match in `choices` (after trim).
 *
 * @template K - Environment variable key type.
 * @template S - Environment variable spec type.
 * @param key - Environment variable name.
 * @param spec - Type spec for the value.
 * @param raw - Raw value from `process.env`, if present.
 * @param defaultValue - Fallback when `raw` is missing or empty.
 * @param options - Optional trim override (`trim` defaults per spec type).
 * @returns Parsed value or a structured validation error.
 */
const parseEnvValue = <K extends string, S extends SafeEnvSpec>(
  key: K,
  spec: S,
  raw: string | undefined,
  defaultValue: SafeEnvSpecToType<S> | undefined,
  options?: ParseEnvValueOptions<S>,
): ParseEnvValueResult<K, S> => {
  const trim = options?.trim ?? defaultTrimForSpec(spec);
  const normalizedRaw = normalizeEnvRaw(raw, trim);
  const hasDefault = defaultValue !== undefined;

  if (normalizedRaw == null || normalizedRaw === '') {
    if (hasDefault) {
      return { ok: true, value: defaultValue as SafeEnvSpecToType<S> };
    }
    return {
      ok: false,
      error: { key, message: `Missing required environment variable: ${key}`, raw, kind: 'missing' },
    };
  }

  switch (spec.type) {
    case 'number': {
      const n = parseStrictInteger(normalizedRaw);
      if (n === undefined) {
        return {
          ok: false,
          error: { key, message: `Env ${key}: expected number, got "${raw}"`, raw, kind: 'invalid_number' },
        };
      }
      return { ok: true, value: n as SafeEnvSpecToType<S> };
    }
    case 'boolean':
      return { ok: true, value: parseBooleanEnvValue(normalizedRaw) as SafeEnvSpecToType<S> };
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
      return { ok: true, value: normalizedRaw as SafeEnvSpecToType<S> };
    default:
      return { ok: true, value: normalizedRaw as SafeEnvSpecToType<S> };
  }
};

/**
 * Reads and parses an environment variable according to the given spec.
 *
 * Delegates validation to `parseEnvValue`. Missing or empty (`""`) values use
 * `options.default` when provided; otherwise a `SafeEnvGetterValidationError` is thrown.
 * For `SafeEnvType.Number`, values are parsed as strict decimal integers (see `SafeEnvTypeNumber`).
 *
 * @template K - Environment variable key type.
 * @template S - Environment variable spec type.
 * @param key - Environment variable name (e.g. `"PORT"`, `"NODE_ENV"`).
 * @param spec - Type spec; defaults to `SafeEnvType.String` when omitted.
 * @param options - Optional `{ default, trim }`; see {@link SafeGetEnvOptions}.
 * @returns Parsed value with type inferred from `spec`.
 * @throws {SafeEnvGetterValidationError} When the variable is missing, empty without a default, or invalid for the spec.
 */
const getEnv = <K extends string, S extends SafeEnvSpec = SafeEnvTypeString>(
  key: K,
  spec: S = SafeEnvType.String as S,
  options?: SafeGetEnvOptions<S>,
): SafeEnvSpecToType<S> => {
  const result = parseEnvValue(key, spec, process.env[key], options?.default, options);
  if (!result.ok) {
    throw new SafeEnvGetterValidationError([result.error]);
  }
  return result.value;
};

/**
 * Reads and parses multiple environment variables according to the given schema.
 *
 * Always evaluates every key in `schema`. Each entry is validated via `parseEnvValue`;
 * all errors are collected and thrown once in a single `SafeEnvGetterValidationError`.
 * Number specs use the same strict decimal integer rules as `getEnv`.
 *
 * @template TSchema - Schema object type.
 * @param schema - Map of environment variable names to specs, optionally with per-key defaults via `[spec, { default }]`.
 * @returns Parsed environment object with types inferred from the schema.
 * @throws {SafeEnvGetterValidationError} When one or more variables are missing, empty without a default, or invalid.
 */
const getEnvs = <TSchema extends SafeEnvSchema>(schema: TSchema): SafeEnvSchemaToType<TSchema> => {
  const envs: Partial<SafeEnvSchemaToType<TSchema>> = {};
  const errors: SafeEnvError<Extract<keyof TSchema, string>>[] = [];

  for (const key of Object.keys(schema) as Array<Extract<keyof TSchema, string>>) {
    const { spec, options } = resolveSchemaEntry(schema[key]);

    const result = parseEnvValue(key, spec, process.env[key], options?.default, options);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    envs[key] = result.value as SafeEnvSchemaToType<TSchema>[typeof key];
  }

  if (errors.length > 0) throw new SafeEnvGetterValidationError(errors);
  return envs as SafeEnvSchemaToType<TSchema>;
};

/**
 * Type-safe environment variable getter for Node.js `process.env`.
 *
 * @example
 * ```ts
 * const port = SafeEnvGetter.getEnv('PORT', SafeEnvType.Number);
 * const envs = SafeEnvGetter.getEnvs({
 *   PORT: SafeEnvType.Number,
 *   DEBUG: [SafeEnvType.Boolean, { default: false }],
 * });
 * ```
 */
export const SafeEnvGetter = {
  /** Reads and parses a single environment variable. See {@link getEnv}. */
  getEnv,
  /** Reads and parses multiple environment variables in one pass. See {@link getEnvs}. */
  getEnvs,
} as const;