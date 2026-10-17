# Stitch design workflow

This repository uses `@google/stitch-sdk` 0.3.5 as a development dependency.
The connection is not complete until `npm run design:check` succeeds with your key.

## Get a key

1. Sign in at https://stitch.withgoogle.com/.
2. Open your profile menu, then **Stitch settings → API key → Create key**.
3. Add `STITCH_API_KEY=your_key` to the ignored `.env.local` file.
4. Optionally add `STITCH_PROJECT_ID=your_project_id` to reuse a Stitch project.
5. Run `npm run design:check` to verify access without creating any designs.

Google's guide: https://codelabs.developers.google.com/design-to-code-with-antigravity-stitch?hl=en
SDK source: https://github.com/google-labs-code/stitch-sdk

## Generate and retrieve designs

```text
npm run design:brief -- dashboard
npm run design:check
npm run design:generate -- dashboard
npm run design:generate -- login MOBILE
npm run design:generate -- lead-workspace
npm run design:generate -- ui-system
npm run design:pull -- existing_screen_id
```

`design:brief` previews the exact prompt without credentials or network requests.
The first `design:generate` creates a project if none is configured, then saves
its ID in ignored `.stitch/project.json` for later runs. Existing IDs can instead
be supplied through `.env.local`. `design:pull` uses the configured/saved project
and downloads an existing screen without generating a new one.

HTML and screenshots are downloaded into ignored `.stitch/exports/PROJECT/SCREEN/`.
Generation may take several minutes and uses your Stitch account's allowance.
Only the checked-in design brief is sent; app records, login credentials and local
environment files are not included. The key is used only by the local Node script.
No Stitch key, generation endpoint, or generated HTML is exposed in the CRM UI.

Review the exported screenshot and HTML, then adapt the design into React
components while preserving existing state, permissions and data behavior. The
script never automatically executes downloaded HTML or replaces app source files.
Keep `DESIGN.md`, the prompts in `design/stitch`, and `app/design-system.css` aligned.

The initial dashboard and login references are recorded in
`design/stitch/reference.json`. Their layout, palette and workflow structure have
been adapted into the app. Generated examples and claims are not treated as facts:
the working UI uses real totals and makes no claims of certifications or encrypted
storage based on a design generator's example copy.

The extended UI reference guides the directory, grouped navigation and shared
controls. Inter Variable and Manrope Variable are bundled through `next/font/local`
from pinned Fontsource packages, so typography does not depend on Google Fonts
requests. Body and form text use a readable 13–14 px scale, with larger headings.
The same system covers team cards, employee profiles, the CSV import workflow,
operations forms, email tools, notifications, confirmation dialogs and dark mode.
