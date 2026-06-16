# KenGUI / Kenkui Design Language

**Product family:** KenGUI, Kenkui, KenTUI  
**Primary product context:** Kenkui is an ebook-to-audiobook converter.  
**Design direction:** Calm, bookish, tactile, solarized-inspired, subtly avian, and quietly powerful.

---

## 1. Executive Summary

KenGUI and Kenkui should feel like a thoughtful reading-and-listening tool rather than a generic SaaS dashboard or fantasy-themed novelty app. The design language should combine the warmth of a personal library, the clarity of a productivity tool, and the intelligence of a scholarly corvid/kenku motif.

The product should be approachable for first-time users, while still offering advanced conversion, narration, pronunciation, queue, and export controls for power users through progressive disclosure.

The guiding sentence:

> **A calm tool for transforming books into voice, with the craft of a scribe and the intelligence of a kenku.**

---

## 2. Core Brand Principles

### Calm, Not Flashy

The interface should feel steady, readable, and focused. Avoid bright neon colors, RGB glows, aggressive contrast, or visual noise.

### Bookish, Not Generic SaaS

The brand should reference books, parchment, ink, cloth-bound covers, marginalia, and audio waveforms. It should feel purpose-built for reading and listening.

### Textured, Not Glossy

Prefer subtle paper grain, linen texture, ink hatching, feather line art, and print-like surfaces over smooth glassmorphism or glossy gradients.

### Useful First, Atmospheric Second

The product must remain usable and clear. The avian and kenku themes should enrich the experience without obscuring controls or navigation.

### Simple by Default, Powerful When Needed

The default conversion flow should be direct and friendly. Advanced controls should be available through drawers, sheets, inspectors, accordions, presets, and command search.

### Consistent Across Devices

Desktop and mobile should share the same vocabulary, visual tokens, object model, component behavior, status labels, and product flow.

---

## 3. Product Concept

Kenkui converts ebooks into audiobooks.

The core transformation is:

```text
Book → Text → Voice → Audiobook
```

The core user journey is:

```text
Import ebook → Choose voice → Preview sample → Convert → Listen/export
```

The design language should make this journey feel obvious, calm, and trustworthy.

---

## 4. Brand Metaphors

The following metaphors should guide visual and product decisions:

| Concept | Product Meaning | Visual Expression |
|---|---|---|
| Page | Source text, reading, library | Parchment, page edges, book cards |
| Voice | Narration, audio, conversion | Waveforms, listening controls, voice cards |
| Feather | Craft, lightness, avian identity | Quill forms, dividers, logo elements |
| Kenku / Corvid | Mimicry, intelligence, memory | Hooded scholar, scribe, marginalia illustration |
| Scriptorium | Advanced craft and settings | Expert mode, presets, pronunciation tools |
| Shelf | User library | Book grid, collections, saved audiobooks |

---

## 5. Visual Identity

### Logo Direction

The primary mark should be an abstract **K** formed from:

- A feather or quill
- A book page or folded page
- A subtle audio waveform

The mark should remain simple enough to work as:

- App icon
- Favicon
- Sidebar mark
- Full wordmark lockup
- Library/package identity for Kenkui
- Terminal variant for KenTUI

Avoid a literal cartoon bird as the primary logo. Kenku or corvid characters should be used as illustration, not the core mark.

### Logo Family

Suggested hierarchy:

```text
KenGUI  — parent application / interface shell
Kenkui  — ebook-to-audiobook conversion library/product
KenTUI  — terminal companion
```

Each product can share the same K-feather-page-waveform mark, with small variations:

| Product | Mark Treatment |
|---|---|
| KenGUI | Full mark + wordmark, polished app identity |
| Kenkui | Mark + library/conversion emphasis |
| KenTUI | Simplified mark, mono-friendly, terminal-compatible |

---

## 6. Color System

Use a muted, solarized-adjacent palette. Avoid pure white, pure black, saturated blues, neon greens, magentas, or cyberpunk purples.

### Core Tokens

