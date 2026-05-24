# Contributing

Contributions are welcome, particularly new tools. The app is built so that adding a tool requires nothing more than a single Svelte component — the app picks it up automatically.

---

## Submitting a New Tool

### 1. Grab the template

Copy `renderer/src/tools/_Template.svelte` and rename it without the leading underscore, e.g. `renderer/src/tools/MyTool.svelte`. Files starting with `_` are ignored by the app, everything else is auto-discovered.

### 2. Fill in the metadata

At the top of your file, export a `toolMeta` object from the module script block:

```svelte
<script context="module" lang="ts">
  export const toolMeta = {
    name: 'My Tool',
    desc: 'A short description of what this tool does',
    icon: '🔧',
  };
</script>
```

This is all the app needs to list your tool. The name and description are both searchable from the Tools tab.

### 3. Build the tool

The template includes comments covering how to import shared game data, utilities, and store values. Keep logic self-contained inside your component — you don't need to touch `App.svelte` or `store.ts`.

### 4. Test it locally

Run `npm run dev` from the project root and navigate to the Tools tab — your tool should appear in the list automatically. Click into it and make sure everything works as expected.

### 5. Open a pull request

Submit your PR against the `main` branch. Please include:
- A brief description of what the tool does
- Any data sources it relies on (API endpoints, local storage keys, etc.)
- A note if the tool requires any formula or calculation accuracy caveats

---

## Guidelines

- **One tool per pull request.** Keep PRs focused so they're easy to review.
- **Use the existing colour tokens and component patterns** from the template — tools should feel like they belong in the app, not bolted on.
- **No new dependencies** without discussion first. Open an issue before adding anything to `package.json`.
- **Accuracy caveats** — if your tool involves calculations (XP rates, profit estimates, etc.), be upfront about the accuracy limitations, both in the tool UI and in your PR description.
- Tools that scrape, spoof, or automate gameplay in any way will not be accepted.

---

## Other Contributions

For bug fixes or improvements to existing features, open an issue first describing the problem so we can align on the right fix before you start writing code.

For anything else, feel free to open an issue or start a discussion.
