import {
  StrictEnvType,
  type StrictEnvOptions,
  type StrictEnvSpec,
  type StrictEnvSpecToType,
  type StrictEnvTypeString,
} from './core/env-type';
import { StrictEnvValidationError, type StrictEnvValidationEntry } from './core/errors';
import { parseEnvValue } from './core/parse';

export type {
  StrictEnvNumberConstraints,
  StrictEnvOptions,
  StrictEnvSpec,
  StrictEnvSpecToType,
  StrictEnvTypeBoolean,
  StrictEnvTypeEnum,
  StrictEnvTypeNumber,
  StrictEnvTypeString,
} from './core/env-type';

export { StrictEnvType } from './core/env-type';

/**
 * Schema entry for a single env var.
 *
 * Either a spec alone, or a `[spec, options]` tuple to attach {@link StrictEnvOptions}
 * (for example `default` and/or `trim`).
 */
export type StrictEnvSchemaEntry<S extends StrictEnvSpec = StrictEnvSpec> = S | readonly [S, StrictEnvOptions<S>];

/**
 * Schema object used by `resolves()`.
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
 * @template TSchema - Schema object type passed to `resolves`.
 */
export type StrictEnvSchemaToType<TSchema extends StrictEnvSchema> = {
  [K in keyof TSchema]: StrictEnvSpecToType<StrictEnvSchemaEntryToSpec<TSchema[K]> & StrictEnvSpec>;
};

/**
 * Resolves a schema entry into its spec and optional per-key options.
 *
 * @param entry - Schema entry or `[spec, options]` tuple.
 * @returns Parsed spec and options for `resolves`.
 */
const resolveSchemaEntry = (
  entry: StrictEnvSchemaEntry,
): { spec: StrictEnvSpec; options: StrictEnvOptions<StrictEnvSpec> | undefined } => ({
  spec: (Array.isArray(entry) ? entry[0] : entry) as StrictEnvSpec,
  options: (Array.isArray(entry) ? entry[1] : undefined) as StrictEnvOptions<StrictEnvSpec> | undefined,
});

/**
 * Narrows a caught exception to {@link StrictEnvValidationError}.
 *
 * `catch` erases the key type parameter. Callers pass the schema key so collected
 * entries stay typed as that key. Runtime check is `instanceof` only.
 *
 * @template K - Environment variable key type.
 * @param error - Caught exception.
 * @returns Whether `error` is a validation error for `K`.
 */
const isSchemaValidationError = <K extends string>(
  error: unknown,
): error is StrictEnvValidationError<K> => error instanceof StrictEnvValidationError;

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
): StrictEnvSpecToType<S> => parseEnvValue(key, spec, process.env[key], options?.default, options);

/**
 * Reads and parses multiple environment variables according to the given schema.
 *
 * Always evaluates every key in `schema`. Each entry is validated via `parseEnvValue`;
 * validation errors are collected and thrown once in a single `StrictEnvValidationError`.
 * Number specs use the same finite-number rules as `resolve`.
 *
 * @template TSchema - Schema object type.
 * @param schema - Map of environment variable names to specs or `[spec, options]` tuples
 *   (see {@link StrictEnvOptions} for per-key `default` / `trim`).
 * @returns Parsed environment object with types inferred from the schema.
 * @throws {StrictEnvValidationError} When one or more variables are missing, empty without a default,
 *   whitespace-only without a default (when trimming), or invalid.
 */
const resolves = <TSchema extends StrictEnvSchema>(schema: TSchema): StrictEnvSchemaToType<TSchema> => {
  const envs: Partial<StrictEnvSchemaToType<TSchema>> = {};
  const errors: StrictEnvValidationEntry<Extract<keyof TSchema, string>>[] = [];

  for (const key of Object.keys(schema) as Array<Extract<keyof TSchema, string>>) {
    const { spec, options } = resolveSchemaEntry(schema[key]);

    // Evaluate every key. Validation failures are collected and thrown once after the loop.
    try {
      const value = parseEnvValue(key, spec, process.env[key], options?.default, options);
      envs[key] = value as StrictEnvSchemaToType<TSchema>[typeof key];
    } catch (error) {
      if (!isSchemaValidationError<Extract<keyof TSchema, string>>(error)) {
        throw error;
      }
      errors.push(...error.errors);
    }
  }

  if (errors.length > 0) {
    throw new StrictEnvValidationError(errors);
  }
  return envs as StrictEnvSchemaToType<TSchema>;
};

/**
 * Type-safe environment variable resolver for Node.js `process.env`.
 *
 * @example
 * ```ts
 * const port = StrictEnvResolver.resolve('PORT', StrictEnvType.Number.Port);
 * const envs = StrictEnvResolver.resolves({
 *   PORT: StrictEnvType.Number.Port,
 *   DEBUG: [StrictEnvType.Boolean, { default: false }],
 * });
 * ```
 */
export const StrictEnvResolver = {
  /** Reads and parses a single environment variable. See {@link resolve}. */
  resolve,
  /** Reads and parses multiple environment variables in one pass. See {@link resolves}. */
  resolves,
} as const;
