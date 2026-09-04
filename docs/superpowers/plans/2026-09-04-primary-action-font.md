# Primary Action Button Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set the footer actions and note-dialog actions to `14px` without changing other Side Panel typography or behavior.

**Architecture:** Extend two existing, narrowly scoped CSS rules: `.panel-footer button` for export/clear and `.dialog-card[data-dialog="note"] .dialog-actions button` for note cancel/save. Protect the scope and unchanged dimensions with the existing CSS contract test.

**Tech Stack:** CSS, TypeScript, Vitest, Vite

---

### Task 1: Enlarge Footer and Note Dialog Action Text

**Files:**
- Modify: `tests/sidepanel/styles.test.ts`
- Modify: `src/sidepanel/styles.css`

- [ ] **Step 1: Write the failing style-contract test**

Add this test to `tests/sidepanel/styles.test.ts`:

```ts
it("uses 14px text for footer and note dialog actions only", () => {
  const footerButtons = rule(".panel-footer button");
  expect(footerButtons).toMatch(/font-size:\s*14px/);
  expect(footerButtons).toMatch(/min-height:\s*36px/);

  expect(rule('.dialog-card[data-dialog="note"] .dialog-actions button')).toMatch(
    /font-size:\s*14px/,
  );
  expect(rule(".dialog-actions button")).not.toMatch(/font-size:/);
  expect(rule('.dialog-card[data-dialog="clear"] .dialog-actions button')).toMatch(
    /font-size:\s*14px/,
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/sidepanel/styles.test.ts`

Expected: FAIL because the footer and note-dialog-specific `14px` rules do not exist.

- [ ] **Step 3: Add the minimal scoped CSS**

Add `font-size: 14px` to the existing footer button rule and add the note-dialog-specific rule:

```css
.panel-footer button {
  flex: 1;
  min-height: 36px;
  font-size: 14px;
}

.dialog-card[data-dialog="note"] .dialog-actions button {
  font-size: 14px;
}
```

Do not alter the existing declarations in either component.

- [ ] **Step 4: Run focused and full verification**

Run: `npm test -- tests/sidepanel/styles.test.ts`

Expected: all Side Panel style tests pass.

Run: `npm run build && git diff --check`

Expected: TypeScript check, all tests, both Vite builds, and diff check pass; the production Side Panel CSS asset is regenerated under `dist/assets/`.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/sidepanel/styles.css tests/sidepanel/styles.test.ts
git commit -m "style: enlarge primary action text"
```

- [ ] **Step 6: Perform Chrome acceptance**

Reload the unpacked extension from `dist/`. Verify “导出 CSV”, “清空”, note “取消”, and note “保存” use the larger text; confirm the buttons keep their existing dimensions and the clear-confirmation dialog remains unchanged.