```css
:root {
  --color-deep-slate: #283A42;
  --color-deep-slate-2: #1F3037;
  --color-muted-teal: #2F6F6A;
  --color-muted-teal-2: #4F7D78;

  --color-parchment: #F3E8D6;
  --color-warm-paper: #FAF2E3;
  --color-paper-raised: #FFF7E8;

  --color-ink: #243236;
  --color-ink-gray: #586068;
  --color-muted-text: #6D706C;

  --color-desaturated-gold: #B89B4D;
  --color-soft-rust: #B46A48;
  --color-mist: #A7B5B4;

  --color-success: #6F8A65;
  --color-warning: #B89B4D;
  --color-error: #A95143;

  --color-border: rgba(40, 58, 66, 0.18);
  --color-border-strong: rgba(40, 58, 66, 0.32);
}
```

### Usage Guidance

| Token | Usage |
|---|---|
| Deep Slate | Sidebar, primary navigation, high-emphasis panels |
| Muted Teal | Primary actions, selected states, progress, toggles |
| Parchment | Main app background |
| Warm Paper | Cards, sheets, raised surfaces |
| Ink | Primary text |
| Ink Gray | Metadata, helper text, borders |
| Desaturated Gold | Dividers, premium details, small accents |
| Soft Rust | Secondary accent, warning-adjacent states, cover variety |
| Mist | Disabled states, secondary surfaces, illustration fill |

### Accessibility

All text combinations must meet WCAG AA contrast. Do not use gold as small body text on parchment unless the contrast is verified.

---

## 7. Typography

Use a two-typeface system.

### Literary Serif

For brand moments, headings, hero copy, empty states, and editorial surfaces.

Recommended options:

- Cormorant Garamond
- Literata
- Source Serif 4
- EB Garamond
- Fraunces

### Functional Sans

For controls, dense UI, navigation, settings, metadata, forms, and tables.

Recommended options:

- Inter
- IBM Plex Sans
- Source Sans 3
- Avenir-like geometric sans

### Optional Monospace

For logs, filenames, export templates, diagnostics, technical details, and KenTUI-related surfaces.

Recommended options:

- IBM Plex Mono
- JetBrains Mono

### Suggested Type Tokens

```css
:root {
  --font-serif: "Cormorant Garamond", "Literata", Georgia, serif;
  --font-sans: "Inter", "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", "JetBrains Mono", monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --text-3xl: 2.25rem;
  --text-4xl: 3rem;
}
```

### Typography Rules

Use serif type for emotional and editorial moments:

- “Welcome back, reader.”
- “From page to voice.”
- “Your shelf is waiting.”
- “The Odyssey — Book I”

Use sans-serif type for functional UI:

- Buttons
- Navigation
- Form labels
- Metadata
- Settings
- Dense panels
- Status labels

Do not use tiny serif labels in forms or dense settings panels.

---

## 8. Texture and Surface Language

Texture should make the product feel tactile and literary, but it should never reduce legibility.

### Use Texture For

- Global parchment background
- Sidebar cloth/book-cover surface
- Book covers
- Empty states
- Hero illustrations
- Brand panels
- Decorative dividers

### Avoid Texture Inside

- Text inputs
- Small buttons
- Dense settings
- Tables
- Long lists
- Progress bars
- Audio controls

### Rule

> **Texture belongs behind the work, not inside the work.**

### Surface Examples

```css
.app-background {
  background:
    radial-gradient(circle at 30% 0%, rgba(184,155,77,0.08), transparent 35%),
    linear-gradient(180deg, #FAF2E3, #F3E8D6);
}

.paper-surface {
  background-color: var(--color-paper-raised);
  border: 1px solid var(--color-border);
  box-shadow: 0 8px 24px rgba(40, 58, 66, 0.08);
}

.dark-cloth-surface {
  background-color: var(--color-deep-slate);
  color: var(--color-parchment);
  border-right: 1px solid rgba(243, 232, 214, 0.12);
}
```

---

## 9. Illustration Language

Kenku-inspired art should feel scholarly, quiet, and literary.

### Recommended Illustration Motifs

- Hooded bird-scholar
- Corvid scribe
- Quill and open book
- Manuscript marginalia
- Feather diagrams
- Ink wash birds
- Book-to-waveform transformations
- Subtle flocks in background compositions

### Style

- Ink wash
- Graphite sketch
- Woodcut-inspired linework
- Fine hatching
- Muted gold accents
- Parchment background

### Avoid

- Cartoon mascot proportions
- Aggressive fantasy combat imagery
- Weapons or armor emphasis
- Cute bird puns in primary UI
- Dark sinister villain vibes

### Use Illustrations In

