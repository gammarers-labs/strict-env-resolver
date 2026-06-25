# Strict Env Resolver

[![npm version](https://img.shields.io/npm/v/strict-env-resolver.svg)](https://www.npmjs.com/package/strict-env-resolver)
[![npm downloads](https://img.shields.io/npm/dm/strict-env-resolver.svg)](https://www.npmjs.com/package/strict-env-resolver)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Type-safe environment variable resolver for Node.js. Reads and parses `process.env` with specs (`string`, `number`, `boolean`, `enum`), optional defaults, configurable trimming, and structured validation errors when values are missing or invalid.

## Features

- **Typed specs**: `string`, `number`, `boolean`, and `enum` with TypeScript inference
- **Finite numbers**: `StrictEnvType.Number` parses any finite numeric value (`Number()`); rejects `NaN` and `Infinity`
- **Optional defaults**: Fallback when a variable is unset, empty (`""`), or whitespace-only (when trimming is enabled)
- **Configurable trim**: `trim` defaults to `true` for parsed types and `false` for strings; override per variable
- **Batch parsing**: `resolveAll()` evaluates every key and throws once with all validation errors
- **Structured errors**: `StrictEnvValidationError` exposes `errors` (`key`, `message`, `raw`, `kind`) and `keys`
- **Boolean parsing**: `1`, `true`, `yes`, `on` (case-insensitive, after trim) → `true`; any other non-empty value → `false`
- **Enum constraint**: Values must match one of the allowed choices (compared after trim)

## Installation

**npm**

```bash
npm install strict-env-resolver
```

**yarn**

```bash
yarn add strict-env-resolver
```

## Usage

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

// Number (e.g. port, ratio, timeout)
const port = StrictEnvResolver.resolve('PORT', StrictEnvType.Number, { default: 3000 });
// Valid: "42", "-1", "3.14", "1e5", "+42", "0x10", "  42  " (trimmed)
// Missing: "", "   " (whitespace-only, trim default true)
// Invalid: "Infinity", "NaN", "not-a-number"

// Boolean (1/true/yes/on → true after trim; other non-empty values → false)
const debug = StrictEnvResolver.resolve('DEBUG', StrictEnvType.Boolean, { default: false });
// " true " → true

// Enum (value must be in choices, compared after trim)
const mode = StrictEnvResolver.resolve('MODE', StrictEnvType.Enum(['read', 'write'] as const));
const modeWithDefault = StrictEnvResolver.resolve(
  'MODE',
  StrictEnvType.Enum(['read', 'write'] as const),
  { default: 'read' },
);

// Read multiple env vars at once (collects all errors, then throws once)
const envs = StrictEnvResolver.resolveAll({
  PORT: [StrictEnvType.Number, { default: 3000 }],
  DEBUG: [StrictEnvType.Boolean, { default: false }],
  MODE: StrictEnvType.Enum(['read', 'write'] as const),
  LOG_LEVEL: [StrictEnvType.String, { trim: true, default: 'info' }],
});

// Handle structured validation errors
try {
  StrictEnvResolver.resolveAll({
    PORT: StrictEnvType.Number,
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
| **spec** | No | Type spec; defaults to `StrictEnvType.String`. Use `StrictEnvType.String`, `StrictEnvType.Number`, `StrictEnvType.Boolean`, or `StrictEnvType.Enum(choices)`. |
| **options** | No | See [`StrictEnvOptions`](#strictenvoptions) below. |

### `StrictEnvResolver.resolveAll(schema)`

`schema` is an object where each key is an env var name and each value is either:

- A spec (e.g. `StrictEnvType.Number`)
- A tuple `[spec, options]` (e.g. `[StrictEnvType.Number, { default: 3000, trim: true }]`)

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
| `number` | `StrictEnvType.Number` | Finite numeric value (see below). Trimmed by default. |
| `boolean` | `StrictEnvType.Boolean` | `1` / `true` / `yes` / `on` (case-insensitive, trimmed) → `true`; otherwise → `false`. Trimmed by default. |
| `enum` | `StrictEnvType.Enum(choices)` | Value must be in `choices` (compared after trim). Trimmed by default. |

#### `StrictEnvType.Number`

- Trims leading/trailing whitespace before validation (default `trim: true`).
- Parsed with `Number()`; the result must be finite (`NaN` and `Infinity` are rejected).
- **Accepted examples**: `"3000"`, `"3.14"`, `"1e5"`, `"+42"`, `"0x10"`, `"  42  "`, `"-1"`
- **Missing examples**: `""`, `"   "` (whitespace-only; `kind: 'missing'` unless a default is set)
- **Rejected examples**: `"Infinity"`, `"NaN"`, `"not-a-number"`

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
| `invalid_number` | Value is not a finite number. |
| `invalid_enum` | Value is not in `choices`. |

**Message formats:**

- Missing: `Missing required environment variable: <key>`
- Number: `Env <key>: expected number, got "<raw>"`
- Enum: `Env <key>: must be one of [choice1, choice2, ...]`

`StrictEnvValidationError` fields:

- `errors`: `[{ key, message, raw?, kind }, ...]`
- `keys`: `['KEY1', 'KEY2', ...]`

## Requirements

- **Node.js** >= 20.0.0

## License

This project is licensed under the Apache-2.0 License.
