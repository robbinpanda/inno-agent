---
name: learning-card-exporter
description: Maintain the guided-qa workspace's learning-card export page. Use after creating or updating knowledge cards or problem cards, and whenever the learner asks to browse, select, print, or export learning cards as PDF. Build a polished local HTML workspace from the Markdown cards without changing the cards themselves.
---

# Learning Card Exporter

Maintain one local export workspace at `card-export/`. The source of truth remains:

- `learning-cards/knowledge/*.md`
- `learning-cards/problems/*.md`

Do not ask the learner or the tutoring Agent to produce JSON. The provided script reads the Markdown cards and prepares the HTML data automatically.

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

- `card-export/index.html`
- `card-export/cards-data.js`

It never edits or deletes files under `learning-cards/`.

## Help the learner export

After refreshing, link the learner to `card-export/index.html` and explain the short workflow:

1. Open the page in a browser.
2. Search or filter the cards.
3. Click cards in the desired PDF order; the numbered markers show that order.
4. Choose single-column, double-column, or landscape triple-column layout.
5. Click **导出 PDF**, then choose **另存为 PDF** in the browser print dialog.

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

Use the supplied assets and script instead of rewriting the page for each conversation. Only modify the template when the learner explicitly asks to change the export experience.

## Handle empty or invalid input

Generate the page even when there are no cards so the learner sees a useful empty state. Skip unreadable files with a clear warning while continuing to export the remaining cards. If the script cannot run, state the limitation and point to the Markdown cards; do not pretend the page is current.
