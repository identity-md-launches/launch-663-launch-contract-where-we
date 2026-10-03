# Website validation and Better Interface review

**Complete for the stated scope.** Worker observations from 2026-10-03, ending at approximately 05:46 UTC. This report does not claim independent network certification. No contract, token, deployment or live vote transaction was created or changed.

## Scope and assumptions

One English, light-theme page: connect an injected wallet, select a Sepolia ETH payment, submit `vote()`, follow its receipt and read the top three cumulative payers. “Login” means wallet account connection because there is no private content or backend authentication requirement. Real onchain data is never substituted with production demo values. Empty slots stay visibly empty. Payments are permanent and rankings use cumulative payment rather than vote count.

Source: `web/src/`; locked frontend packages: `web/package.json`, `web/package-lock.json`; export: root `dist/`. The exact contract ABI/runtime and pinned chain facts remain in `web/src/contract.json` after assignment inputs are removed.

## Commands and actual outcomes

| Check | Actual result |
| --- | --- |
| `bash web/scripts/build.sh` | Exit 0. Clean temporary install outside repository; 23 packages installed; typecheck, tests, production build and export check passed; temporary install removed on exit. |
| `npm run typecheck` in its staged `web/` | `tsc --noEmit`, exit 0. |
| `node --test <staged-web>/tests/codec.test.mjs` | 10 tests, 10 passed, zero failed/skipped; approximately 333ms in the clean run. |
| `npm run build` in its staged `web/` | Vite 7.1.7, 36 modules, exit 0; final run took 6m31s in this worker. |
| `python3 web/scripts/check-export.py` | Exit 0; five files, 230,048 bytes, three relative HTML resource references; every referenced asset exists; no source maps, dependency archives, caches or oversized assets. |
| `python3 web/scripts/verify-contract.py` | Exit 0. Exact pinned source, canonical ABI hash, creation hash and runtime match. Two pinned RPCs completed chain/code/state checks. Third endpoint timed out on one state call. See `web/CONTRACT_VERIFICATION.md`. |
| Independent `cast sig` checks | Five UI function selectors matched the compiled ABI and codec test fixtures. |
| Protected paths comparison | `git diff --exit-code -- foundry.toml foundry.lock remappings.txt .gitmodules lib/ package.json package-lock.json .gitignore .github/` returned 0. No existing build configuration/dependency or ignore file changed. |

The initial broad dependency build was slow; two bounded diagnostic builds timed out. The final frontend uses React and a small ABI codec with `@noble/hashes`, and its complete clean build passed. A synthetic codec test initially used an incorrectly sized test address; the fixture was corrected and the final 10-test suite passed. These were development checks, not hidden successful results.

Final generated JS/CSS names are `assets/index-srQEGoTg.js` and `assets/index-BSUOdNOi.css`. Final rebuild reproduced the same files inspected in the browser. All dependency installations/caches stayed outside the repository. No ignore files were edited and no submodule was introduced. Raw submission bytes, including existing tracked source and retained screenshots, remain under 1.6 MiB, below the 8 MiB limit; `artifacts/submission-size.json` records the final inventory.

## Production browser checks

The assigned Chromium browser was available, but its tool-managed `test/scratch/browser/preview.json` was absent. `web/scripts/prepare-browser.py` built a bounded Playwright route harness that fulfilled requests under `http://localhost:4173/preview/` with **unmodified production bytes**. The browser resolved the relative JS, CSS and favicon URLs itself. There was no persistent preview server. This checks subpath resources in a browser, not deployment-host headers, DNS or TLS configuration.

Two separate sessions were used:

1. Real pinned public RPC reads, with no wallet provider or mock state. Final export loaded successfully, reported zero votes/zero ETH and three open slots. Latest fresh-session console: **0 errors, 0 warnings**. The final real read used the new codec. All local static resource requests returned 200.
2. A mock EIP-1193 wallet and public RPC fixtures for transaction branches. Mock addresses and amounts exist only in test scaffolding and screenshot evidence. No signing key, real wallet confirmation or transaction broadcast was used.

