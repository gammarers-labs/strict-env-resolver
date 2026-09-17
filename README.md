# Strict Env Resolver

[![npm version](https://img.shields.io/npm/v/strict-env-resolver?style=flat-square)](https://www.npmjs.com/package/strict-env-resolver)
[![license](https://img.shields.io/npm/l/strict-env-resolver?style=flat-square)](https://www.npmjs.com/package/strict-env-resolver)
[![Node.js](https://img.shields.io/node/v/strict-env-resolver?style=flat-square)](https://www.npmjs.com/package/strict-env-resolver)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-labs/strict-env-resolver/build.yml?branch=main&label=build&style=flat-square)](https://github.com/gammarers-labs/strict-env-resolver/actions/workflows/build.yml)

Type-safe environment variable resolver for Node.js. Reads and parses `process.env` with specs (`string`, `number`, `boolean`, `enum`), optional defaults, configurable trimming, and structured validation errors when values are missing or invalid.

## Features

- **Typed specs**: `string`, `number`, `boolean`, and `enum` with TypeScript inference
- **Finite numbers**: `StrictEnvType.Number` accepts finite values and rejects `NaN` and `Infinity`
- **Number presets**: Nested specs such as `Number.Port`, `Number.Integer`, and `Number.PositiveInteger`
- **Optional defaults**: Fallback when a variable is unset, empty (`""`), or whitespace-only (when trimming is enabled)
- **Configurable trim**: `trim` defaults to `true` for parsed types and `false` for strings; override per variable
- **Batch parsing**: `resolveAll()` evaluates every key and throws once with all validation errors
- **Structured errors**: `StrictEnvValidationError` exposes `errors` (`key`, `message`, `raw`, `kind`) and `keys`
- **Boolean parsing**: `1`, `true`, `yes`, `on` (case-insensitive, after trim) → `true`; any other non-empty value → `false`
- **Enum constraint**: Values must match one of the allowed choices (compared after trim)

## How it works

`resolve` reads one `process.env` key, trims it when the spec says so, parses it, and returns a typed value or throws `StrictEnvValidationError`. `resolveAll` does the same for every key in a schema and throws once with every issue collected.

Unset, empty, and (when trimming) whitespace-only values use `options.default` when provided; otherwise they fail with `kind: 'missing'`.

## Installation

### npm

```bash
npm install strict-env-resolver
```

### yarn

```bash
yarn add strict-env-resolver
```

### pnpm

```bash
pnpm add strict-env-resolver
```

## Usage

```ts
import { StrictEnvResolver, StrictEnvType } from 'strict-env-resolver';

const port = StrictEnvResolver.resolve('PORT', StrictEnvType.Number.Port, { default: 3000 });

const envs = StrictEnvResolver.resolveAll({
  PORT: [StrictEnvType.Number.Port, { default: 3000 }],
  DEBUG: [StrictEnvType.Boolean, { default: false }],
  MODE: StrictEnvType.Enum(['read', 'write'] as const),
});
```

Strings, custom number bounds, enums, and error handling:

```ts
import {
  StrictEnvResolver,
  StrictEnvError,
  StrictEnvValidationError,
  StrictEnvType,
} from 'strict-env-resolver';

// String (spec omitted → StrictEnvType.String; throws if missing)
const nodeEnv = StrictEnvResolver.resolve('NODE_ENV');

// String with default (used when unset or empty)
const logLevel = StrictEnvResolver.resolve('LOG_LEVEL', StrictEnvType.String, { default: 'info' });

// Trim strings and treat whitespace-only as missing
const trimmedLogLevel = StrictEnvResolver.resolve('LOG_LEVEL', StrictEnvType.String, {
  trim: true,
  default: 'info',
});

// Number (e.g. ratio, timeout)
const timeoutMs = StrictEnvResolver.resolve('TIMEOUT_MS', StrictEnvType.Number, { default: 5000 });
// Valid: "42", "-1", "3.14", "1e5", "+42", "0x10", "  42  " (trimmed)
// Missing: "", "   " (whitespace-only, trim default true)
// Invalid: "Infinity", "NaN", "not-a-number"

// Number presets
const retries = StrictEnvResolver.resolve('RETRIES', StrictEnvType.Number.NonNegativeInteger, { default: 0 });
// Custom bounds: StrictEnvType.Number({ min: 1, max: 1024, integer: true })

// Boolean (1/true/yes/on → true after trim; other non-empty values → false)
const debug = StrictEnvResolver.resolve('DEBUG', StrictEnvType.Boolean, { default: false });

// Enum (value must be in choices, compared after trim)
const mode = StrictEnvResolver.resolve('MODE', StrictEnvType.Enum(['read', 'write'] as const));
const modeWithDefault = StrictEnvResolver.resolve(
  'MODE',
  StrictEnvType.Enum(['read', 'write'] as const),
  { default: 'read' },
);

try {
  StrictEnvResolver.resolveAll({
    PORT: StrictEnvType.Number.Port,
    MODE: StrictEnvType.Enum(['read', 'write'] as const),
  });
} catch (e) {
  if (e instanceof StrictEnvValidationError) {
    // e.errors: [{ key, message, raw?, kind }, ...]
    // e.keys:  ['PORT', 'MODE', ...]
    // kind: 'missing' | 'invalid_number' | 'invalid_enum'
    console.error(e.errors);
  } else if (e instanceof StrictEnvError) {
    // Other package errors
  }
  throw e;
}
```

## Options

### `StrictEnvResolver.resolve(key, spec?, options?)`

| Argument | Required | Description |
|----------|----------|-------------|
| **key** | Yes | Environment variable name (e.g. `"PORT"`, `"NODE_ENV"`). |
| **spec** | No | Type spec; defaults to `StrictEnvType.String`. Use `StrictEnvType.String`, `StrictEnvType.Number` (or a nested preset such as `Number.Port`), `StrictEnvType.Boolean`, or `StrictEnvType.Enum(choices)`. |
| **options** | No | See [`StrictEnvOptions`](#strictenvoptions) below. |

### `StrictEnvResolver.resolveAll(schema)`

`schema` is an object where each key is an env var name and each value is either:

- A spec (e.g. `StrictEnvType.Number.Port`)
- A tuple `[spec, options]` (e.g. `[StrictEnvType.Number.Port, { default: 3000, trim: true }]`)

Evaluates every entry in `schema`. If any value is missing, empty without a default, whitespace-only without a default (when trimming is enabled), or invalid, throws a single `StrictEnvValidationError` containing all issues.

### `StrictEnvOptions`

| Field | Type | Description |
|-------|------|-------------|
| **default** | Spec-dependent | Fallback when the variable is unset, empty (`""`), or whitespace-only (when `trim` is enabled). |
| **trim** | `boolean` | Trims leading/trailing whitespace before validation. Defaults to `true` for `number`, `boolean`, and `enum`; `false` for `string`. |

### Spec types

| Spec | Constant | Description |
|------|----------|-------------|
| `string` | `StrictEnvType.String` | Raw string value. Not trimmed by default; set `trim: true` to trim and treat whitespace-only as missing. |
| `number` | `StrictEnvType.Number` | Finite numeric value (see below). Trimmed by default. Nested presets such as `Number.Port` are still `number` specs. |
| `boolean` | `StrictEnvType.Boolean` | `1` / `true` / `yes` / `on` (case-insensitive, trimmed) → `true`; otherwise → `false`. Trimmed by default. |
| `enum` | `StrictEnvType.Enum(choices)` | Value must be in `choices` (compared after trim). Trimmed by default. |

#### `StrictEnvType.Number`

- Trims leading/trailing whitespace before validation (default `trim: true`).
- Parsed with `Number()`; the result must be finite (`NaN` and `Infinity` are rejected).
- Optional constraints via `StrictEnvType.Number({ min, max, exclusiveMin, exclusiveMax, integer })`.
- **Accepted examples**: `"3000"`, `"3.14"`, `"1e5"`, `"+42"`, `"0x10"`, `"  42  "`, `"-1"`
- **Missing examples**: `""`, `"   "` (whitespace-only; `kind: 'missing'` unless a default is set)
- **Rejected examples**: `"Infinity"`, `"NaN"`, `"not-a-number"`

Named presets use those constraints (same parse path and `kind: 'invalid_number'`):

| Preset | Constraints | Meaning |
|--------|-------------|---------|
| `Number.Integer` | `{ integer: true }` | Any integer |
| `Number.PositiveInteger` | `{ min: 1, integer: true }` | Integer `>= 1` |
| `Number.NegativeInteger` | `{ max: -1, integer: true }` | Integer `<= -1` |
| `Number.NonNegativeInteger` | `{ min: 0, integer: true }` | Integer `>= 0` |
| `Number.Positive` | `{ exclusiveMin: 0 }` | Finite number `> 0` |
| `Number.Negative` | `{ exclusiveMax: 0 }` | Finite number `< 0` |
| `Number.NonNegative` | `{ min: 0 }` | Finite number `>= 0` |
| `Number.Port` | `{ min: 1, max: 65535, integer: true }` | Integer `1`–`65535` |

```ts
StrictEnvResolver.resolve('PORT', StrictEnvType.Number.Port);
StrictEnvResolver.resolve('RATIO', StrictEnvType.Number.Positive);
StrictEnvResolver.resolve('WORKERS', StrictEnvType.Number({ min: 1, max: 64, integer: true }));
```

### Whitespace and trim

| Spec | `trim` default | `""` | `"   "` (whitespace-only) | `" true "` |
|------|----------------|------|---------------------------|------------|
| `string` | `false` | missing (or default) | returned as-is (`"   "`) | returned as-is |
| `number` | `true` | missing (or default) | missing (or default) | `invalid_number` |
| `boolean` | `true` | missing (or default) | missing (or default) | `true` |
| `enum` | `true` | missing (or default) | missing (or default) | `invalid_enum` (unless a choice matches after trim) |

Override with `trim: true` or `trim: false` in options:

```ts
// Trim strings and treat whitespace-only as missing
StrictEnvResolver.resolve('LOG_LEVEL', StrictEnvType.String, { trim: true, default: 'info' });

// Preserve exact whitespace in a string value
StrictEnvResolver.resolve('PADDING', StrictEnvType.String, { trim: false });
```

### Validation errors

| `kind` | When |
|--------|------|
| `missing` | Variable unset, empty (`""`), or whitespace-only when trimming is enabled, without a default. |
| `invalid_number` | Value is not a finite number, not an integer when required, or outside `min` / `max` / `exclusiveMin` / `exclusiveMax`. |
| `invalid_enum` | Value is not in `choices`. |

**Message formats:**

- Missing: `Missing required environment variable: <key>`
- Number: `Env <key>: expected number, got "<raw>"`
- Integer: `Env <key>: expected integer, got "<raw>"`
- Bounds: `Env <key>: must be >= <min>, got <n>` (also `<=`, `>`, `<`)
- Enum: `Env <key>: must be one of [choice1, choice2, ...]`

`StrictEnvValidationError` fields:

- `errors`: `[{ key, message, raw?, kind }, ...]`
- `keys`: `['KEY1', 'KEY2', ...]`

## Requirements

- **Node.js** >= 20.0.0

## License

This project is licensed under the Apache-2.0 License.
