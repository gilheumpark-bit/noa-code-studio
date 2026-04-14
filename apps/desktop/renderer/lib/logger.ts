// ============================================================
// logger — General-purpose console wrapper with env-aware filtering
// ============================================================

const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

function fmt(ctx: string, args: unknown[]): unknown[] {
  return ctx ? [`[${ctx}]`, ...args] : args;
}

export const logger = {
  /** Informational messages — suppressed in production */
  info(ctx: string, ...args: unknown[]): void {
    if (!isProd) console.log(...fmt(ctx, args));
  },
  /** Debug messages — suppressed in production */
  debug(ctx: string, ...args: unknown[]): void {
    if (!isProd) console.debug(...fmt(ctx, args));
  },
  /** Warnings — always emitted */
  warn(ctx: string, ...args: unknown[]): void {
    console.warn(...fmt(ctx, args));
  },
  /** Errors — always emitted */
  error(ctx: string, ...args: unknown[]): void {
    console.error(...fmt(ctx, args));
  },
};

export default logger;

// IDENTITY_SEAL: PART-1 | role=env-aware-console-wrapper | inputs=context,args | outputs=filtered-console-output