Meaningful interaction checks passed on the final production JS/CSS:

- Missing-wallet guidance and invalid amount focus; a zero-value attempt remained local.
- Rejected connection recovered; connection requested accounts; wrong network switched with the `4902` add-chain fallback.
- Six invalid input cases were blocked: zero, negative, exponent, letters, 19 decimals and empty. Field validity and focus were asserted.
- Preset selection updated the amount. Wallet signature rejection and insufficient balance recovered. Runtime bytecode mismatch blocked sending.
- Vote request inspected: chain `0xaa36a7`, recipient `0x171985d413bcea96306a6fb55055d103a6a91cfa`, selector `0x632a9a52`, selected mock sender, exact 0.005 ETH value `0x11c37937e08000`.
- Pending state disabled submission; an extra form-submit event did not create a second transaction. Reload restored the stored pending hash.
- Confirmed receipt refreshed votes from 12 to 13 and updated totals/leaderboard. Reverted receipt displayed its gas caveat and restored the action.
- “Stop tracking” showed its native risk confirmation, cleared the stored pending hash and restored the action while retaining the transaction link. The browser tool reported the dialog before the rest of the script finished; a subsequent check observed its final assertion state.
- An account change during preflight prevented sending. A newer account event remained displayed when a deliberately delayed initial wallet read returned an older account.
- Deliberate RPC 503 responses marked the existing board outdated and disabled voting. Refresh recovered after the mock outage ended. The expected 503 console entries were confined to that fault-injection test; they are not treated as production resource failures.
- Keyboard Tab sequence exposed skip link, home link and wallet action. Enter connected, Space selected a preset, and Enter switched networks. The focused preset’s visible outline was viewed and saved.

Executed browser test sources: `web/tests/browser-interactions.js`, `web/tests/check-primary.js`, `web/tests/check-recovery.js`. Codec tests independently cover ABI encoding/decoding, exact uint256 bounds and one-wei precision; they do not just mirror button text.

## Six-domain coverage

| Domain | Status and evidence | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility | **Checked.** Native elements, bound input/select labels, ordered list, H1/H2 landmarks, skip link, full address names and ETH units, field focus/invalid state, persistent status/alert regions, visible 2px keyboard ring, mobile control sizes. Keyboard interaction walk and accessibility snapshots inspected. | Actual screen-reader session, voice control and physical touch targets unperformed. Snapshots are not screen-reader tests. Native confirmation dialog was exercised, not audited with assistive technology. |
| Layout | **Checked.** Source logical properties/DOM order; desktop two-column and mobile stacked panels. Screenshots viewed at 1280, 760 and 320px. Scroll-width checks at 1280, 880, 760, 700, 440, 390 and 320px found no horizontal overflow. Full uint256 amount also fit at 320px. | Browser-native 200% zoom and RTL mirror unperformed. Supported language is English. Root text enlargement to 200% at 1280px was checked separately and retained width. |
| Writing | **Checked.** Action labels map to handlers; errors have recovery actions; permanent retention, extra gas, test network, cumulative ranking and ties disclosed. Redundant footer slogan removed. | Localization is outside scope. |
| Typography | **Checked.** Monospace family, positive readable sizes, hierarchy, unitless line heights, tabular numbers, selectable values, exact unrounded ETH, address access, responsive wrapping and 16px mobile wallet select. | OS fallback font files and physical iOS zoom unperformed; computed family alone does not prove the same font on every platform. |
| Colors | **Checked.** Shared semantic tokens and actual rendered foreground/background pairs measured; selected, default, error and hover colors inspected. Text and functional boundary pairs meet the tested thresholds below. | Forced-colors rendering unperformed (source fallback present). Additional theme is **Not applicable**; only light theme is implemented. |
| UI | **Checked.** Default, hover, focus, selected, disabled, loading, empty, populated, error, pending, confirmed/reverted and stale/retry states exercised. ASCII frame and flat rectangular controls preserve the requested direction. | Motion slowdown/reduced-motion animation checks **Not applicable**: no animations or transitions. No custom icon system, media player or custom modal. |

