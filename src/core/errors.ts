/**
 * Discriminated union of error kinds emitted during environment variable parsing.
 *
 * - `missing` — Variable unset, empty string, or whitespace-only (when trim is enabled) without a default.
 * - `invalid_number` — Value is not a finite number, not an integer when required, or outside
 *   `min` / `max` / `exclusiveMin` / `exclusiveMax` (see {@link StrictEnvTypeNumber}).
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
  override readonly name: string = 'StrictEnvError';

  /**
   * @param message - Error message.
   */
  protected constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, StrictEnvError.prototype);
  }
}

/**
 * Validation error that carries one or more environment variable issues.
 *
 * Thrown by `StrictEnvResolver.resolve()` (single-entry `errors`) and
 * `StrictEnvResolver.resolves()` (multi-entry `errors`).
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

  override readonly name: string = 'StrictEnvValidationError';

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
    Object.setPrototypeOf(this, StrictEnvValidationError.prototype);
    this.errors = errors;
    this.keys = errors.map((e) => e.key);
  }
}