| Surface | Illustration Intensity |
|---|---|
| Landing page | High |
| Onboarding | Medium |
| Empty states | Medium |
| Conversion complete | Low to medium |
| Brand panels | High |
| Dense settings | None |
| Tables/lists | None |
| Playback controls | None |

---

## 10. Iconography

Icons should be simple, readable, and slightly warm.

### Style

- Thin-to-medium stroke
- Rounded joins
- Minimal fill
- Consistent 24px grid
- No techno-glyph look
- No game HUD styling

### Core Icon Set

- Book
- Document
- Folder / collection
- Upload / import
- Waveform
- Headphones
- Ear / voice
- Bookmark
- Clock / history
- Sliders / settings
- Play / pause
- Skip back / skip forward
- Download / export
- Queue
- Check / completed
- Alert / failed
- Search
- Filter
- More / overflow

---

## 11. Product Object Model

The application should be organized around these core objects:

```text
Book
Conversion
Voice
Audiobook
Collection
Preset
Pronunciation Dictionary
```

These object names should remain consistent across desktop and mobile.

---

## 12. Information Architecture

### Desktop Navigation

```text
Library
Convert
Voices
Audiobooks
Collections
Settings
```

### Mobile Navigation

```text
Library
Convert
Voices
Audiobooks or History
Settings
```

On mobile, Collections can live inside Library unless usage data suggests it deserves primary navigation.

### Suggested IA

```text
Library
├── Books
├── Collections
├── Imports
└── Metadata

Convert
├── New Conversion
├── Queue
├── Presets
└── Completed

Voices
├── Voice Library
├── Favorites
├── Pronunciation
└── Voice Settings

Audiobooks
├── Continue Listening
├── Completed
├── Exported
└── Downloads

Settings
├── General
├── Conversion Defaults
├── Audio Quality
├── Storage
├── Accessibility
└── Advanced
```

---

## 13. Layout System

### Desktop Layout

Preferred desktop structure:

```text
┌ Sidebar ┬ Main Content ┬ Optional Inspector ┐
│         │              │                    │
│ Nav     │ Library      │ Basic / Advanced   │
│ Brand   │ Queue        │ Voice              │
│ Quote   │ Preview      │ Output             │
│ Profile │ Player       │ Pronunciation      │
└─────────┴──────────────┴────────────────────┘
```

Desktop should support:

- Drag-and-drop import
- Batch selection
- Multi-column library
- Right inspector
- Keyboard shortcuts
- Command search
- Advanced settings
- Queue controls
- Saved presets

### Mobile Layout

Preferred mobile structure:

```text
Top brand/header
Content stack
Continue listening card
Library carousel/list
Primary conversion CTA
Bottom tabs
Bottom sheet for advanced options
```

Mobile should prioritize:

- Continue listening
- Import/convert one book
- Conversion progress
- Voice preview
- Simple library browsing
- Clear bottom navigation

Avoid dense tables on mobile. Convert table rows into stacked cards.

---

## 14. Progressive Disclosure

Kenkui must serve beginners and power users without overwhelming either group.

### Beginner Mode

Show only the essentials:

- Selected book
- Voice
- Quality preset
- Chapter selection
- Preview
- Start conversion

Use direct labels:

- Add Book
- Convert Book
- Choose Voice
- Preview
- Start Conversion
- Listen Now
- Export Audiobook

### Advanced Mode

Advanced controls should appear through:

- Advanced Options accordion
- Desktop right inspector
- Mobile bottom sheet
- Per-book settings drawer
- Saved presets
- Command palette

Advanced controls may include:

- Output format: MP3, M4B, WAV
- Bitrate
- Sample rate
- Channels
- Playback speed
- Voice tone
- Emphasis
- Pause length
- Chapter detection method
- Minimum chapter length
- Include chapter titles
- Pronunciation dictionary
- IPA enhancements
- Silence trimming
- Normalize audio
- Target loudness
- Noise reduction
- De-essing
- Export naming template
- Batch conversion
- Queue priority
- Save as preset

### Rule

> **Never show advanced controls in the default first-run flow.**

---

## 15. Component System

### Buttons

#### Primary Button

Use for the main action on a screen.

- Deep slate or muted teal fill
- Parchment text
- Subtle border
- No glow

Examples:

- Convert Book
- Start Conversion
- Export Audiobook
- Save as Preset

#### Secondary Button

Use for supporting actions.

- Paper fill or transparent background
- Ink border
- Ink text

Examples:

