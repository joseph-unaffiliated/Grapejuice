# Grapejuice brand color rules

**Source:** `brandcard.png` in this folder — 8 reference cards that demonstrate allowed color combinations. These rules codify how brand colors are used across the app.

**App default:** The app uses a **dark** default: off-black (`#090113`) for screen and card backgrounds, with **light text** (white, gold, muted beige). Orientation is light-on-dark throughout.

---

## Reference: the 8 cards (brandcard.png)

The grid shows 8 cards. Each card has a **white background**; on it are colored **rectangles** (accents), **text** (“GRAPEJUICE”), a **line**, and a **grape icon**.

**Important:** The colored rectangles on each card are **not** card backgrounds. They are **accents** — like form fields, highlighter marks, or underlines. They should **not** be used as full card/surface backgrounds in the app. Use them as accents only (e.g. highlights, input fields, decorative strips).

| Card | Accent (rectangle) | Elements (text, line, icon)     | Use in app? |
|------|-------------------|----------------------------------|--------------|
| 1    | Pale gold         | Pale gold                       | ✅ Allowed   |
| 2    | Deep indigo       | Pale gold (text/icon), olive brown (line) | ✅ Allowed — deep indigo = off-black, so gold on it is OK |
| 3    | Olive brown       | Pale gold                       | ✅ Allowed   |
| 4    | Cream             | White                           | ✅ Accent only — cream rectangle is an accent, not a card bg |
| 5    | Lavender          | Lavender                        | ✅ Allowed (lavender as accent/foreground) |
| 6    | Deep indigo       | Lavender (text), vibrant purple (icon), deep indigo (line) | ✅ Allowed (purple family) |
| 7    | Vibrant purple    | White, deep indigo (line)       | ✅ Allowed (vibrant purple as accent) |
| 8    | Bright magenta    | White, deep indigo (line)       | ✅ Allowed (bright magenta as accent) |

From this we get **background rules**, **gold vs purple** (with one exception), and **accent usage** below.

---

## Palette (from colors.md)

| Role | Hex | Name | Use |
|------|-----|------|-----|
| **White** | `#FFFFFF` | Light surface | **Accent/buttons**; app default is dark so white is not the main background. |
| **Off-black / Dark** | `#090113` | Primary background | **Default app background** (light text on dark). Card/screen backgrounds use this. Gold on it is allowed. |
| **Cream** | `#F4EEE4` | Warm light | **Accent only** (e.g. form field, highlighter) — not a card background |
| **Lavender** | `#E9E3EF` | Purple light | **Accent / foreground only** — not a card background |
| **Olive brown / Warm brown** | `#433C32`, `#2F2412` | Dark warm | **Accent** or line/element — not a full card background |
| **Vibrant purple / Bright magenta** | `#AD00E1`, `#9700C5`, etc. | Purple accents | **Accent only** (e.g. highlighter, form field) — not a card background |
| **Gold** | `#D8C990` | Pale gold | On white, warm brown, or **deep indigo** (off-black) only |
| **Beige** | `#E4D7C1` | Warm mid-light | Supporting (lines, borders) |

---

## Rule 1: Card and screen backgrounds

**The colored rectangles on the reference cards are accents (form-field-like, highlighter marks), not backgrounds.**

**Allowed card/surface/screen backgrounds:**  
- **Off-black** (`#090113`) — **default**. The app is dark all around; light text on dark.  
- **White** (`#FFFFFF`) — only for accent surfaces (e.g. buttons, small panels) when needed.  
- A slightly darker shade (`#05000b`) or elevated dark (`#0f0219`) for contrast within the dark theme.

**All other colors (cream, lavender, olive brown, vibrant purple, bright magenta) must not be used as full card or screen backgrounds.** They are **accent colors** only — e.g. form fields, highlights, underlines, decorative strips — not large background fills.

---

## Rule 2: Gold and purple (one exception)

**Gold must not touch purple — except deep indigo.**

- **Off-black (`#090113`)** is the app dark. Gold on it is **allowed** (Card 2).  
- Gold may sit on: **white** (Card 1), **warm brown/olive brown** (Card 3), or **deep indigo** (Card 2).  
- Gold must **not** touch lavender, vibrant purple, bright magenta, or any other purple.  
- Purple family may combine with each other and with white or deep indigo, but must not touch gold unless the “purple” is deep indigo (off-black).

So:
- **OK:** Gold on white; gold on warm brown; gold on deep indigo (off-black); lavender/purple on white; purple on deep indigo.  
- **Not OK:** Gold on lavender, vibrant purple, or bright magenta; gold and those purples in the same component touching.

---

## Rule 3: Allowed combinations (codified from the 8 cards)

**Gold (on white, warm brown, or deep indigo only):**
- White background + gold accent / text / icon — Card 1  
- Deep indigo background (off-black) + gold text/icon — Card 2 ✅  
- Olive brown accent + gold text/icon — Card 3  

**Purple family (no gold touching lavender/vibrant purple/bright magenta):**
- White background + lavender accent / text / icon — Card 5  
- Deep indigo background + lavender text, vibrant purple icon — Card 6  
- Vibrant purple accent + white text/icon, deep indigo line — Card 7  
- Bright magenta accent + white text/icon, deep indigo line — Card 8  

**Cream, lavender, olive brown, vibrant purple, bright magenta:**  
- Use as **accents only** (form fields, highlights, underlines, decorative elements). Never as full card or screen backgrounds.

---

## Rule 4: Cards and surfaces in the app

- **Card/surface/screen backgrounds:** Only **white** or **deep indigo** (off-black). The colored rectangles on the reference cards are accents, not backgrounds — so no cream, lavender, olive brown, vibrant purple, or bright magenta as card fills.
- **Accents:** Cream, lavender, olive brown, vibrant purple, bright magenta may be used as highlights, form fields, lines, or small decorative areas on white or deep indigo.
- **Gold vs purple:** Gold may sit on white, warm brown, or deep indigo. Gold must not touch lavender, vibrant purple, or bright magenta (separate with white or deep indigo if both appear on a screen).

---

## Implementation checklist (for dev)

1. **Backgrounds:** Default = **off-black** (`#090113`). Card/screen backgrounds = off-black (or subtle variants). No cream, lavender, olive brown, vibrant purple, or bright magenta as full background fills; use those as **accents only**.  
2. **Gold vs purple:** Gold may sit on white, warm brown, or **off-black** (`#090113`). Gold must not touch lavender, vibrant purple, or bright magenta.  
3. **Reference:** The colored rectangles on the 8 cards are accent/highlighter patterns, not card backgrounds. When in doubt, use off-black for surfaces; use other colors as accents.

---

*These rules are derived from `brandcard.png`. Confirm before implementing site-wide.*
