import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const canonicalTerms = fileURLToPath(new URL('../lib/canonical.js', import.meta.url));

function canonicalTermsInterop() {
  return {
    name: 'latepay-canonical-commonjs-interop',
    enforce: 'pre',
    transform(source, id) {
      if (id.split('?')[0] !== canonicalTerms) return null;

      const transformed = source
        .replace(
          'const { keccak256, toUtf8Bytes } = require("ethers");',
          'import { keccak256, toUtf8Bytes } from "ethers";',
        )
        .replace(
          /module\.exports = \{([\s\S]*?)\n\};\s*$/,
          'export {$1\n};\n',
        );

      if (transformed === source || transformed.includes('module.exports')) {
        throw new Error('The canonical module shape changed; update only this Vite module-format bridge.');
      }

      return { code: transformed, map: null };
    },
  };
}

export default defineConfig({
  plugins: [canonicalTermsInterop(), react()],
  resolve: {
    alias: {
      '@latepay/canonical': canonicalTerms,
    },
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      allow: [repositoryRoot],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
