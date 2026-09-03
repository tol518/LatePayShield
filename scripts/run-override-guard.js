/* Run the verifier override guard at Coston2's chain ID, on any platform.
 *
 * The guard has to load Hardhat with `HARDHAT_CHAIN_ID=114` so the local
 * network reports a live chain ID and the constructor's override refusal is
 * exercised. The npm script used to do that with `VAR=value command`, which is
 * POSIX-only and fails in Windows `cmd.exe` — so `npm test` and `npm run check`
 * could not be run at all on Windows, even though the tests themselves pass
 * there when the variable is set through PowerShell.
 *
 * Setting the variable here instead makes one command work everywhere. npm puts
 * `node_modules/.bin` on PATH for a lifecycle script, so `hardhat` resolves to
 * the local install on both platforms; `shell: true` is what lets the same
 * command string work in `cmd.exe` and in a POSIX shell.
 */

const { spawnSync } = require('node:child_process');

const CHAIN_ID = '114';
const COMMAND = 'hardhat test test/VerifierOverrideGuard.test.js';

const result = spawnSync(COMMAND, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, HARDHAT_CHAIN_ID: CHAIN_ID },
});

if (result.error) {
  console.error(`Could not start Hardhat: ${result.error.message}`);
  process.exit(1);
}

// A signal has no exit code, so failing closed keeps a killed run from looking
// like a pass to CI.
process.exit(result.status ?? 1);
