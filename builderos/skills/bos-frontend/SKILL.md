---
name: bos-frontend
description: BuilderOS anti-slop frontend guidance for UI, landing pages, dashboards, and redesigns. Use for any user-facing interface.
---

# BuilderOS Frontend

Ship interfaces that don't look templated. Taste is deliberate, not default.

## Before styling
- Name the design direction in one line (e.g. "editorial, high-contrast, generous whitespace"). Commit to it.
- On a redesign: audit the existing UI first — list what's wrong before changing anything.
- Pick a real type scale and a spacing scale. Use them consistently; don't eyeball pixels.

## Do
- One accent color used with intent; a neutral ramp for everything else.
- Clear visual hierarchy: size, weight, and space do the work — not borders everywhere.
- Mobile-first layout; test at 360px and at wide.
- Motion: 150-300ms, ease-out, purposeful. Respect `prefers-reduced-motion`.
- Accessible: semantic HTML, ARIA where needed, keyboard paths, AA contrast, visible focus.
- States for everything interactive: hover, active, focus, disabled, loading, empty, error.

## Avoid (the "AI slop" tells)
- Generic centered hero + three identical feature cards + gradient blob.
- Unmodified default component-library look.
- Emoji as icons in a serious product.
- Walls of equal-weight text with no hierarchy.
- Purple-to-blue gradient on everything.

## Before "done"
- It renders with no console errors, no horizontal scroll on mobile.
- Every interactive element has visible focus and a hover/active state.
- The stated design direction is actually visible in the result.