- Add Files
- Browse Voices
- View Details
- Reset to Defaults

#### Tertiary Button

Use for low-emphasis actions.

- Text only or icon + text
- Muted teal or ink color
- No decorative treatment

Examples:

- View all
- Open in Audiobooks
- Explore all features

### Cards

Use cards for:

- Books
- Voices
- Conversion jobs
- Audiobooks
- Collections
- Presets

#### Book Card

Should include:

- Cover
- Title
- Author
- Format
- Pages or duration
- Status
- Overflow menu

#### Voice Card

Should include:

- Voice name
- Tone/style
- Language/accent if applicable
- Best use case
- Preview button

#### Conversion Card

Should include:

- Book thumbnail
- Title
- Author
- Status
- Progress
- ETA
- Pause/cancel/details

### Search

Desktop search should support command behavior.

Placeholder:

```text
Search your library, conversions, or help...
```

Desktop may show shortcut hints:

```text
⌘K / Ctrl+K
```

Mobile search should open a search sheet or filter sheet when appropriate.

### Waveforms

Use waveforms functionally for:

- Audio preview
- Voice preview
- Currently listening
- Chapter review

Use waveforms decoratively for:

- Logo accent
- Section dividers
- Loading/conversion ornaments

Decorative waveforms should remain low contrast.

---

## 16. Core Screens

### Desktop Screens

- Library Dashboard
- Convert Book Flow
- Conversion Queue
- Voice Library
- Audiobook Player
- Book Detail
- Advanced Settings Inspector
- Pronunciation Dictionary
- Settings / Defaults

### Mobile Screens

- Home / Library
- Continue Listening
- Convert Book
- Voice Selection
- Conversion Status
- Audiobook Player
- Advanced Options Bottom Sheet
- Settings

---

## 17. Screen-Level Recommendations

### Library

The library should feel like a shelf: warm, browsable, and low-friction.

Required elements:

- Book grid/list toggle on desktop
- Horizontal book rows or stacked cards on mobile
- Search and filters
- Import CTA
- Book status indicators
- Overflow menus

### Convert

The default conversion flow should be guided.

Steps:

```text
1. Add book
2. Choose voice
3. Preview sample
4. Start conversion
```

Power-user options should live in Advanced Options.

### Voices

Voice cards should emphasize tone and use case rather than technical metadata first.

Examples:

- Clarity — Neutral, balanced, general use
- Atticus — Deep, calm, classics
- Clara — Bright, clear, nonfiction
- Edmund — Measured, thoughtful, history

### Audiobooks

Prioritize listening behavior:

- Continue listening
- Recent audiobooks
- Completed audiobooks
- Bookmarks
- Chapters
- Export/download

### Settings

Separate settings into general and advanced categories.

Recommended groups:

- General
- Conversion Defaults
- Voice Defaults
- Audio Processing
- Export
- Storage
- Accessibility
- Advanced

---

## 18. States and Feedback

### Empty Library

Tone: welcoming, not salesy.

Example:

```text
Your shelf is waiting.
Add an ebook to begin turning pages into voice.
```

Primary action:

```text
Add Book
```

Use a small kenku-scribe, feather, or book illustration.

### Conversion In Progress

Show:

- Current stage
- Progress percentage
- ETA
- Pause
- Cancel
- Details

Example stages:

```text
Reading chapters
Preparing text
Applying pronunciations
Generating narration
Normalizing audio
Exporting audiobook
```

### Conversion Complete

Example:

```text
Your audiobook is ready.
The Odyssey has been converted and added to Audiobooks.
```

Actions:

```text
Listen Now
Export
View Details
```

### Error State

Keep the copy calm and useful.

Example:

```text
We could not read this file.
The ebook may be protected, damaged, or in an unsupported format.
```

Actions:

```text
View Details
Try Another File
```

Do not use playful failure copy.

---

## 19. Motion

Motion should feel quiet and physical.

Use:

- Soft sheet slides
- Gentle card elevation
- Subtle progress transitions
- Page-like onboarding transitions
- Small waveform movement during playback

Avoid:

- Bouncy animation
- Particle effects
- Glowing pulses
- Rapid loaders
- Excessive parallax

Suggested motion tokens:

```css
:root {
  --motion-fast: 120ms;
  --motion-medium: 180ms;
  --motion-slow: 280ms;
  --motion-ease: cubic-bezier(0.2, 0.0, 0.2, 1);
}
```

