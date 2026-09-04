# Clear Confirmation Dialog Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase only the clear-confirmation dialog typography while preserving the note dialog and all existing Side Panel layout and behavior.

**Architecture:** Add three CSS rules scoped to the existing `.dialog-card[data-dialog="clear"]` element. Extend the CSS contract test so the scope and exact font sizes cannot regress.

**Tech Stack:** CSS, TypeScript, Vitest, Vite

---

### Task 1: Scope Larger Typography to the Clear Dialog

**Files:**
- Modify: `tests/sidepanel/styles.test.ts`
- Modify: `src/sidepanel/styles.css`

- [ ] **Step 1: Write the failing style-contract test**

Add this test to `tests/sidepanel/styles.test.ts`:

```ts
it("enlarges only the clear confirmation dialog typography", () => {
  expect(rule('.dialog-card[data-dialog="clear"] h2')).toMatch(/font-size:\s*18px/);
  expect(rule('.dialog-card[data-dialog="clear"] p')).toMatch(/font-size:\s*14px/);
  expect(rule('.dialog-card[data-dialog="clear"] .dialog-actions button')).toMatch(
    /font-size:\s*14px/,
  );
  expect(rule('.dialog-card[data-dialog="note"] h2')).not.toMatch(/font-size:\s*18px/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/sidepanel/styles.test.ts`

Expected: FAIL because the three clear-dialog-specific font-size rules do not exist.

- [ ] **Step 3: Add the minimal scoped CSS**

Add after the existing `.dialog-actions [data-action="confirm-clear"]` rule in `src/sidepanel/styles.css`:

```css
.dialog-card[data-dialog="clear"] h2 {
  font-size: 18px;
}

.dialog-card[data-dialog="clear"] p,
.dialog-card[data-dialog="clear"] .dialog-actions button {
  font-size: 14px;
}
```

- [ ] **Step 4: Run focused and full verification**

Run: `npm test -- tests/sidepanel/styles.test.ts`

Expected: all Side Panel style tests pass.

Run: `npm run build && git diff --check`

Expected: TypeScript check, all tests, both Vite builds, and diff check pass; `dist/sidepanel/index.html` and its CSS asset are regenerated.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/sidepanel/styles.css tests/sidepanel/styles.test.ts
git commit -m "style: enlarge clear confirmation text"
```

- [ ] **Step 6: Perform Chrome acceptance**

Reload the unpacked extension from `dist/`, open the Side Panel, collect one job, and choose “清空”. Verify the title is 18px, the explanatory text and both buttons are 14px, the dialog remains within the panel, and the note dialog is unchanged.
