/**
 * Shared Tailwind preset for all three SPAs.
 *
 * Phase 0: minimal — extends from compliance-frontend's existing tailwind.config.
 * Phase 2+: design tokens for color palette, spacing, typography
 * will be consolidated here as design system matures.
 */

export const tailwindPreset = {
  theme: {
    extend: {
      // Color palette, spacing, typography tokens go here
      // Currently: each app maintains its own tailwind.config.js
    },
  },
}
