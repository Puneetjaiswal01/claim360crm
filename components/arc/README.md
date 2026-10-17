# Arc UI components in Claim 360

The following free MIT components were copied from Arc's public source registry
on 2026-10-16. They remain editable in this repository.

| Component | Used for | Source |
| --- | --- | --- |
| Animated counter | Live dashboard and employee metric values | https://uiarc.dev/r/animated-counter.json |
| Skeleton | Initial workspace, metrics, profiles, call queues and directories | https://uiarc.dev/r/skeleton.json |
| Segmented control | Light/dark workspace appearance | https://uiarc.dev/r/segmented-control.json |
| Command palette | Ctrl+K navigation and real workspace actions | https://uiarc.dev/r/command-palette.json |
| Motion tokens | Shared timing and springs | https://uiarc.dev/r/arc-motion-tokens.json |

License: [MIT](LICENSE), copyright 2026 Elia Kuratli. Upstream repository:
https://github.com/kuratlielia/arc-library.

Local adaptations: imports point to `components/arc/lib/motion-tokens.ts`, the
palette's stray empty-state selector is fixed, result buttons stay outside the
Tab sequence so arrow keys operate the combobox, and the hard-coded Mac shortcut
hint is omitted in favor of the app's Ctrl+K trigger. The command palette is
wrapped in a native modal dialog with focus restoration and draft protection.
`app/interaction-polish.css` maps Arc tokens to the existing CRM palette and fonts.
The full Arc foundation is not imported, so application themes remain consistent.

Only the listed free components were installed. No paid source or templates were
copied. All motion has a reduced-motion path. Numeric animations represent actual
data changes; skeletons and busy indicators represent actual pending work.
