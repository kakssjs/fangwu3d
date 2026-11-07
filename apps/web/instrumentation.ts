export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Node's fetch ignores HTTP(S)_PROXY unless asked. On a PC that needs a proxy to reach
    // Agnes, image generation then fails with "fetch failed" (connect timeout).
    // No-op when no proxy is set or the Node version lacks the function.
    const http = await import('node:http');
    (http as { setGlobalProxyFromEnv?: () => void }).setGlobalProxyFromEnv?.();

    const { startRunner } = await import('./lib/runner');
    startRunner();
  }
}
