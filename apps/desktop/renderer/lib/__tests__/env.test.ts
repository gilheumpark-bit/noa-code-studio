describe('env', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('validateEnv returns valid:true when no required vars are missing', async () => {
    // All ENV_VARS in the module have required:false, so validation should pass
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateEnv } = require('../env');
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('envResult is exported and has valid/warnings shape', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { envResult } = require('../env');
    expect(envResult).toHaveProperty('valid');
    expect(envResult).toHaveProperty('warnings');
    expect(typeof envResult.valid).toBe('boolean');
    expect(Array.isArray(envResult.warnings)).toBe(true);
  });
});
