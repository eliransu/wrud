## Summary

<!-- One paragraph: what does this PR do and why? -->

## Related issue

<!-- Link the issue this PR closes, if any. Use "Closes #N" so it auto-closes on merge. -->

Closes #

## Type of change

<!-- Check all that apply. -->

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (API, schema, or SDK contract change)
- [ ] Documentation / examples
- [ ] Refactor / internal improvement
- [ ] CI / tooling

## Checklist

- [ ] I have run `npm run typecheck` and `npm -w @wrud/platform run typecheck` with no errors
- [ ] I have run `npm test` and all tests pass
- [ ] I have run `npm -w packages/cli run build` and it succeeds
- [ ] I have added or updated tests to cover my change
- [ ] If I changed the API contract (`packages/shared`), I updated the server, SDK, and platform to match
- [ ] I have updated CHANGELOG.md under `[Unreleased]`
- [ ] I have not committed any tokens, secrets, or personal credentials

## Breaking changes

<!-- If this is a breaking change, describe what callers/integrators need to do. Delete if not applicable. -->

N/A

## Screenshots / recordings

<!-- For dashboard (platform) changes, attach a screenshot or short screen recording. Delete if not applicable. -->

## Testing notes

<!-- Any instructions for the reviewer to manually test this change (e.g., curl commands, env vars to set). -->
