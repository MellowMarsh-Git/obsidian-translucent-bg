/**
 * esbuild.config.js
 * =================
 * Build script for Obsidian Translucent BG.
 *
 * Usage:
 *   npm run dev    — development build (source maps, no minification, watch mode)
 *   npm run build  — production build  (minified, no source maps)
 *
 * The entry point is src/main.ts. Output is main.js at the project root,
 * which is the file Obsidian loads as the plugin's compiled bundle.
 *
 * Plugins used:
 *   nodeExternalsPlugin — keeps 'obsidian' and other Node built-ins as external
 *                         imports so they are not bundled (Obsidian provides them)
 *   sassPlugin          — allows importing .scss / .sass files from TypeScript
 *                         (not currently used but kept for future expansion)
 */

const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');
const { sassPlugin } = require('esbuild-sass-plugin');

// Detect production mode: set NODE_ENV=production or pass --prod flag.
const isProd =
    (process.env.NODE_ENV || '').trim() === 'production' ||
    process.argv.includes('--prod');

console.log(`Translucent BG — building in ${isProd ? 'production' : 'development'} mode`);

const config = {
    entryPoints: ['src/main.ts'],
    outfile: 'main.js',
    bundle: true,
    platform: 'browser',
    target: ['es6'],
    format: 'cjs',          // Obsidian plugins must be CommonJS modules
    sourcemap: !isProd,     // Include source maps only in development builds
    minify: isProd,         // Minify only for production
    plugins: [
        nodeExternalsPlugin(), // Externalise 'obsidian', Node built-ins, etc.
        sassPlugin(),          // Support for SCSS imports (future use)
    ],
};

if (isProd) {
    esbuild
        .build(config)
        .then(() => {
            console.log('Build successful — output: main.js');
        })
        .catch((err) => {
            console.error('Build failed:', err);
            process.exit(1);
        });
} else {
    esbuild
        .context(config)
        .then((ctx) => ctx.watch())
        .then(() => {
            console.log('Watching for changes — output: main.js (Ctrl+C to stop)');
        })
        .catch((err) => {
            console.error('Watch failed:', err);
            process.exit(1);
        });
}
