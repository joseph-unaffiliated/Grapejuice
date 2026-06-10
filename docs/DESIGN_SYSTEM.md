# Grapejuice Pilot Design System

Canonical UI spec for `grapejuice/pilot-app`, inferred from Figma file **rGzXYb1rNVxqGHz81835Jn** (Hanukkah pilot), [`assets/visuals/colors.md`](../assets/visuals/colors.md), and accent rules in [`assets/visuals/BRAND_RULES.md`](../assets/visuals/BRAND_RULES.md).

## Theme modes

| Mode | When | Surfaces | Accent |
|------|------|----------|--------|
| **Parent (Figma-light)** | Grown-up profile, auth, onboarding | White `#FFFFFF`, cream elevated `#F4EEE4` | Gold `#D8C990` |
| **Kid** | Child profile active | Dark `#090113`, elevated `#430F6A` | Pink `#E16FFF` |

Kid mode uses **identical layout, typography, radii, shadows, and component structure**. Only semantic colors swap via `useThemeMode()` / `kidSemantic` in `themeMode.ts`.

---

## Typography

**Font:** DM Sans only (`@expo-google-fonts/dm-sans`).

| Token | Size | Weight | Letter-spacing | Use |
|-------|------|--------|----------------|-----|
| `sm` | 11px | 200 ExtraLight | -0.22 | Subtitles, chips, hints, micro CTAs |
| `lg` | 13px | 400 Regular | -0.26 | Pills, search, button labels |
| `xl` | 14px | 400 | -0.26 | Section titles |
| `titleLg` | 16px | 400 | -0.32 | Hero titles |
| `headerLg` | 17px | 700 | — | Screen titles |

**Rules:**
- Apply `typography.fontFamily.regular` globally on `Text` / `TextInput`.
- Secondary copy on parent screens: prefer `goldMuted` (`#B8AC7F`) over generic gray neutrals.
- Use `fontFamily.light` (200) for chip and category labels.

---

## Color (parent — Figma-light)

| Role | Token | Hex |
|------|-------|-----|
| Screen background | `bgPrimary` | `#FFFFFF` |
| Elevated card | `bgElevated` | `#F4EEE4` |
| Brand / links | `brand` | `#D8C990` |
| Muted secondary | `goldMuted` | `#B8AC7F` |
| Primary text | `textPrimary` | `#111827` |
| On gold fill | `textInverse` | `#FFFFFF` |

**Accent-only (BRAND_RULES):** Cream, lavender, vibrant purple, and magenta may appear as chips, input highlights, or small strips — never as full-page or full-card backgrounds on parent UI.

**Gold vs purple:** Gold must not touch lavender or vibrant purple in the same component. Gold on white, warm brown, or off-black is allowed.

---

## Color (kid)

| Role | Token | Hex |
|------|-------|-----|
| Screen | `bgPrimary` | `#090113` |
| Surface | `bgDark` | `#17001D` |
| Elevated card | `bgElevated` | `#430F6A` |
| Accent | `brand` | `#E16FFF` |
| Secondary text | `textSecondary` / `goldMuted` | `#B8AC7F` |
| Primary text | `textPrimary` | `#FFFFFF` |

Gold-glow shadows may remain on kid surfaces (structural); optional future: pink-tinted glow.

---

## Shadows

Signature **gold glow:** `rgba(216, 201, 144, 0.50)`

| Preset | Use |
|--------|-----|
| `shadowsWeb.goldGlowSm` (8px) | Auth pills, search pill, small CTAs |
| `shadowsWeb.goldGlow` (12–16px) | Hero cards, My Boxes, sticky header, tab bar |
| `shadows.goldGlow` | Native equivalent |

Avoid generic gray `shadows.card` on marketing/hero surfaces when Figma specifies gold glow.

---

## Spacing

| Token | px | Use |
|-------|-----|-----|
| `MOBILE_GUTTER` | 24 | Horizontal padding on phone layouts |
| Section gap | 24 | Between major scroll sections |
| Header group gap | 16 | Search + chips, title blocks |
| Tight stack | 8 | Rows within cards |

Web: use `WebContentPanel`, `LAYOUT` breakpoints (768 / 1024).

---

## Cards

| Type | Radius | Background | Shadow | Border |
|------|--------|------------|--------|--------|
| Hero / collection | 16px | white or cream | `goldGlow` | none |
| My Boxes welcome | 16px, min-h 420 | white | `goldGlow` | none |
| Phase / promo | 16px | cream or white | sm gold or 1px gold | optional |
| Guide night (accordion) | 4px (`md`) | white; expanded `brandLight` | none | 1px `border` |
| Catalog rail container | 16px pad | white | `goldGlow` on rail | — |

Use `GrapejuiceCard` variants: `hero`, `surface`, `bordered`.

---

## Buttons

| Variant | Radius | Style |
|---------|--------|-------|
| **pill** (auth, guest) | 40px | White bg + `goldGlowSm`, 13px centered text |
| **pillOutline** | 40px | 1px `brand` border, white/transparent bg |
| **filled** (checkout) | 40px or 4px dense | `brand` fill + `textInverse` |
| **text link** | — | `brand` or `goldMuted`, 11–13px |
| **get-started gradient** | pill | Holiday row exception — gradient fill per Figma 370:3027 |

Use `GrapejuiceButton` — do not invent new radius values per screen.

---

## Chips

| Type | Radius | Border | Type |
|------|--------|--------|------|
| Category (370:2954) | 32px | 0.5px `#D8C990` | 11px extralight |
| Rav starter (366:1762) | 8px (`chip`) | `goldMuted` | 11px extralight |
| Search pill | 40px | none | 13px, h=37px |

---

## Navigation

**Tab bar (366:1799):** pad top 16 / bottom 24, icons 26px, gap 24–40, gold upward glow on web. Active: `textPrimary`; inactive: `goldMuted`.

**Section nav (370:3524):** 11px weight 200, gold 0.5px bottom rule, 1px black active indicator.

---

## Code conventions

1. **Theme-aware UI:** Use `useThemeMode().colors` in screens and components (not static `semanticColors`).
2. **Static `semanticColors`:** Auth, onboarding, and non-themed utilities only.
3. **Presets:** Import from `designPresets.ts` for cards, buttons, chips, text styles.
4. **Primitives:** Prefer `GrapejuiceButton` / `GrapejuiceCard` for new CTAs and cards.

---

## Figma reference nodes (in repo)

| Node | Screen / component |
|------|-------------------|
| 366:954 | Guest auth prompt |
| 366:1762 | Rav search pill |
| 366:1799 | Tab bar |
| 370:2949 | Home (no boxes) |
| 370:3426 | Hero card |
| 370:3514 | My Box sections |
| 370:3524 | Sticky section nav |
| 384:487 | Catalog product rail |

---

## Related files

- Tokens: `src/constants/theme.ts`, `src/constants/designPresets.ts`
- Kid palette: `src/constants/themeMode.ts`
- Cursor rule: `.cursor/rules/grapejuice-pilot-design.mdc`
