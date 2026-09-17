// Test-only stub for the "server-only" package.
//
// Next.js's bundler aliases "server-only" to a module that throws when
// pulled into a client bundle, and to a no-op when it's actually running
// server-side. Vitest has no such bundler pass, so the real package
// (which throws unconditionally outside that aliasing) would fail every
// test that imports server-side code. This stub restores the "running
// server-side" behavior for tests, which is the correct environment for
// all of this project's Vitest suites (they never test client bundles).
export {};
