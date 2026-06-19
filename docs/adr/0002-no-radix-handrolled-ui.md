# 0002 — Hand-rolled Preact + Tailwind UI, no Radix/shadcn dependency

## Status
accepted (2026-06-19)

## Context
The design (spec §7) assumed `preact/compat` would let React-source shadcn components paste in unchanged, including the complex ones (Dialog, Combobox). shadcn's interactive components are built on Radix UI, which leans heavily on React internals (`Slot`/`asChild`, `useId`, `React.Children`, `useLayoutEffect`, portals) that behave unreliably under `preact/compat`. The spec already abandoned Radix for the Dialog (native `<dialog>`), tacitly conceding the point; Combobox (Popover + `cmdk`) depends on Radix even more.

## Decision
No Radix, no shadcn CLI / copy workflow. The handful of primitives the app needs (Dialog via native `<dialog>`, Tabs, Switch, Combobox, Button, …) are hand-rolled in Preact + Tailwind 4, with shadcn used only as a **visual reference**, not a code dependency. `components.json` is dropped (or kept solely for Tailwind theme alignment). Emphasis on disciplined componentization since the page count is small.

## Consequences
- No per-component "does it survive preact/compat" roulette; the trade-off is writing ~6–8 primitives by hand, which is small given the limited page count.
- A future contributor tempted to "add shadcn properly" should read this first — the obstacle is Radix-under-compat, not missing setup.
- Spec §7's shadcn / `components.json` language is superseded.
