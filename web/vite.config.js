import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const canonicalTerms = normalizePath(fileURLToPath(new URL('../lib/canonical.js', import.meta.url)));

function canonicalTermsInterop() {
  return {
    name: 'latepay-canonical-commonjs-interop',
    enforce: 'pre',
    transform(source, id) {
      // Vite reports ids with forward slashes, so an unnormalized Windows path never matches here.
      if (normalizePath(id.split('?')[0]) !== canonicalTerms) return null;

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

/**
 * Give the dev page the same operator token the local service accepts.
 *
 * `npm run dev` generates one token and passes it to both children, so the
 * proxied API calls are authorized. It applies to the dev server only: a
 * production bundle never carries a token.
 */
function operatorTokenMeta() {
  return {
    name: 'latepay-operator-token-meta',
    apply: 'serve',
    transformIndexHtml(html) {
      const entry = (process.env.WEB_OPERATOR_TOKENS ?? '').split(',')[0]?.trim() ?? '';
      const token = entry.includes(':') ? entry.slice(entry.indexOf(':') + 1).trim() : '';
      if (!token) return html;
      return {
        html,
        tags: [{ tag: 'meta', attrs: { name: 'latepay-operator-token', content: token }, injectTo: 'head-prepend' }],
      };
    },
  };
}

export default defineConfig({
  envDir: repositoryRoot,
  plugins: [canonicalTermsInterop(), operatorTokenMeta(), react()],
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
