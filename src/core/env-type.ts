/**
 * Spec for a string environment variable.
 * Values are returned as-is unless `trim: true` is set in {@link StrictEnvOptions}
 * (whitespace-only values are then treated as missing).
 * Defaults belong in {@link StrictEnvOptions}, not on this spec.
 */
export type StrictEnvTypeString = { type: 'string' };

/**
 * Optional constraints for a numeric environment variable spec.
 * Used by {@link StrictEnvType.Number} when called as a factory, and by nested presets
 * such as {@link StrictEnvType.Number.Port} / {@link StrictEnvType.Number.PositiveInteger}.
 */
export type StrictEnvNumberConstraints = {
  /** Inclusive lower bound (`n >= min`). */
  min?: number;
  /** Inclusive upper bound (`n <= max`). */
  max?: number;
  /** Exclusive lower bound (`n > exclusiveMin`). */
  exclusiveMin?: number;
  /** Exclusive upper bound (`n < exclusiveMax`). */
  exclusiveMax?: number;
  /** When `true`, the value must be an integer (`Number.isInteger`). */
  integer?: boolean;
};

/**
 * Spec for a numeric environment variable.
 * Values are parsed with `Number()`; `NaN`, `Infinity`, and `-Infinity` are rejected.
 * Optional {@link StrictEnvNumberConstraints} (`min`, `max`, `exclusiveMin`, `exclusiveMax`, `integer`)
 * narrow accepted values.
 * Defaults belong in {@link StrictEnvOptions}, not on this spec.
 */
export type StrictEnvTypeNumber = { type: 'number' } & StrictEnvNumberConstraints;

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

/** Inclusive lower bound for positive integers (`>= 1`). */
const MIN_POSITIVE_INTEGER = 1;

/** Inclusive upper bound for negative integers (`<= -1`). */
const MAX_NEGATIVE_INTEGER = -1;

/**
 * Sign boundary for Positive (`> 0`), Negative (`< 0`), and non-negative (`>= 0`) presets.
 */
const ZERO = 0;

/**
 * Inclusive lower TCP/UDP port (IANA). Port 0 means "any available" and is rejected.
 */
const MIN_PORT = MIN_POSITIVE_INTEGER;

/** Inclusive upper TCP/UDP port (IANA). */
const MAX_PORT = 65535;

/**
 * Builds a numeric env spec from optional constraints.
 *
 * @param constraints - Optional `min`, `max`, `exclusiveMin`, `exclusiveMax`, and/or `integer` bounds.
 * @returns Number spec for use with `resolve` or `resolves`.
 */
const createNumberSpec = (constraints?: StrictEnvNumberConstraints): StrictEnvTypeNumber => ({
  type: 'number',
  ...(constraints?.min !== undefined ? { min: constraints.min } : {}),
  ...(constraints?.max !== undefined ? { max: constraints.max } : {}),
  ...(constraints?.exclusiveMin !== undefined ? { exclusiveMin: constraints.exclusiveMin } : {}),
  ...(constraints?.exclusiveMax !== undefined ? { exclusiveMax: constraints.exclusiveMax } : {}),
  ...(constraints?.integer !== undefined ? { integer: constraints.integer } : {}),
});

/**
 * Named number presets nested under {@link StrictEnvType.Number}.
 * Each preset is sugar over {@link StrictEnvNumberConstraints}; parsing stays `type: 'number'`.
 */
