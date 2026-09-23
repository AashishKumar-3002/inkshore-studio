# Contributing

Inkshore Studio is built for writers. The most useful contribution is often a
clear description of something that made writing harder.

## Issues and feedback

Bug reports, UX feedback, and feature suggestions are welcome through
[GitHub Issues](https://github.com/AashishKumar-3002/inkshore-studio/issues).
You do not need to propose a fix or submit code.

For bugs, include your OS, app version, steps to reproduce, and what you expected.
Screenshots and relevant logs help. Desktop server logs are available from the
Help menu. Remove private manuscript text, API keys, and account credentials.

If a bug could expose credentials or another user's data, contact
[aashish201810kumar@gmail.com](mailto:aashish201810kumar@gmail.com) privately
instead of posting sensitive details in a public issue.

## Small pull requests

Focused bug fixes and documentation improvements are welcome. Please discuss
larger features or redesigns in an issue first so we can agree on the scope.

Follow the [source setup](README.md#running-from-source), create a branch, and
keep the change focused. Explain the problem and resulting behavior in your PR;
include screenshots for UI changes and list the checks you ran.

For code changes:

```bash
npm run typecheck
npx eslint src scripts tests
npm test
npm run build
```

For desktop startup or packaging changes, also run:

```bash
npm run desktop:prepare
node scripts/smoke-desktop.mjs
```

Documentation-only changes do not need a full app build. Check links and commands.
If you cannot run a relevant check, say so in the PR.

Preserve project ownership checks and encrypted provider-key storage. Include
migrations when changing the schema and explain the effect on existing libraries.
Check the installed Next.js documentation in `node_modules/next/dist/docs/`
before changing framework APIs. Never commit secrets or real manuscripts.

Be respectful, keep feedback specific, and allow time for review.
