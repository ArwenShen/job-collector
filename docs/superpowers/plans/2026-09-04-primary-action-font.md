# Primary Action and Note Field Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing `14px` action buttons and set the note-dialog label and textarea text to `14px` without changing other Side Panel typography, dimensions, or behavior.

**Architecture:** Extend the existing CSS contract with note-dialog-specific assertions, then add a single selector scoped by `data-dialog="note"`. Shared dialog selectors remain unchanged so the clear confirmation dialog and future dialogs do not inherit the note-field typography.

**Tech Stack:** CSS, TypeScript, Vitest, Vite

---

### Task 1: Enlarge Note Dialog Field Text

**Files:**
- Modify: `tests/sidepanel/styles.test.ts`
- Modify: `src/sidepanel/styles.css`

- [ ] **Step 1: Write the failing style-contract test**

Add this test to `tests/sidepanel/styles.test.ts`:

```ts
it("uses 14px note field text without changing shared dialog typography", () => {
  const noteFields = rule(
    '.dialog-card[data-dialog="note"] label, .dialog-card[data-dialog="note"] textarea',
  );
  expect(noteFields).toMatch(/font-size:\s*14px/);

  expect(rule(".dialog-card label")).not.toMatch(/font-size\s*:/);
  expect(rule(".dialog-card textarea")).not.toMatch(/font-size\s*:/);
  expect(rule(".dialog-card h2")).toMatch(/font-size:\s*16px/);
  expect(rule('.dialog-card[data-dialog="clear"] h2')).toMatch(/font-size:\s*18px/);
  expect(rule('.dialog-card[data-dialog="clear"] p')).toMatch(/font-size:\s*14px/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/sidepanel/styles.test.ts`

Expected: FAIL because the note-dialog-specific label/textarea rule does not yet exist.

- [ ] **Step 3: Add the minimal scoped CSS**

Add this rule near the existing note-dialog action typography in `src/sidepanel/styles.css`:

```css
.dialog-card[data-dialog="note"] label,
.dialog-card[data-dialog="note"] textarea {
  font-size: 14px;
}
```

Do not change `.dialog-card label`, `.dialog-card textarea`, `.dialog-card h2`, textarea dimensions, padding, or any business logic.

- [ ] **Step 4: Run focused and full verification**

Run: `npm test -- tests/sidepanel/styles.test.ts`

Expected: all Side Panel style tests pass.

Run: `npm run build && git diff --check`

Expected: TypeScript check, all tests, both Vite builds, and diff check pass; the production Side Panel CSS asset is regenerated under `dist/assets/`.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/sidepanel/styles.css tests/sidepanel/styles.test.ts dist
git commit -m "style: enlarge note field text"
```

- [ ] **Step 6: Perform Chrome acceptance**

Reload the unpacked extension from `dist/`, open the note editor, and verify “职位备注” plus entered/placeholder text use the larger size. Confirm the dialog title remains `16px`, the textarea and buttons keep their dimensions, and the clear-confirmation dialog remains unchanged.