type StrictEnvNumberPresets = {
  /** Any integer. Sugar for `Number({ integer: true })`. */
  Integer: StrictEnvTypeNumber;
  /** Integer `>= 1`. Sugar for `Number({ min: 1, integer: true })`. */
  PositiveInteger: StrictEnvTypeNumber;
  /** Integer `<= -1`. Sugar for `Number({ max: -1, integer: true })`. */
  NegativeInteger: StrictEnvTypeNumber;
  /** Integer `>= 0`. Sugar for `Number({ min: 0, integer: true })`. */
  NonNegativeInteger: StrictEnvTypeNumber;
  /** Finite number `> 0`. Sugar for `Number({ exclusiveMin: 0 })`. */
  Positive: StrictEnvTypeNumber;
  /** Finite number `< 0`. Sugar for `Number({ exclusiveMax: 0 })`. */
  Negative: StrictEnvTypeNumber;
  /** Finite number `>= 0`. Sugar for `Number({ min: 0 })`. */
  NonNegative: StrictEnvTypeNumber;
  /** TCP/UDP port `1`–`65535`. Sugar for `Number({ min: 1, max: 65535, integer: true })`. */
  Port: StrictEnvTypeNumber;
};

/**
 * Unconstrained finite-number spec, also callable as a factory for constrained specs.
 * Named presets hang off the same object (`Number.Port`, `Number.PositiveInteger`, …).
 *
 * @example
 * ```ts
 * StrictEnvType.Number
 * StrictEnvType.Number({ min: 0 })
 * StrictEnvType.Number({ exclusiveMin: 0 })
 * StrictEnvType.Number.Port
 * StrictEnvType.Number.PositiveInteger
 * ```
 */
type StrictEnvNumberSpecFactory = {
  (constraints?: StrictEnvNumberConstraints): StrictEnvTypeNumber;
} & StrictEnvTypeNumber & StrictEnvNumberPresets;

/**
 * Finite-number spec that is also a constraint factory and a holder of named presets.
 * Use as `Number`, `Number({ min, max, exclusiveMin, exclusiveMax, integer })`, or `Number.Port`.
 */
const NumberSpec: StrictEnvNumberSpecFactory = Object.assign(
  (constraints?: StrictEnvNumberConstraints): StrictEnvTypeNumber => createNumberSpec(constraints),
  { type: 'number' } as const satisfies StrictEnvTypeNumber,
  {
    Integer: createNumberSpec({ integer: true }),
    PositiveInteger: createNumberSpec({ min: MIN_POSITIVE_INTEGER, integer: true }),
    NegativeInteger: createNumberSpec({ max: MAX_NEGATIVE_INTEGER, integer: true }),
    NonNegativeInteger: createNumberSpec({ min: ZERO, integer: true }),

    Positive: createNumberSpec({ exclusiveMin: ZERO }),
    Negative: createNumberSpec({ exclusiveMax: ZERO }),
    NonNegative: createNumberSpec({ min: ZERO }),

    Port: createNumberSpec({ min: MIN_PORT, max: MAX_PORT, integer: true }),
  } as const satisfies StrictEnvNumberPresets,
);

/**
 * Predefined spec constants for use with `resolve` or as schema values in `resolves`.
 * Specs describe type only; provide `default` / `trim` via {@link StrictEnvOptions}
 * (third argument of `resolve`, or a `[spec, options]` tuple in `resolves`).
 */
export const StrictEnvType = {
  /** Spec for a string value (returned as-is unless `trim: true` is set in options). */
  String: { type: 'string' } as const satisfies StrictEnvTypeString,
  /**
   * Spec for a finite numeric value (`Number()` parsing; rejects `NaN` and `Infinity`).
   * Use as `StrictEnvType.Number`, call as `StrictEnvType.Number({ min, max, exclusiveMin, exclusiveMax, integer })`,
   * or use a nested preset such as `StrictEnvType.Number.Port`.
   */
  Number: NumberSpec,
  /** Spec for a boolean value (`1`/`true`/`yes`/`on` → `true`; other non-empty values → `false`). */
  Boolean: { type: 'boolean' } as const satisfies StrictEnvTypeBoolean,
  /**
   * Returns a spec that restricts the value to one of the given choices.
   *
   * @param choices - Allowed string literals.
   * @returns Enum spec for use with `resolve` or `resolves`.
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
 * Used as the third argument to `resolve` or as the second element of a `[spec, options]` tuple in `resolves`.
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
