import {
  SafeEnvGetter,
  SafeEnvGetterValidationError,
  SafeEnvType,
  type SafeEnvError,
} from '../src';

const setEnv = (key: string, value: string): void => {
  process.env[key] = value;
};

const unsetEnv = (key: string): void => {
  delete process.env[key];
};

const expectGetEnvValidationError = <K extends string>(
  fn: () => unknown,
  key: K,
  expected: SafeEnvError<K>,
): void => {
  expect(fn).toThrow(SafeEnvGetterValidationError);
  try {
    fn();
    throw new Error('Expected getEnv to throw');
  } catch (e) {
    expect(e).toBeInstanceOf(SafeEnvGetterValidationError);
    const ve = e as SafeEnvGetterValidationError<K>;
    expect(ve.errors).toHaveLength(1);
    expect(ve.errors[0]).toEqual(expected);
    expect(ve.keys).toEqual([key]);
  }
};

describe('SafeEnvGetter.getEnv', () => {
  describe('string', () => {
    test('should default to String type when spec omitted', () => {
      setEnv('TEST_STR', 'hello');
      expect(SafeEnvGetter.getEnv('TEST_STR')).toBe('hello');
      unsetEnv('TEST_STR');
    });

    test('should return value when set', () => {
      setEnv('TEST_STR', 'test');
      expect(SafeEnvGetter.getEnv('TEST_STR', SafeEnvType.String)).toBe('test');
      unsetEnv('TEST_STR');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_STR');
      expect(SafeEnvGetter.getEnv('TEST_STR', SafeEnvType.String, { default: 'fallback' })).toBe('fallback');
    });

    test('should return default when empty string', () => {
      setEnv('TEST_STR', '');
      expect(SafeEnvGetter.getEnv('TEST_STR', SafeEnvType.String, { default: 'fallback' })).toBe('fallback');
      unsetEnv('TEST_STR');
    });

    test('should throw when missing and no default', () => {
      unsetEnv('TEST_STR');
      expectGetEnvValidationError(
        () => SafeEnvGetter.getEnv('TEST_STR', SafeEnvType.String),
        'TEST_STR',
        {
          key: 'TEST_STR',
          message: 'Missing required environment variable: TEST_STR',
          raw: undefined,
          kind: 'missing',
        },
      );
    });

    test('should return whitespace-only value as-is by default', () => {
      setEnv('TEST_STR', '   ');
      expect(SafeEnvGetter.getEnv('TEST_STR', SafeEnvType.String)).toBe('   ');
      unsetEnv('TEST_STR');
    });

    test('should treat whitespace-only as missing when trim is true', () => {
      setEnv('TEST_STR', '   ');
      expectGetEnvValidationError(
        () => SafeEnvGetter.getEnv('TEST_STR', SafeEnvType.String, { trim: true }),
        'TEST_STR',
        {
          key: 'TEST_STR',
          message: 'Missing required environment variable: TEST_STR',
          raw: '   ',
          kind: 'missing',
        },
      );
      unsetEnv('TEST_STR');
    });

    test('should return trimmed value when trim is true', () => {
      setEnv('TEST_STR', '  hello  ');
      expect(SafeEnvGetter.getEnv('TEST_STR', SafeEnvType.String, { trim: true })).toBe('hello');
      unsetEnv('TEST_STR');
    });
  });

  describe('number (strict decimal integer)', () => {
    test.each([
      ['42', 42],
      ['0', 0],
      ['-1', -1],
      ['007', 7],
      ['  42  ', 42],
    ] as const)('should parse valid integer: %s → %s', (raw, expected) => {
      setEnv('TEST_NUM', raw);
      expect(SafeEnvGetter.getEnv('TEST_NUM', SafeEnvType.Number)).toBe(expected);
      unsetEnv('TEST_NUM');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_NUM');
      expect(SafeEnvGetter.getEnv('TEST_NUM', SafeEnvType.Number, { default: 100 })).toBe(100);
    });

    test('should return default when empty string', () => {
      setEnv('TEST_NUM', '');
      expect(SafeEnvGetter.getEnv('TEST_NUM', SafeEnvType.Number, { default: 100 })).toBe(100);
      unsetEnv('TEST_NUM');
    });

    test('should throw when missing and no default', () => {
      unsetEnv('TEST_NUM');
      expect(() => SafeEnvGetter.getEnv('TEST_NUM', SafeEnvType.Number)).toThrow(
        'Missing required environment variable: TEST_NUM',
      );
    });

    test.each([
      'not-a-number',
      'Infinity',
      '-Infinity',
      '0x10',
      '3.14',
      'NaN',
      '+42',
      '1e5',
    ])('should reject invalid integer: %s', (raw) => {
      setEnv('TEST_NUM', raw);
      expectGetEnvValidationError(
        () => SafeEnvGetter.getEnv('TEST_NUM', SafeEnvType.Number),
        'TEST_NUM',
        {
          key: 'TEST_NUM',
          message: `Env TEST_NUM: expected number, got "${raw}"`,
          raw,
          kind: 'invalid_number',
        },
      );
      unsetEnv('TEST_NUM');
    });

    test('should treat whitespace-only as missing', () => {
      setEnv('TEST_NUM', '   ');
      expectGetEnvValidationError(
        () => SafeEnvGetter.getEnv('TEST_NUM', SafeEnvType.Number),
        'TEST_NUM',
        {
          key: 'TEST_NUM',
          message: 'Missing required environment variable: TEST_NUM',
          raw: '   ',
          kind: 'missing',
        },
      );
      unsetEnv('TEST_NUM');
    });

    test('should reject when Number.isFinite returns false for digit string', () => {
      const isFiniteSpy = jest.spyOn(Number, 'isFinite').mockReturnValue(false);
      setEnv('TEST_NUM', '42');
      expectGetEnvValidationError(
        () => SafeEnvGetter.getEnv('TEST_NUM', SafeEnvType.Number),
        'TEST_NUM',
        {
          key: 'TEST_NUM',
          message: 'Env TEST_NUM: expected number, got "42"',
          raw: '42',
          kind: 'invalid_number',
        },
      );
      isFiniteSpy.mockRestore();
      unsetEnv('TEST_NUM');
    });

    test('should reject when Number.isInteger returns false for digit string', () => {
      const isIntegerSpy = jest.spyOn(Number, 'isInteger').mockReturnValue(false);
      setEnv('TEST_NUM', '42');
      expectGetEnvValidationError(
        () => SafeEnvGetter.getEnv('TEST_NUM', SafeEnvType.Number),
        'TEST_NUM',
        {
          key: 'TEST_NUM',
          message: 'Env TEST_NUM: expected number, got "42"',
          raw: '42',
          kind: 'invalid_number',
        },
      );
      isIntegerSpy.mockRestore();
      unsetEnv('TEST_NUM');
    });
  });

  describe('boolean', () => {
    test.each(['1', 'true', 'TRUE', 'yes', 'on'])('should parse %s as true', (val) => {
      setEnv('TEST_BOOL', val);
      expect(SafeEnvGetter.getEnv('TEST_BOOL', SafeEnvType.Boolean)).toBe(true);
      unsetEnv('TEST_BOOL');
    });

    test.each(['  true  ', ' 1 ', ' YES '])('should parse trimmed %s as true', (val) => {
      setEnv('TEST_BOOL', val);
      expect(SafeEnvGetter.getEnv('TEST_BOOL', SafeEnvType.Boolean)).toBe(true);
      unsetEnv('TEST_BOOL');
    });

    test('should treat whitespace-only as missing', () => {
      setEnv('TEST_BOOL', '   ');
      expect(() => SafeEnvGetter.getEnv('TEST_BOOL', SafeEnvType.Boolean)).toThrow(
        'Missing required environment variable: TEST_BOOL',
      );
      unsetEnv('TEST_BOOL');
    });

    test.each(['0', 'false', 'no', 'off'])('should parse %s as false', (val) => {
      setEnv('TEST_BOOL', val);
      expect(SafeEnvGetter.getEnv('TEST_BOOL', SafeEnvType.Boolean)).toBe(false);
      unsetEnv('TEST_BOOL');
    });

    test('should return default when empty string', () => {
      setEnv('TEST_BOOL', '');
      expect(SafeEnvGetter.getEnv('TEST_BOOL', SafeEnvType.Boolean, { default: true })).toBe(true);
      unsetEnv('TEST_BOOL');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_BOOL');
      expect(SafeEnvGetter.getEnv('TEST_BOOL', SafeEnvType.Boolean, { default: true })).toBe(true);
    });

    test('should throw when missing and no default', () => {
      unsetEnv('TEST_BOOL');
      expect(() => SafeEnvGetter.getEnv('TEST_BOOL', SafeEnvType.Boolean)).toThrow(
        'Missing required environment variable: TEST_BOOL',
      );
    });
  });

  describe('enum', () => {
    const choices = ['a', 'b', 'c'] as const;

    test('should return value when in choices', () => {
      setEnv('TEST_ENUM', 'b');
      expect(SafeEnvGetter.getEnv('TEST_ENUM', SafeEnvType.Enum(choices))).toBe('b');
      unsetEnv('TEST_ENUM');
    });

    test('should return trimmed value when surrounded by whitespace', () => {
      setEnv('TEST_ENUM', '  b  ');
      expect(SafeEnvGetter.getEnv('TEST_ENUM', SafeEnvType.Enum(choices))).toBe('b');
      unsetEnv('TEST_ENUM');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_ENUM');
      expect(SafeEnvGetter.getEnv('TEST_ENUM', SafeEnvType.Enum(choices), { default: 'a' })).toBe('a');
    });

    test('should throw when value is not in choices', () => {
      setEnv('TEST_ENUM', 'x');
      expectGetEnvValidationError(
        () => SafeEnvGetter.getEnv('TEST_ENUM', SafeEnvType.Enum(choices)),
        'TEST_ENUM',
        {
          key: 'TEST_ENUM',
          message: 'Env TEST_ENUM: must be one of [a, b, c]',
          raw: 'x',
          kind: 'invalid_enum',
        },
      );
      unsetEnv('TEST_ENUM');
    });

    test('should throw when missing and no default', () => {
      unsetEnv('TEST_ENUM');
      expect(() => SafeEnvGetter.getEnv('TEST_ENUM', SafeEnvType.Enum(choices))).toThrow(
        'Missing required environment variable: TEST_ENUM',
      );
    });
  });
});

