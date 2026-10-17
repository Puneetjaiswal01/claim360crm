# Claim 360 CRM design system

## Purpose and character

An operations workspace for shareholder recovery teams. Make dense records easy
to scan, the next action obvious, and lead ownership clear. The design should feel
calm, precise and established. Preserve the Claim 360 name and existing logo.

## Color and typography

| Token | Light theme | Use |
| --- | --- | --- |
| Background | `#f4f6f8` | Workspace canvas |
| Surface | `#ffffff` | Cards, tables, dialogs |
| Text | `#172b35` | Main content |
| Muted | `#72818b` | Supporting text |
| Border | `#e3e8eb` | Dividers and input outlines |
| Accent | `#19736b` | Primary actions and selected controls |
| Accent surface | `#eaf5f1` | Subtle emphasis |
| Sidebar | `#132a34` | Navigation |

Load Inter Variable locally for body text and Manrope Variable locally for
headings. Use font-weight 400–500 for body text and 600–700 for headings.
Page titles are 30–36 px, section titles 18–22 px, body text and table cells 14 px,
form labels and controls 13–14 px, navigation 13 px, secondary text 12 px and short
eyebrows 10–11 px. Important information must never depend on 8–9 px text.
Use 1.5–1.65 line height, generous spacing and tabular numbers for metrics.
Use uppercase only for short section labels, with restrained letter spacing.

## Layout and components

- Desktop: 256 px fixed sidebar, 76 px header, 32–40 px content gutters.
- Sidebar: navy, muted icons, quiet teal selected state, clear profile and sign-out.
- Header: breadcrumb, functional workspace controls, notifications and profile.
- Page introduction: plain canvas, title and description, one clear primary action.
- Summary: four equal metric cards with actual record counts, small colored icons.
- Overview: pipeline donut with text legend, then focused quick actions and follow-ups.
- Cards: 14 px corners, 1 px border, minimal shadow, 24–28 px padding.
- Buttons and inputs: 9–10 px corners, 40–44 px minimum height, visible keyboard
  focus and clear busy states. Group related controls and keep labels readable.
- Tables: quiet headers, readable rows, distinct ownership and status, horizontal
  scrolling on small screens without clipping surrounding controls.
- Lead editor: clear shareholder identity, tabs, grouped fields, readable activity
  history and a persistent save area. Preserve draft protection and navigation.
- Login: navy story panel with a concise recovery workflow; light sign-in panel
  with a proper labeled form, password visibility control and error messages.

## Responsive and accessible behavior

At 850 px, navigation becomes a drawer with a dismissible backdrop. Below 560 px,
metrics use two columns and overview panels stack. Forms remain usable at 320 px.
Support the existing dark theme. Respect reduced motion, maintain keyboard focus
indicators, name icon buttons, and expose loading, validation and empty states.
Use text and icons along with color for stage and status meaning.
Use a coherent slate-and-teal dark theme with readable muted text, rather than
mixing old blue components with the new palette. Prefer useful empty-state
instructions to decorative mock charts or fabricated sample records.

## Data and interaction rules

Use real application totals. Never fabricate financial amounts, growth trends,
customers, testimonials or recovery rates. Empty workspaces show meaningful zero
states. Every visible action must either work with existing app behavior or be
clearly presented as a non-interactive illustration. Preserve admin and employee
permissions, authentication, CSV workflows, filters, reports and lead editing.
Local development must remain visibly identified and keep records on the computer.

## Interaction polish

Use the editable Arc UI components documented in `components/arc/README.md` for
loading skeletons, changing metrics, appearance selection and quick navigation.
Motion uses Arc's shared spring and timing tokens, with reduced-motion behavior.
Keep page entrances short, preserve content and focus during refreshes, and show
busy or success feedback only in response to real application state. The Ctrl+K
menu must respect existing permissions and leave the lead editor's draft
protection intact. See `docs/frontend-polish.md` for implementation guidance.

## Code locations

`app/design-system.css` implements this foundation over the established component
styles. `components/SignInScreen.tsx` and `components/DashboardInsights.tsx` implement
the new compositions. The existing application retains responsibility for state,
authentication and data fetching. Stitch is a development design tool, not a
dependency of the CRM's runtime or a place to send CRM records or credentials.
