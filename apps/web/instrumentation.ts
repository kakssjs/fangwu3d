export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startRunner } = await import('./lib/runner');
    startRunner();
  }
}
