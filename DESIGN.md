# paid.vote design

## Overview

A single wallet voting page with an ASCII wordmark, monospace text, square controls and a quiet paper background. The primary task is entering an amount and voting; the adjacent list shows the top three cumulative payers. The implementation is in `web/src/App.tsx` and `web/src/style.css`. There is no component library, image hero, animation, dark theme or external font service.

## Colors

CSS defines a small hex palette and semantic roles at `web/src/style.css:1`:

| Semantic token | Value | Use |
| --- | --- | --- |
| `--color-page` | `#f5f4ee` | Page and field backgrounds |
| `--color-surface` | `#ebece3` | Selected presets and disabled action |
| `--color-text` | `#242820` | Main text |
| `--color-muted` | `#646a59` | Labels, disclosures, secondary information |
| `--color-line` | `#c9ccc0` | Decorative separators |
| `--color-control-border` | `#777c6c` | Fields, frame, preset boundaries |
| `--color-action` / `--color-on-action` | `#242820` / `#f5f4ee` | Primary button |
| `--color-focus` | `#3e5333` | Focus outline and primary hover |
| `--color-error` | `#9b3528` | Error messages and invalid field border |

These roles refer to neutral, green and red primitives; components consume semantic names. Status always has text as well as a symbol. The first rank uses inverse text as a rank marker, rather than another action.

Browser measurements: primary text and button text 13.62:1; muted text on the page 5.09:1; selected preset text 12.61:1; input boundary against page 3.90:1; focus outline against page 7.65:1. See `VALIDATION.md` for coverage and limits.

## Typography

`--font-mono` is `'Courier New', Courier, monospace`, provided by the system. No font download is required; appearance can vary by OS. Normal and bold are requested, and synthetic faces are disabled. Computed font family was inspected; individual OS font files were not audited.

- Root: 16px, unitless line-height 1.5, tabular numbers, root font smoothing.
- `--text-small`: 13px; `--text-body`: 14px; `--text-heading`: 18px. Supporting desktop captions use 12px. Mobile disclosures increase to 13px.
- The accessible H1 is “Paid voting.” Its visible ASCII wordmark is hidden from assistive technology, uses preformatted text, `line-height: 1.05`, `letter-spacing: -.04em`, and a responsive `clamp()` size.
- H2 headings are bold, 18px with line-height 1.2; the leaderboard heading becomes 16px in narrower layouts.
- Amount input: 28px. Mobile wallet selection: 16px to avoid small-input zoom.
- Addresses are shortened visually; full addresses remain in the link label, title and explorer destination. ETH values retain every decimal and wrap rather than silently round or truncate.

## Layout

`.shell` is at most 1064px wide including 32px side padding. Shared spacing tokens are 8, 16, 24, 32, 48 and 64px. Compact control gaps use 10–12px. Group headings, fields and disclosures align to the panel edges.

Desktop uses a two-column `.workspace`, with `minmax(0, .86fr)` and `minmax(0, 1.14fr)`. Panels have 32px padding. The header is at least 100px tall; the hero has 66px top and 58px bottom spacing. Content stays in normal document flow.

- At 880px: shell and panels use 24px padding; the grid becomes 1:1.15; the header’s “testnet” suffix hides (the footer and amount label retain network context).
- At 700px: panels stack in DOM order, vote form first; panel padding becomes 28px, presets become at least 44px tall, and the footer wraps.
- At 440px: shell padding is 20px; panels use 24px vertical/20px horizontal padding; the header’s wallet controls stack; the secondary hero note and decorative list index hide.

Rendered checks at 1280, 880, 760, 700, 440, 390 and 320px found no horizontal overflow, including a full uint256 amount at 320px. Root text enlargement to 200% at 1280px also retained page width. This is not a browser-native zoom test.

## Elevation & Depth

Flat surfaces only: no shadows or overlays. Solid frame and field borders carry structure; dashed separators suggest a text terminal. Selected controls use the surface token. Two decorative plus signs interrupt the frame’s top corners and never capture pointer input.

## Shapes

All buttons, inputs and selects use zero corner radius. Native select controls and native confirmation dialogs retain platform behavior. The SVG favicon repeats the small `v_` wordmark; it is a local asset, not an icon dependency.

## Components

These are patterns inside `App`, not separately exported library components:

| Pattern | Source classes | Behavior |
| --- | --- | --- |
| Header wallet action | `.connect`, `.wallet-select` | Connect/disconnect; select among discovered wallets; disabled while an action or transaction is pending |
| Amount entry | `.amount-field`, `.presets` | Labeled decimal input, three selected-state presets, inline errors, focus returns to invalid input |
| Primary action | `.primary` | Connect → switch network → vote; explicit wallet/pending labels; duplicate submission guard |
| Transaction feedback | `.feedback`, `.error`, `.stop-tracking` | Persistent live status, explorer link, rejection/revert errors; native confirmation before abandoning receipt tracking |
| Ranked list | `.leaderboard`, `.rank`, `.voter`, `.score` | Ordered list, three slots, full accessible addresses and ETH units, first-rank badge, connected-wallet marker |
| Board status | `.refresh`, `.totals`, `.sync-status` | Loading, live totals, empty slots, stale/offline state and explicit retry |

Keyboard focus uses a 2px solid outline offset by 4px; forced-colors mode uses `Highlight`. Controls are native buttons, links, inputs and selects. The skip link becomes visible on focus. Primary action is at least 56px tall, wallet links/actions and mobile presets at least 44px. There are no custom focus traps or motion sequences.

## Do's and Don'ts

- Reuse the semantic colors, `.shell`, section headings and spacing before adding new styles.
- Keep one filled action per view; use bracketed or outlined secondary actions.
- Keep the permanent-payment, gas, network and cumulative-ranking explanations. Remove incidental slogans before removing consequential information.
- Preserve exact bigint amounts and full accessible wallet addresses.
- Start an additional section with the existing heading and panel patterns; keep reading order unchanged when its grid collapses. Use hash navigation if a second view is ever needed on static hosting.
- Avoid rounded cards, ornamental gradients, external font requests and animated terminal effects; they are absent from this implementation.

Design review used Jakub Krehel’s Better Interface (MIT), pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method was adapted from Paul Bakaus’s Impeccable (Apache-2.0), commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, copyright 2025 Paul Bakaus. Both license texts and attribution are retained in `web/DESIGN_GUIDANCE_LICENSE.txt`.
