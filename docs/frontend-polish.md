# Frontend interaction system

The EZYE swipe file informed the choice of Arc's dashboard components. The app
uses its free counter, skeleton, segmented control and command palette source,
with original motion for page entrances, navigation selection and action feedback.
See `components/arc/README.md` for source links, adaptations and license details.

## Reusable components

- `LoadingStates.tsx`: readable live metrics, meaningful loading placeholders and
  a shared busy icon. Use real pending state, never artificial delays.
- `InteractionPrimitives.tsx`: a short view entrance and one shared navigation
  highlight. Page transitions run only when the active view changes.
- `WorkspaceCommands.tsx`: native modal dialog around Arc's command palette.
  Ctrl+K opens it, arrow keys choose a result, Enter runs it, and Escape clears
  the query before closing. Items are derived from the permitted navigation.
- `WorkspaceControls.tsx`: uses Arc's keyboard-accessible segmented control while
  retaining existing appearance preferences and login-hour behavior.

## Interaction rules

Keep the CRM's text and data immediately understandable. Do not add decorative
motion to table rows or fabricate growth, progress, AI activity, or success states.
Respect `prefers-reduced-motion` in both CSS and Motion components. Keep form
input focus stable during refreshes and keep stale records inert while updating.
The command palette is unavailable while a lead editor, draft confirmation, or
mobile drawer is open. Other modal dialogs take priority over its shortcut.

Numeric changes, focusable controls, theme changes and data loading need checks
when changing this layer. Keep mobile controls within the header width and check
the native dialog with a keyboard in a connected browser when one is available.
