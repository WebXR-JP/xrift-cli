/**
 * Custom Jest resolver for handling ESM .js extension imports
 *
 * - For source files (non-node_modules): strips .js extension (TypeScript ESM convention)
 * - For @xrift/sdk CJS files: maps .js to .cjs extension
 * - Everything else: default resolution
 */
module.exports = (path, options) => {
  const defaultResolver = options.defaultResolver;

  // If the request is a relative .js import from within @xrift/sdk CJS files,
  // try resolving as .cjs first
  if (
    path.endsWith('.js') &&
    options.basedir &&
    options.basedir.includes('node_modules/@xrift/sdk')
  ) {
    try {
      return defaultResolver(path.replace(/\.js$/, '.cjs'), options);
    } catch {
      // Fall through to try other resolutions
    }
  }

  // For relative .js imports from source files (not node_modules),
  // strip .js extension (TypeScript ESM convention)
  if (
    path.match(/^\.{1,2}\//) &&
    path.endsWith('.js') &&
    options.basedir &&
    !options.basedir.includes('node_modules')
  ) {
    try {
      return defaultResolver(path.replace(/\.js$/, ''), options);
    } catch {
      // Fall through to default resolution
    }
  }

  return defaultResolver(path, options);
};