### Contrast measurements

Measured from computed browser colors, using WCAG sRGB relative luminance. All surfaces below are opaque; transparent ancestors were resolved to the page background.

| Pair | Measured contrast |
| --- | ---: |
| Main text `#242820` / page `#f5f4ee` | 13.62:1 |
| Secondary text `#646a59` / page | 5.09:1 |
| Primary button and first-rank inverse text | 13.62:1 |
| Selected preset text `#242820` / `#ebece3` | 12.61:1 |
| Input boundary `#777c6c` / page | 3.90:1 |
| Focus outline `#3e5333` / page | 7.65:1 |
| Hover button text `#f5f4ee` / `#3e5333` | 7.65:1 |

Text pairs exceed 4.5:1; field boundary and focus exceed 3:1. Decorative row separators are not used as control boundaries. These measured pairs do not establish whole-site accessibility compliance.

## Findings, fixes and rechecks

| Severity / domain | Source location | Finding and correction | Recheck |
| --- | --- | --- | --- |
| High / UI | `web/src/App.tsx:194` | A dropped/replaced transaction could hold the UI in pending indefinitely. Added explicit stop-tracking recovery with a warning confirmation and retained explorer link. | Mock pending transaction recovered; session hash cleared; vote re-enabled. |
| Medium / UI | `web/src/App.tsx:69` and `:83` | Initial wallet reads could overwrite a newer event. Independent account/chain event counters guard those initial results. | Delayed old address `0x6666…` did not replace new `0x5555…`. |
| Medium / accessibility | `web/src/App.tsx:207` | Hidden visual column labels left a bare numeric score for assistive readers. Added hidden “ETH paid” to every populated score. | Final DOM/text includes full unit; accessibility names/source checked. No real screen-reader claim. |
| Low / typography | `web/src/style.css:141` | Wallet select inherited small caption text on mobile. Added 16px mobile select font size. | Source and final CSS checked; physical iOS unperformed. |
| Low / writing | `web/src/App.tsx:217` | Footer slogan was redundant for the requested minimal site. Replaced it with useful test-network context. | Final live and mock screenshots show “Sepolia testnet.” |

No unresolved blocker was observed in the tested scope. Broader real-wallet compatibility is a remaining validation limit, not a claim established by the mock provider.

## Screenshot evidence

- `artifacts/live-desktop.png`: final export, 1280px, actual Sepolia reads, disconnected, empty leaderboard.
- `artifacts/desktop.png`: final export, 1280px, mock connected wallet and three populated ranks.
- `artifacts/mobile.png`: final export, 320px, same mock populated state, full page.
- `artifacts/focus.png`: final export, 1280px, keyboard-focused preset with visible ring.

Images were genuinely generated and viewed. The populated screenshots are explicitly mock evidence, not records of live payers. Screenshots and source review are not substitutes for the transaction or build checks above.

## Remaining limits

No real wallet extension popup, hardware-wallet signing, submitted Sepolia vote, physical mobile device, non-Chromium browser, screen-reader session, native browser zoom, RTL mirror or forced-colors rendering was tested. No faucet, explorer external navigation or publication was performed. Public RPC uptime and cross-origin availability can change; fallback and retry were tested. Static asset loading is self-contained, but live chain reads and voting require network access. There is no WalletConnect flow for mobile browsers without an injected wallet.

Better Interface’s pinned core principles were read across all six domains during construction and applied in this review. Design knowledge: Jakub Krehel, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`; documentation method: Paul Bakaus, Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Attribution and both licenses remain in `web/DESIGN_GUIDANCE_LICENSE.txt` and `artifacts/design-guidance-LICENSE.txt`.
