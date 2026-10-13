/**
 * Public entry for strict-env-resolver.
 * Re-exports the resolver API and package errors. Implementation lives in feature and core modules.
 */
export { StrictEnvResolver, StrictEnvType } from './resolver';

export type {
  StrictEnvNumberConstraints,
  StrictEnvOptions,
  StrictEnvSchema,
  StrictEnvSchemaEntry,
  StrictEnvSchemaToType,
  StrictEnvSpec,
  StrictEnvSpecToType,
  StrictEnvTypeBoolean,
  StrictEnvTypeEnum,
  StrictEnvTypeNumber,
  StrictEnvTypeString,
} from './resolver';

export { StrictEnvError, StrictEnvValidationError } from './core/errors';

export type { StrictEnvErrorKind, StrictEnvValidationEntry } from './core/errors';