describe('SafeEnvGetter.getEnvs', () => {
  test('should return parsed values with defaults', () => {
    setEnv('TEST_PORT', '1234');
    unsetEnv('TEST_MODE');

    const envs = SafeEnvGetter.getEnvs({
      TEST_PORT: SafeEnvType.Number,
      TEST_DEBUG: [SafeEnvType.Boolean, { default: false }],
      TEST_MODE: [SafeEnvType.Enum(['read', 'write'] as const), { default: 'read' }],
    });

    expect(envs).toEqual({
      TEST_PORT: 1234,
      TEST_DEBUG: false,
      TEST_MODE: 'read',
    });

    unsetEnv('TEST_PORT');
    unsetEnv('TEST_DEBUG');
    unsetEnv('TEST_MODE');
  });

  test('should use default for empty string', () => {
    setEnv('TEST_PORT', '');
    const envs = SafeEnvGetter.getEnvs({
      TEST_PORT: [SafeEnvType.Number, { default: 3000 }],
    });
    expect(envs).toEqual({ TEST_PORT: 3000 });
    unsetEnv('TEST_PORT');
  });

  test('should collect invalid_number for non-integer env value', () => {
    setEnv('TEST_PORT', 'Infinity');

    try {
      SafeEnvGetter.getEnvs({ TEST_PORT: SafeEnvType.Number });
      throw new Error('Expected getEnvs to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SafeEnvGetterValidationError);
      const ve = e as SafeEnvGetterValidationError<'TEST_PORT'>;
      expect(ve.errors).toEqual([
        {
          key: 'TEST_PORT',
          message: 'Env TEST_PORT: expected number, got "Infinity"',
          raw: 'Infinity',
          kind: 'invalid_number',
        },
      ]);
      expect(ve.keys).toEqual(['TEST_PORT']);
    }

    unsetEnv('TEST_PORT');
  });

  test('should collect multiple errors and throw once', () => {
    unsetEnv('TEST_PORT');
    setEnv('TEST_MODE', 'bad');

    try {
      SafeEnvGetter.getEnvs({
        TEST_PORT: SafeEnvType.Number,
        TEST_MODE: SafeEnvType.Enum(['read', 'write'] as const),
      });
      throw new Error('Expected getEnvs to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SafeEnvGetterValidationError);
      const ve = e as SafeEnvGetterValidationError<'TEST_PORT' | 'TEST_MODE'>;
      expect(ve.errors).toHaveLength(2);
      expect(ve.keys).toEqual(['TEST_PORT', 'TEST_MODE']);
      expect(ve.errors).toEqual([
        {
          key: 'TEST_PORT',
          message: 'Missing required environment variable: TEST_PORT',
          raw: undefined,
          kind: 'missing',
        },
        {
          key: 'TEST_MODE',
          message: 'Env TEST_MODE: must be one of [read, write]',
          raw: 'bad',
          kind: 'invalid_enum',
        },
      ]);
    }

    unsetEnv('TEST_MODE');
  });

  test('should collect missing, invalid_number, and invalid_enum together', () => {
    unsetEnv('TEST_PORT');
    setEnv('TEST_WORKERS', '3.14');
    setEnv('TEST_MODE', 'invalid');

    try {
      SafeEnvGetter.getEnvs({
        TEST_PORT: SafeEnvType.Number,
        TEST_WORKERS: SafeEnvType.Number,
        TEST_MODE: SafeEnvType.Enum(['read', 'write'] as const),
      });
      throw new Error('Expected getEnvs to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SafeEnvGetterValidationError);
      const ve = e as SafeEnvGetterValidationError<'TEST_PORT' | 'TEST_WORKERS' | 'TEST_MODE'>;
      expect(ve.errors).toHaveLength(3);
      expect(ve.keys).toEqual(['TEST_PORT', 'TEST_WORKERS', 'TEST_MODE']);
      expect(ve.errors).toEqual([
        {
          key: 'TEST_PORT',
          message: 'Missing required environment variable: TEST_PORT',
          raw: undefined,
          kind: 'missing',
        },
        {
          key: 'TEST_WORKERS',
          message: 'Env TEST_WORKERS: expected number, got "3.14"',
          raw: '3.14',
          kind: 'invalid_number',
        },
        {
          key: 'TEST_MODE',
          message: 'Env TEST_MODE: must be one of [read, write]',
          raw: 'invalid',
          kind: 'invalid_enum',
        },
      ]);
    }

    unsetEnv('TEST_WORKERS');
    unsetEnv('TEST_MODE');
  });

  test('should parse boolean values when set in process.env', () => {
    setEnv('TEST_DEBUG', 'true');
    setEnv('TEST_VERBOSE', '0');

    const envs = SafeEnvGetter.getEnvs({
      TEST_DEBUG: SafeEnvType.Boolean,
      TEST_VERBOSE: SafeEnvType.Boolean,
    });

    expect(envs).toEqual({
      TEST_DEBUG: true,
      TEST_VERBOSE: false,
    });

    unsetEnv('TEST_DEBUG');
    unsetEnv('TEST_VERBOSE');
  });

  test('should parse valid enum and string values', () => {
    setEnv('TEST_MODE', 'write');
    setEnv('TEST_LABEL', 'my-app');

    const envs = SafeEnvGetter.getEnvs({
      TEST_MODE: SafeEnvType.Enum(['read', 'write'] as const),
      TEST_LABEL: SafeEnvType.String,
    });

    expect(envs).toEqual({
      TEST_MODE: 'write',
      TEST_LABEL: 'my-app',
    });

    unsetEnv('TEST_MODE');
    unsetEnv('TEST_LABEL');
  });
});
