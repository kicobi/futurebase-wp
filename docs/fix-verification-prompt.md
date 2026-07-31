# Fix-verification review prompt

The companion to [full-repo-review-prompt.md](full-repo-review-prompt.md). That
one asks *what is wrong with this repo*; this one asks the narrower and harder
question that comes after: **did the fixes actually fix it, and did they break
something else?**

Use it once a review's findings have been addressed. Fill the three bracketed
sections — they are the whole of what changes between runs — and hand the file
to the reviewer.

```bash
codex exec "$(cat docs/fix-verification-prompt.md)"
```

**This deliberately contradicts the other prompt's advice about withholding
prior findings.** For a cold review, priming narrows the search. Here the
history *is* the input: the reviewer cannot check a fix without knowing what it
was fixing.

Run twice so far, both times against fixes for a Codex full-repo review:

| Run | Against | Result |
| --- | --- | --- |
| 2026-07-30 | 13 findings fixed in PRs #65–#71 | 9 defects — 4 P1. Verdict: 5 proper, 7 papered over, 1 **worse** |
| 2026-07-30 | those 9 fixed in PRs #73–#77 | 9 fixes accepted; the follow-on full-repo pass opened a separate improvement plan |

The first run is the argument for keeping this file. Every one of its nine
findings reproduced. Three were the same failure mode — **a fix narrowed to the
case that was reported, leaving the next case open** — and one had acquired a
passing test standing over the gap, which is how it earned "worse". None of
that is visible to a reviewer who only sees the final state.

---

You reviewed this repository at `[BASE-COMMIT]` and reported `[N]` findings. All
`[N]` were addressed across `[N]` PRs, ending at `[HEAD-COMMIT]`. Review the
fixes.

This is not a re-run of the original review. The question is narrower and
harder: **did each fix actually fix the thing, and did it break or hide
something else?** A fix that satisfies the letter of a finding while leaving the
defect reachable by another path is worse than the original bug, because it now
has a test asserting it is fine.

    git diff [BASE-COMMIT]..[HEAD-COMMIT]

The commits are self-describing; read the commit bodies, they state the
reasoning and the verification claimed for each.

## What changed, by finding

[ONE PARAGRAPH PER FINDING OR GROUP. State what was changed and why, in enough
detail that the reviewer can tell intent from implementation — the gap between
those two is where this review earns its keep. Name the commit for each.]

## Where to be most skeptical

[LIST THE JUDGEMENT CALLS. Not the parts you are confident in — the ones where
you chose one way and could have chosen the other, the ones where a default was
taken because no better answer presented itself, and the ones where a check was
narrowed and you are not certain the narrowing is sound.]

Do not limit yourself to these, and do not assume a listed concern is real —
some are here precisely because they were decided one way and might warrant the
other.

## Also worth checking

- **The tests.** Each new test was claimed to fail before its fix. Verify that
  claim on a sample — revert a fix, confirm the test fails, and confirm it fails
  for the stated reason rather than a module-load error.
- **Coverage gaps the tests create.** A passing suite is a claim about what is
  covered. What in these changes has no test, and of that, what would fail
  silently?
- **Anything the fixes made harder to change.** New coupling, new invariants
  that are not written down, new files that must stay in step with each other.
- **Anything restated rather than derived.** A value, pattern or list that now
  appears in two places is the next drift, and it will be updated in one of them.

## Ground rules

- Evidence, not vibes. `file:line`, the concrete failure (inputs → wrong
  behaviour), and a fix. If you cannot state how it breaks, do not report it.
- Reproduce before reporting. The original findings were confirmed by running
  them; hold yourself to that.
- Say explicitly which findings you consider **properly fixed**, which are
  **papered over**, and which are **now worse**. That verdict is the
  deliverable — a finding list without it is less useful.
- Rank by severity and be honest when severity is low. Do not pad.
- Say what you did not cover and where your confidence ran out.

## Out of scope

- `.claude/skills/`, `node_modules/`, `vendor/`, `build/`, `planning/`.
- Dependency CVEs. Dependabot covers them on its own cadence; re-listing
  transitive audit noise costs budget and tells us nothing. Do report unsafe
  *use* of a dependency.
- Style preferences on comment volume. The comment density is deliberate.
