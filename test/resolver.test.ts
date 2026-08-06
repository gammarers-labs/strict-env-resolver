import {
  StrictEnvResolver,
  StrictEnvValidationError,
  StrictEnvType,
  type StrictEnvValidationEntry,
} from '../src';

const setEnv = (key: string, value: string): void => {
  process.env[key] = value;
};

const unsetEnv = (key: string): void => {
  delete process.env[key];
};

const expectResolveValidationError = <K extends string>(
  fn: () => unknown,
  key: K,
  expected: StrictEnvValidationEntry<K>,
): void => {
  expect(fn).toThrow(StrictEnvValidationError);
  try {
    fn();
    throw new Error('Expected resolve to throw');
  } catch (e) {
    expect(e).toBeInstanceOf(StrictEnvValidationError);
    const ve = e as StrictEnvValidationError<K>;
    expect(ve.errors).toHaveLength(1);
    expect(ve.errors[0]).toEqual(expected);
    expect(ve.keys).toEqual([key]);
  }
};

describe('StrictEnvResolver.resolve', () => {
  describe('string', () => {
    test('should default to String type when spec omitted', () => {
      setEnv('TEST_STR', 'hello');
      expect(StrictEnvResolver.resolve('TEST_STR')).toBe('hello');
      unsetEnv('TEST_STR');
    });

    test('should return value when set', () => {
      setEnv('TEST_STR', 'test');
      expect(StrictEnvResolver.resolve('TEST_STR', StrictEnvType.String)).toBe('test');
      unsetEnv('TEST_STR');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_STR');
      expect(StrictEnvResolver.resolve('TEST_STR', StrictEnvType.String, { default: 'fallback' })).toBe('fallback');
    });

    test('should return default when empty string', () => {
      setEnv('TEST_STR', '');
      expect(StrictEnvResolver.resolve('TEST_STR', StrictEnvType.String, { default: 'fallback' })).toBe('fallback');
      unsetEnv('TEST_STR');
    });

    test('should throw when missing and no default', () => {
      unsetEnv('TEST_STR');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_STR', StrictEnvType.String),
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
      expect(StrictEnvResolver.resolve('TEST_STR', StrictEnvType.String)).toBe('   ');
      unsetEnv('TEST_STR');
    });

    test('should treat whitespace-only as missing when trim is true', () => {
      setEnv('TEST_STR', '   ');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_STR', StrictEnvType.String, { trim: true }),
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
      expect(StrictEnvResolver.resolve('TEST_STR', StrictEnvType.String, { trim: true })).toBe('hello');
      unsetEnv('TEST_STR');
    });
  });

  describe('number', () => {
    test.each([
      ['42', 42],
      ['0', 0],
      ['-1', -1],
      ['007', 7],
      ['  42  ', 42],
      ['3.14', 3.14],
      ['1e5', 100000],
      ['+42', 42],
      ['0x10', 16],
    ] as const)('should parse valid number: %s → %s', (raw, expected) => {
      setEnv('TEST_NUM', raw);
      expect(StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number)).toBe(expected);
      unsetEnv('TEST_NUM');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_NUM');
      expect(StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number, { default: 100 })).toBe(100);
    });

    test('should return default when empty string', () => {
      setEnv('TEST_NUM', '');
      expect(StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number, { default: 100 })).toBe(100);
      unsetEnv('TEST_NUM');
    });

    test('should throw when missing and no default', () => {
      unsetEnv('TEST_NUM');
      expect(() => StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number)).toThrow(
        'Missing required environment variable: TEST_NUM',
      );
    });

    test.each([
      'not-a-number',
      'Infinity',
      '-Infinity',
      'NaN',
    ])('should reject non-finite number: %s', (raw) => {
      setEnv('TEST_NUM', raw);
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number),
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
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number),
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
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number),
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

    test('should accept value within Number constraints', () => {
      setEnv('TEST_NUM', '10');
      expect(StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number({ min: 1, max: 100 }))).toBe(10);
      unsetEnv('TEST_NUM');
    });

    test('should reject value below min', () => {
      setEnv('TEST_NUM', '0');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number({ min: 1 })),
        'TEST_NUM',
        {
          key: 'TEST_NUM',
          message: 'Env TEST_NUM: must be >= 1, got 0',
          raw: '0',
          kind: 'invalid_number',
        },
      );
      unsetEnv('TEST_NUM');
    });

    test('should reject value above max', () => {
      setEnv('TEST_NUM', '101');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number({ max: 100 })),
        'TEST_NUM',
        {
          key: 'TEST_NUM',
          message: 'Env TEST_NUM: must be <= 100, got 101',
          raw: '101',
          kind: 'invalid_number',
        },
      );
      unsetEnv('TEST_NUM');
    });

    test('should reject non-integer when integer constraint is set', () => {
      setEnv('TEST_NUM', '3.14');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_NUM', StrictEnvType.Number({ integer: true })),
        'TEST_NUM',
        {
          key: 'TEST_NUM',
          message: 'Env TEST_NUM: expected integer, got "3.14"',
          raw: '3.14',
          kind: 'invalid_number',
        },
      );
      unsetEnv('TEST_NUM');
    });
  });

  describe('PositiveInt', () => {
    test.each([
      ['1', 1],
      ['42', 42],
      ['  7  ', 7],
    ] as const)('should accept positive integer: %s → %s', (raw, expected) => {
      setEnv('TEST_POS', raw);
      expect(StrictEnvResolver.resolve('TEST_POS', StrictEnvType.PositiveInt)).toBe(expected);
      unsetEnv('TEST_POS');
    });

    test.each(['0', '-1', '3.14', '1.5'])('should reject non-positive-integer: %s', (raw) => {
      setEnv('TEST_POS', raw);
      expect(() => StrictEnvResolver.resolve('TEST_POS', StrictEnvType.PositiveInt)).toThrow(
        StrictEnvValidationError,
      );
      unsetEnv('TEST_POS');
    });

    test('should reject zero with min message', () => {
      setEnv('TEST_POS', '0');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_POS', StrictEnvType.PositiveInt),
        'TEST_POS',
        {
          key: 'TEST_POS',
          message: 'Env TEST_POS: must be >= 1, got 0',
          raw: '0',
          kind: 'invalid_number',
        },
      );
      unsetEnv('TEST_POS');
    });

    test('should reject float with integer message', () => {
      setEnv('TEST_POS', '1.5');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_POS', StrictEnvType.PositiveInt),
        'TEST_POS',
        {
          key: 'TEST_POS',
          message: 'Env TEST_POS: expected integer, got "1.5"',
          raw: '1.5',
          kind: 'invalid_number',
        },
      );
      unsetEnv('TEST_POS');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_POS');
      expect(StrictEnvResolver.resolve('TEST_POS', StrictEnvType.PositiveInt, { default: 1 })).toBe(1);
    });
  });

  describe('NegativeInt', () => {
    test.each([
      ['-1', -1],
      ['-42', -42],
      ['  -7  ', -7],
    ] as const)('should accept negative integer: %s → %s', (raw, expected) => {
      setEnv('TEST_NEG', raw);
      expect(StrictEnvResolver.resolve('TEST_NEG', StrictEnvType.NegativeInt)).toBe(expected);
      unsetEnv('TEST_NEG');
    });

    test.each(['0', '1', '-3.14', '-1.5'])('should reject non-negative-integer: %s', (raw) => {
      setEnv('TEST_NEG', raw);
      expect(() => StrictEnvResolver.resolve('TEST_NEG', StrictEnvType.NegativeInt)).toThrow(
        StrictEnvValidationError,
      );
      unsetEnv('TEST_NEG');
    });

    test('should reject zero with max message', () => {
      setEnv('TEST_NEG', '0');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_NEG', StrictEnvType.NegativeInt),
        'TEST_NEG',
        {
          key: 'TEST_NEG',
          message: 'Env TEST_NEG: must be <= -1, got 0',
          raw: '0',
          kind: 'invalid_number',
        },
      );
      unsetEnv('TEST_NEG');
    });

    test('should reject float with integer message', () => {
      setEnv('TEST_NEG', '-1.5');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_NEG', StrictEnvType.NegativeInt),
        'TEST_NEG',
        {
          key: 'TEST_NEG',
          message: 'Env TEST_NEG: expected integer, got "-1.5"',
          raw: '-1.5',
          kind: 'invalid_number',
        },
      );
      unsetEnv('TEST_NEG');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_NEG');
      expect(StrictEnvResolver.resolve('TEST_NEG', StrictEnvType.NegativeInt, { default: -1 })).toBe(-1);
    });
  });

  describe('boolean', () => {
    test.each(['1', 'true', 'TRUE', 'yes', 'on'])('should parse %s as true', (val) => {
      setEnv('TEST_BOOL', val);
      expect(StrictEnvResolver.resolve('TEST_BOOL', StrictEnvType.Boolean)).toBe(true);
      unsetEnv('TEST_BOOL');
    });

    test.each(['  true  ', ' 1 ', ' YES '])('should parse trimmed %s as true', (val) => {
      setEnv('TEST_BOOL', val);
      expect(StrictEnvResolver.resolve('TEST_BOOL', StrictEnvType.Boolean)).toBe(true);
      unsetEnv('TEST_BOOL');
    });

    test('should treat whitespace-only as missing', () => {
      setEnv('TEST_BOOL', '   ');
      expect(() => StrictEnvResolver.resolve('TEST_BOOL', StrictEnvType.Boolean)).toThrow(
        'Missing required environment variable: TEST_BOOL',
      );
      unsetEnv('TEST_BOOL');
    });

    test.each(['0', 'false', 'no', 'off'])('should parse %s as false', (val) => {
      setEnv('TEST_BOOL', val);
      expect(StrictEnvResolver.resolve('TEST_BOOL', StrictEnvType.Boolean)).toBe(false);
      unsetEnv('TEST_BOOL');
    });

    test('should return default when empty string', () => {
      setEnv('TEST_BOOL', '');
      expect(StrictEnvResolver.resolve('TEST_BOOL', StrictEnvType.Boolean, { default: true })).toBe(true);
      unsetEnv('TEST_BOOL');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_BOOL');
      expect(StrictEnvResolver.resolve('TEST_BOOL', StrictEnvType.Boolean, { default: true })).toBe(true);
    });

    test('should throw when missing and no default', () => {
      unsetEnv('TEST_BOOL');
      expect(() => StrictEnvResolver.resolve('TEST_BOOL', StrictEnvType.Boolean)).toThrow(
        'Missing required environment variable: TEST_BOOL',
      );
    });
  });

  describe('enum', () => {
    const choices = ['a', 'b', 'c'] as const;

    test('should return value when in choices', () => {
      setEnv('TEST_ENUM', 'b');
      expect(StrictEnvResolver.resolve('TEST_ENUM', StrictEnvType.Enum(choices))).toBe('b');
      unsetEnv('TEST_ENUM');
    });

    test('should return trimmed value when surrounded by whitespace', () => {
      setEnv('TEST_ENUM', '  b  ');
      expect(StrictEnvResolver.resolve('TEST_ENUM', StrictEnvType.Enum(choices))).toBe('b');
      unsetEnv('TEST_ENUM');
    });

    test('should return default when missing', () => {
      unsetEnv('TEST_ENUM');
      expect(StrictEnvResolver.resolve('TEST_ENUM', StrictEnvType.Enum(choices), { default: 'a' })).toBe('a');
    });

    test('should throw when value is not in choices', () => {
      setEnv('TEST_ENUM', 'x');
      expectResolveValidationError(
        () => StrictEnvResolver.resolve('TEST_ENUM', StrictEnvType.Enum(choices)),
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
      expect(() => StrictEnvResolver.resolve('TEST_ENUM', StrictEnvType.Enum(choices))).toThrow(
        'Missing required environment variable: TEST_ENUM',
      );
    });
  });
});

