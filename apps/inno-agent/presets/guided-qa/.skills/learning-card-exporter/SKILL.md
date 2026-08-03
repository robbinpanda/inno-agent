---
name: learning-card-exporter
description: Maintain the guided-qa workspace's learning-card export page. Use after creating or updating knowledge cards or problem cards, and whenever the learner asks to browse, select, print, or export learning cards as PDF. Build a polished local HTML workspace from the Markdown cards without changing the cards themselves.
---

# Learning Card Exporter

Maintain one local export workspace at `card-export/`. The source of truth remains:

- `learning-cards/knowledge/*.md`
- `learning-cards/problems/*.md`

Do not ask the learner or the tutoring Agent to produce JSON. The provided script reads the Markdown cards and prepares a lightweight manifest automatically.

## Refresh the export workspace

Run this command from the current guided-qa workspace root:

```powershell
node .skills/learning-card-exporter/scripts/build-card-export.mjs .
```

Run it:

- immediately after a knowledge card or problem card is created or updated;
- before answering a request to view, select, print, or export cards;
- after a learner manually edits or deletes a card and asks to refresh the export page.

The command creates or refreshes:

- `card-export/index.html`: a fixed-size preview entry;
- `card-export/app.css`: screen and PDF styles;
- `card-export/app.js`: selection, on-demand loading, Markdown rendering, and printing;
- `card-export/manifest.json` and `manifest.js`: the same lightweight metadata and short previews in diagnostic and browser-loadable forms;
- `card-export/cards/*.js`: one generated, browser-loadable content chunk per Markdown card.

The complete card content is never copied into the HTML or the manifest. The Markdown files remain the source of truth. The generated card chunks are portable read-only mirrors that let a `file://` page load selected cards without using `fetch()`, which desktop browsers block for local files. A chunk loads only when the learner exports its card, then stays in a temporary in-page cache. This keeps `index.html` stable even when the workspace contains many cards.

The preset workspace ID is `preset-guided-qa`. Keep this ID and the `card-export/` resource root in the supplied entry page; they allow Inno Agent's preview to load selected card chunks without changing Inno Agent itself. Keep the entry page's CSS, manifest, and app references as static relative tags so Inno Agent can inline them into its preview; do not recreate those tags dynamically. Inno Agent's preview is for browsing only, while final PDF export belongs in a normal desktop browser.

It never edits or deletes files under `learning-cards/`.

## Help the learner export

After refreshing:

1. Resolve and show the full local path to `card-export/index.html`.
2. Explicitly tell the learner to open that file in Chrome, Edge, or another desktop browser. Do not direct them to export from Inno Agent's built-in preview.
3. If useful, provide this PowerShell shortcut from the workspace root:

```powershell
Start-Process (Resolve-Path .\card-export\index.html)
```

Then explain the short workflow:

1. Search or filter the cards.
2. Click cards in the desired PDF order; the numbered markers show that order.
3. Choose single-column, double-column, or landscape triple-column layout.
4. Click **导出 PDF**, then choose **另存为 PDF** in the browser print dialog. For the cleanest result, turn off browser headers and footers and turn on background graphics.

Do not claim that a PDF file has already been created: the final save location is chosen by the learner in the browser print dialog.

## Preserve the product behavior

The supplied page already implements the original product's export behavior:

- knowledge cards and problem cards share one selector;
- cards are displayed newest first;
- selection order is the PDF order;
- the initial selection is empty;
- double-column A4 portrait is the default;
- single-column A4 portrait and triple-column A4 landscape are also available;
- only selected cards appear in print;
- knowledge-card and problem-card field order follows the card contracts.
- print starts with the first selected card instead of a separate cover header;
- cards fill the first column from top to bottom, then continue in the next column and then the next page;
- a long card continues at a section boundary, and problem-solving steps can continue one step at a time, so content does not fall outside the paper;
- card numbering follows the learner's selected order, while solution-step numbering is preserved independently;
- print typography and spacing stay compact so adjacent cards connect without large artificial gaps.

The current card contracts are:

- knowledge card: `知识点`, `原理`, `使用场景`, `题目链接`;
- problem card: `题目`, `解题步骤`, `易错点`, `如何想到`, `最终答案`.

The renderer may read older card files for backward compatibility. Map `核心想法` to `原理`, `什么时候使用` to `使用场景`, `与当前题目的连接` to `题目链接`, and `题目摘要` to `题目`. Do not rewrite the learner's old Markdown files or invent missing original problem text.

Use the supplied assets and script instead of rewriting the page for each conversation. Only modify the template when the learner explicitly asks to change the export experience.

## Handle empty or invalid input

Generate the page even when there are no cards so the learner sees a useful empty state. Skip unreadable files with a clear warning while continuing to export the remaining cards. If the script cannot run, state the limitation and point to the Markdown cards; do not pretend the page is current.

After refreshing, confirm the command's reported card count is nonzero when source cards exist and confirm `card-export/manifest.json` contains the same number of metadata entries. If the page still shows zero, rerun the command and reopen `card-export/index.html`; do not embed the cards into the HTML and do not create a separate hand-written data file.

If loading a selected card chunk fails, the page must show the failure and stop before opening the print dialog. Do not claim that the export succeeded.
