# Current-Main Documentation Restructure Plan

**Goal:** Apply the approved task-routed documentation system on top of the merged protocol foundation without losing or overstating teammate work.

**Base:** Remote `main` commit `e459042` in isolated branch `docs/restructure-current-main`.

## Constraints

- Preserve the original dirty checkout and its uncommitted documentation as a reference.
- Treat code, executable tests, live network lookups, and CI as evidence; treat plans and mocks as their actual weaker level.
- Do not change contract/application behavior during the documentation migration.
- Do not commit, push, or merge without explicit user approval.

## Tasks

- [x] Audit local and remote branch state without mutation.
- [x] Fetch current `main` and create an isolated worktree.
- [x] Read all root instructions, README, manifests, code, tests, CI, evidence, and security configuration.
- [x] Establish a Node 24 baseline and distinguish the Windows package-script defect from contract test results.
- [x] Verify the committed XRPL transaction against the live Testnet.
- [x] Verify current GitHub Actions and runtime-audit status.
- [x] Replace duplicated root instructions with a minimal router.
- [x] Split product, architecture, design, data/contract, testing/demo, status, and decision ownership.
- [x] Preserve the detailed hackathon playbook as reference material.
- [x] Validate local Markdown links and stale forced-context instructions.
- [x] Re-run compile/tests after documentation changes.
- [x] Audit the complete diff for secrets, overclaims, and unrelated changes.
- [x] Leave the branch uncommitted for user review.
