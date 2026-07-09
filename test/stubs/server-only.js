// Stub for the "server-only" package (not an installed dependency — Next.js
// vendors it and aliases it internally during `next build`/`next dev`, so it
// only ever resolves inside Next's own webpack bundling). Several lib/*.ts
// files do `import "server-only"` as a guard against being bundled into a
// client component. Vitest runs those files directly under plain Node, with
// no Next bundler in the loop, so the real resolution never kicks in —
// aliased here (see vitest.config.ts) to a no-op, mirroring how Next resolves
// this same package to an empty module on the server side.