describe('StrictEnvResolver.resolveAll', () => {
  test('should return parsed values with defaults', () => {
    setEnv('TEST_PORT', '1234');
    unsetEnv('TEST_MODE');

    const envs = StrictEnvResolver.resolveAll({
      TEST_PORT: StrictEnvType.Number,
      TEST_DEBUG: [StrictEnvType.Boolean, { default: false }],
      TEST_MODE: [StrictEnvType.Enum(['read', 'write'] as const), { default: 'read' }],
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
    const envs = StrictEnvResolver.resolveAll({
      TEST_PORT: [StrictEnvType.Number, { default: 3000 }],
    });
    expect(envs).toEqual({ TEST_PORT: 3000 });
    unsetEnv('TEST_PORT');
  });

  test('should collect invalid_number for non-numeric env value', () => {
    setEnv('TEST_PORT', 'not-a-number');

    try {
      StrictEnvResolver.resolveAll({ TEST_PORT: StrictEnvType.Number });
      throw new Error('Expected resolveAll to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(StrictEnvValidationError);
      const ve = e as StrictEnvValidationError<'TEST_PORT'>;
      expect(ve.errors).toEqual([
        {
          key: 'TEST_PORT',
          message: 'Env TEST_PORT: expected number, got "not-a-number"',
          raw: 'not-a-number',
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
      StrictEnvResolver.resolveAll({
        TEST_PORT: StrictEnvType.Number,
        TEST_MODE: StrictEnvType.Enum(['read', 'write'] as const),
      });
      throw new Error('Expected resolveAll to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(StrictEnvValidationError);
      const ve = e as StrictEnvValidationError<'TEST_PORT' | 'TEST_MODE'>;
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
    setEnv('TEST_WORKERS', 'not-a-number');
    setEnv('TEST_MODE', 'invalid');

    try {
      StrictEnvResolver.resolveAll({
        TEST_PORT: StrictEnvType.Number,
        TEST_WORKERS: StrictEnvType.Number,
        TEST_MODE: StrictEnvType.Enum(['read', 'write'] as const),
      });
      throw new Error('Expected resolveAll to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(StrictEnvValidationError);
      const ve = e as StrictEnvValidationError<'TEST_PORT' | 'TEST_WORKERS' | 'TEST_MODE'>;
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
          message: 'Env TEST_WORKERS: expected number, got "not-a-number"',
          raw: 'not-a-number',
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

    const envs = StrictEnvResolver.resolveAll({
      TEST_DEBUG: StrictEnvType.Boolean,
      TEST_VERBOSE: StrictEnvType.Boolean,
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

    const envs = StrictEnvResolver.resolveAll({
      TEST_MODE: StrictEnvType.Enum(['read', 'write'] as const),
      TEST_LABEL: StrictEnvType.String,
    });

    expect(envs).toEqual({
      TEST_MODE: 'write',
      TEST_LABEL: 'my-app',
    });

    unsetEnv('TEST_MODE');
    unsetEnv('TEST_LABEL');
  });
});
