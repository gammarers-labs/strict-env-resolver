# Safe Env Getter

[![npm version](https://img.shields.io/npm/v/safe-env-getter.svg)](https://www.npmjs.com/package/safe-env-getter)
[![npm downloads](https://img.shields.io/npm/dm/safe-env-getter.svg)](https://www.npmjs.com/package/safe-env-getter)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Type-safe environment variable getter for Node.js. Reads and parses `process.env` with specs (`string`, `number`, `boolean`, `enum`), optional defaults, configurable trimming, and structured validation errors when values are missing or invalid.

## Features

- **Typed specs**: `string`, `number`, `boolean`, and `enum` with TypeScript inference
- **Strict decimal integers**: `SafeEnvType.Number` rejects hex (`0x10`), `Infinity`, `NaN`, floats, exponents, and other non-integer forms
- **Optional defaults**: Fallback when a variable is unset, empty (`""`), or whitespace-only (when trimming is enabled)
- **Configurable trim**: `trim` defaults to `true` for parsed types and `false` for strings; override per variable
- **Batch parsing**: `getEnvs()` evaluates every key and throws once with all validation errors
- **Structured errors**: `SafeEnvGetterValidationError` exposes `errors` (`key`, `message`, `raw`, `kind`) and `keys`
- **Boolean parsing**: `1`, `true`, `yes`, `on` (case-insensitive, after trim) → `true`; any other non-empty value → `false`
- **Enum constraint**: Values must match one of the allowed choices (compared after trim)

## Installation

**npm**

```bash
npm install safe-env-getter
```

**yarn**

```bash
yarn add safe-env-getter
```

## Usage

```ts
import {
  SafeEnvGetter,
  SafeEnvGetterError,
  SafeEnvGetterValidationError,
  SafeEnvType,
} from 'safe-env-getter';

// String (spec omitted → SafeEnvType.String; throws if missing)
const nodeEnv = SafeEnvGetter.getEnv('NODE_ENV');

// String with default (used when unset or empty)
const logLevel = SafeEnvGetter.getEnv('LOG_LEVEL', SafeEnvType.String, { default: 'info' });

// Trim strings and treat whitespace-only as missing
const trimmedLogLevel = SafeEnvGetter.getEnv('LOG_LEVEL', SafeEnvType.String, {
  trim: true,
  default: 'info',
});

// Strict decimal integer (e.g. port, worker count)
const port = SafeEnvGetter.getEnv('PORT', SafeEnvType.Number, { default: 3000 });
// Valid: "42", "-1", "  42  " (trimmed)
// Missing: "", "   " (whitespace-only, trim default true)
// Invalid: "Infinity", "0x10", "3.14", "+42", "1e5"

// Boolean (1/true/yes/on → true after trim; other non-empty values → false)
const debug = SafeEnvGetter.getEnv('DEBUG', SafeEnvType.Boolean, { default: false });
// " true " → true

// Enum (value must be in choices, compared after trim)
const mode = SafeEnvGetter.getEnv('MODE', SafeEnvType.Enum(['read', 'write'] as const));
const modeWithDefault = SafeEnvGetter.getEnv(
  'MODE',
  SafeEnvType.Enum(['read', 'write'] as const),
  { default: 'read' },
);

// Read multiple env vars at once (collects all errors, then throws once)
const envs = SafeEnvGetter.getEnvs({
  PORT: [SafeEnvType.Number, { default: 3000 }],
  DEBUG: [SafeEnvType.Boolean, { default: false }],
  MODE: SafeEnvType.Enum(['read', 'write'] as const),
  LOG_LEVEL: [SafeEnvType.String, { trim: true, default: 'info' }],
});

// Handle structured validation errors
try {
  SafeEnvGetter.getEnvs({
    PORT: SafeEnvType.Number,
    MODE: SafeEnvType.Enum(['read', 'write'] as const),
  });
} catch (e) {
  if (e instanceof SafeEnvGetterValidationError) {
    // e.errors: [{ key, message, raw?, kind }, ...]
    // e.keys:  ['PORT', 'MODE', ...]
    // kind: 'missing' | 'invalid_number' | 'invalid_enum'
    console.error(e.errors);
  } else if (e instanceof SafeEnvGetterError) {
    // Other package errors
  }
  throw e;
}
```

## Options

### `SafeEnvGetter.getEnv(key, spec?, options?)`

| Argument | Required | Description |
|----------|----------|-------------|
| **key** | Yes | Environment variable name (e.g. `"PORT"`, `"NODE_ENV"`). |
| **spec** | No | Type spec; defaults to `SafeEnvType.String`. Use `SafeEnvType.String`, `SafeEnvType.Number`, `SafeEnvType.Boolean`, or `SafeEnvType.Enum(choices)`. |
| **options** | No | See [`SafeGetEnvOptions`](#safegetenvoptions) below. |

### `SafeEnvGetter.getEnvs(schema)`

`schema` is an object where each key is an env var name and each value is either:

- A spec (e.g. `SafeEnvType.Number`)
- A tuple `[spec, options]` (e.g. `[SafeEnvType.Number, { default: 3000, trim: true }]`)

Evaluates every entry in `schema`. If any value is missing, empty without a default, whitespace-only without a default (when trimming is enabled), or invalid, throws a single `SafeEnvGetterValidationError` containing all issues.

### `SafeGetEnvOptions`

| Field | Type | Description |
|-------|------|-------------|
| **default** | Spec-dependent | Fallback when the variable is unset, empty (`""`), or whitespace-only (when `trim` is enabled). |
| **trim** | `boolean` | Trims leading/trailing whitespace before validation. Defaults to `true` for `number`, `boolean`, and `enum`; `false` for `string`. |

### Spec types

| Spec | Constant | Description |
|------|----------|-------------|
| `string` | `SafeEnvType.String` | Raw string value. Not trimmed by default; set `trim: true` to trim and treat whitespace-only as missing. |
| `number` | `SafeEnvType.Number` | Strict decimal integer (see below). Trimmed by default. |
| `boolean` | `SafeEnvType.Boolean` | `1` / `true` / `yes` / `on` (case-insensitive, trimmed) → `true`; otherwise → `false`. Trimmed by default. |
| `enum` | `SafeEnvType.Enum(choices)` | Value must be in `choices` (compared after trim). Trimmed by default. |

#### `SafeEnvType.Number` (strict decimal integer)

- Trims leading/trailing whitespace before validation (default `trim: true`).
- Allows optional leading `-` and one or more digits (e.g. `42`, `-1`, `007`).
- **Accepted examples**: `"3000"`, `"  42  "`, `"-1"`
- **Missing examples**: `""`, `"   "` (whitespace-only; `kind: 'missing'` unless a default is set)
- **Rejected examples**: `"Infinity"`, `"0x10"`, `"3.14"`, `"NaN"`, `"+42"`, `"1e5"`

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
SafeEnvGetter.getEnv('LOG_LEVEL', SafeEnvType.String, { trim: true, default: 'info' });

// Preserve exact whitespace in a string value
SafeEnvGetter.getEnv('PADDING', SafeEnvType.String, { trim: false });
```

### Validation errors

| `kind` | When |
|--------|------|
| `missing` | Variable unset, empty (`""`), or whitespace-only when trimming is enabled, without a default. |
| `invalid_number` | Value is not a strict decimal integer. |
| `invalid_enum` | Value is not in `choices`. |

**Message formats:**

- Missing: `Missing required environment variable: <key>`
- Number: `Env <key>: expected number, got "<raw>"`
- Enum: `Env <key>: must be one of [choice1, choice2, ...]`

`SafeEnvGetterValidationError` fields:

- `errors`: `[{ key, message, raw?, kind }, ...]`
- `keys`: `['KEY1', 'KEY2', ...]`

## Requirements

- **Node.js** >= 20.0.0

## License

This project is licensed under the Apache-2.0 License.