Reduced motion mode must disable decorative animation.

---

## 20. Accessibility Requirements

Accessibility should be central because the product is about reading and listening.

Minimum requirements:

- WCAG AA contrast for all text
- 44px minimum touch targets on mobile
- Keyboard navigation on desktop
- Visible focus states
- Screen reader labels for playback controls
- Reduced motion support
- High contrast mode
- Resizable text support
- Clear error messages
- No status conveyed by color alone

Suggested focus state:

```css
:focus-visible {
  outline: 2px solid var(--color-muted-teal);
  outline-offset: 3px;
}
```

Use explicit labels:

- Play preview
- Pause conversion
- Cancel conversion
- Export audiobook
- Change voice
- Edit pronunciations

Do not rely only on icons.

---

## 21. Copywriting Style

Use clear labels for actions and poetic language only around the edges.

### Good Functional Labels

- Add Book
- Convert Book
- Choose Voice
- Preview Voice
- Start Conversion
- Pause
- Cancel
- Listen Now
- Export Audiobook
- Edit Pronunciations
- Save as Preset

### Good Brand Copy

- From page to voice.
- Read. Listen. Understand.
- Turn your library into listening.
- Thoughtful by design. Human by intention.
- A calm way to carry your books.
- Built for readers. Made for listening.

### Avoid

- Overly cute bird puns
- Dense fantasy terminology
- Technical jargon in beginner flows
- Novel labels for common actions

Avoid primary actions like:

- Take Flight
- Hatch Audio
- Mimic Tome
- Enter the Nest

Thematic language is acceptable in empty states, onboarding, and brand surfaces, but not in core controls.

---

## 22. Cross-Platform Consistency

Desktop and mobile must share:

- Same color tokens
- Same typography families
- Same logo family
- Same object names
- Same icon style
- Same status labels
- Same conversion stages
- Same component states
- Same empty-state tone

They may differ in layout:

| Pattern | Desktop | Mobile |
|---|---|---|
| Navigation | Sidebar | Bottom tabs |
| Advanced controls | Right inspector | Bottom sheet / nested page |
| Library | Grid + list toggle | Stacked cards / horizontal rows |
| Queue | Table/card hybrid | Stacked cards |
| Search | Command/search bar | Search sheet |
| Detail view | Split pane | Full screen or sheet |

Shared mental model:

```text
Library contains books.
Convert creates audiobooks.
Voices defines narration.
Audiobooks contains completed listening outputs.
Collections groups books/audiobooks.
Settings controls defaults and advanced behavior.
```

---

## 23. Implementation Checklist

When building any screen, verify:

- [ ] The user’s next action is obvious.
- [ ] The default path is simple.
- [ ] Advanced controls are hidden until requested.
- [ ] The palette remains muted and solarized-adjacent.
- [ ] Text remains readable on textured surfaces.
- [ ] Kenku/corvid references are subtle and non-cartoonish.
- [ ] The interface uses clear labels, not fantasy jargon.
- [ ] Desktop and mobile share the same object model.
- [ ] Accessibility requirements are met.
- [ ] Motion is quiet and supports reduced-motion mode.
- [ ] Empty, loading, success, and error states are designed.

---

## 24. Design Do / Do Not

### Do

- Use warm parchment backgrounds.
- Use deep slate for structure and navigation.
- Use muted teal for primary actions.
- Use serif headings for editorial moments.
- Use clean sans-serif for functional UI.
- Use subtle feather, page, and waveform motifs.
- Use kenku/corvid illustration as quiet atmosphere.
- Keep beginner flows direct.
- Put power-user controls in inspectors, sheets, and presets.

### Do Not

- Use neon RGB highlights.
- Use cyberpunk blue/purple glow.
- Turn the interface into a fantasy game HUD.
- Use a cartoon bird mascot as the core logo.
- Hide common actions behind themed names.
- Put heavy texture inside inputs or dense controls.
- Show every advanced option during first run.
- Make desktop and mobile feel like separate products.

---

## 25. Final North Star

The final product should feel like:

> **A beautifully bound digital tool that turns books into voice.**

It should not feel like:

- A fantasy game interface
- A generic SaaS dashboard
- A neon developer console
- A whimsical mascot app

The system succeeds when a new user can convert a book without thinking, and a power user can tune the result deeply without leaving the same calm, coherent design language.
