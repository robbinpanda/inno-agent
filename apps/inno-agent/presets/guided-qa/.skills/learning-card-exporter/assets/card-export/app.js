(() => {
  "use strict";

  const CONFIG = window.CARD_EXPORT_CONFIG || {
    workspaceId: "preset-guided-qa",
    resourceRoot: "card-export",
  };
  const KNOWLEDGE_ORDER = ["知识点", "原理", "使用场景", "题目链接"];
  const PROBLEM_ORDER = ["题目", "解题步骤", "易错点", "如何想到", "最终答案"];
  const SECTION_ALIASES = {
    知识点: ["知识点"],
    原理: ["原理", "核心想法", "推导步骤"],
    使用场景: ["使用场景", "什么时候使用"],
    题目链接: ["题目链接", "与当前题目的连接"],
    题目: ["题目", "题目摘要"],
    解题步骤: ["解题步骤"],
    易错点: ["易错点"],
    如何想到: ["如何想到"],
    最终答案: ["最终答案"],
  };
  const IS_STANDALONE =
    window.location.protocol === "file:" ||
    /\/card-export\/index\.html$/i.test(window.location.pathname);
  const scriptLoads = new Map();

  function resourceUrl(path, kind = "workspace") {
    if (IS_STANDALONE) {
      const localPath =
        kind === "export" ? path.replace(new RegExp(`^${CONFIG.resourceRoot}/`), "") : path;
      return kind === "export" ? `./${localPath}` : `../${localPath}`;
    }
    const params = new URLSearchParams({
      workspaceId: CONFIG.workspaceId,
      path,
    });
    return `/api/workspace/raw?${params}`;
  }

  function loadScript(path, kind = "export") {
    const url = resourceUrl(path, kind);
    if (scriptLoads.has(url)) return scriptLoads.get(url);

    const pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptLoads.delete(url);
        reject(new Error(`无法加载资源：${path}`));
      };
      document.head.append(script);
    });
    scriptLoads.set(url, pending);
    return pending;
  }

  function normalizeText(value) {
    return String(value ?? "").replace(/\r\n/g, "\n").trim();
  }

  function stripYamlValue(value) {
    const trimmed = String(value ?? "").trim();
    if (
      trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  function parseCard(markdown, metadata) {
    const normalized = String(markdown ?? "").replace(/\r\n/g, "\n");
    const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
    const frontmatter = {};
    let body = normalized;

    if (frontmatterMatch) {
      for (const line of frontmatterMatch[1].split("\n")) {
        const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (match) frontmatter[match[1]] = stripYamlValue(match[2]);
      }
      body = normalized.slice(frontmatterMatch[0].length);
    }

    const headings = Array.from(body.matchAll(/^##\s+(.+?)\s*$/gm));
    const sections = headings.map((heading, index) => {
      const contentStart = heading.index + heading[0].length;
      const contentEnd = headings[index + 1]?.index ?? body.length;
      return {
        label: normalizeText(heading[1]),
        markdown: normalizeText(body.slice(contentStart, contentEnd)),
      };
    });
    const titleMatch = body.match(/^#\s+(.+)$/m);

    return {
      ...metadata,
      title:
        normalizeText(frontmatter.title) ||
        normalizeText(titleMatch?.[1]) ||
        metadata.title ||
        "未命名卡片",
      type:
        frontmatter.type === "knowledge_card" || frontmatter.type === "problem_card"
          ? frontmatter.type
          : metadata.type,
      sections,
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderInline(value) {
    let html = escapeHtml(value);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\$([^$\n]+)\$/g, '<span class="math-fallback">$$$1$$</span>');
    return html;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
    const output = [];
    let paragraph = [];
    let listType = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      output.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (!listType) return;
      output.push(`</${listType}>`);
      listType = null;
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        closeList();
        continue;
      }

      if (trimmed.startsWith("$$")) {
        flushParagraph();
        closeList();
        let expression = trimmed.slice(2);
        while (!expression.endsWith("$$") && index + 1 < lines.length) {
          index += 1;
          expression += `\n${lines[index]}`;
        }
        expression = expression.replace(/\$\$$/, "");
        output.push(`<div class="math-fallback">$$${escapeHtml(expression.trim())}$$</div>`);
        continue;
      }

      const subheading = trimmed.match(/^###\s+(.+)$/);
      if (subheading) {
        flushParagraph();
        closeList();
        output.push(`<h4>${renderInline(subheading[1])}</h4>`);
        continue;
      }

      const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      const item = ordered || unordered;
      if (item) {
        flushParagraph();
        const wantedList = ordered ? "ol" : "ul";
        if (listType !== wantedList) {
          closeList();
          listType = wantedList;
          output.push(`<${listType}>`);
        }
        output.push(
          ordered
            ? `<li value="${Number(ordered[1])}">${renderInline(ordered[2])}</li>`
            : `<li>${renderInline(unordered[1])}</li>`,
        );
        continue;
      }

      closeList();
      paragraph.push(trimmed);
    }

    flushParagraph();
    closeList();
    return output.join("");
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "时间未知";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function cardTypeLabel(card) {
    return card.type === "knowledge_card" ? "知识卡片" : "题目卡片";
  }

  function typesetMath(root = document.body) {
    if (typeof window.renderMathInElement !== "function") return;
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    } catch {
      // The raw LaTeX stays readable when the optional CDN typesetter is unavailable.
    }
  }

  async function start() {
    const elements = {
      cardList: document.querySelector("#card-list"),
      selectionCount: document.querySelector("#selection-count"),
      visibleCount: document.querySelector("#visible-count"),
      selectedSequence: document.querySelector("#selected-sequence"),
      exportCount: document.querySelector("#export-count"),
      exportStatus: document.querySelector("#export-status"),
      exportButton: document.querySelector("#export-button"),
      printRoot: document.querySelector("#print-root"),
      pageSizeStyle: document.querySelector("#page-size-style"),
      warningBox: document.querySelector("#warning-box"),
      previewNotice: document.querySelector("#preview-notice"),
      searchInput: document.querySelector("#search-input"),
      selectVisible: document.querySelector("#select-visible"),
      clearSelected: document.querySelector("#clear-selected"),
    };
    const originalTitle = document.title;
    const state = {
      cards: [],
      cardsById: new Map(),
      cardCache: new Map(),
      filter: "all",
      query: "",
      layout: "double",
      selectedIds: [],
      loadingExport: false,
    };

    if (!IS_STANDALONE) {
      elements.previewNotice.hidden = false;
      elements.exportStatus.textContent = "Inno 仅供预览";
      elements.exportButton.textContent = "请在电脑浏览器导出";
      document.querySelector(".print-help").textContent =
        "请在电脑浏览器中直接打开 card-export/index.html，再选择卡片并导出 PDF。";
    }

    function setWarning(message, isError = false) {
      elements.warningBox.hidden = !message;
      elements.warningBox.classList.toggle("error", isError);
      elements.warningBox.textContent = message || "";
    }

    function setControlsEnabled(enabled) {
      elements.searchInput.disabled = !enabled;
      elements.selectVisible.disabled = !enabled;
      elements.clearSelected.disabled = !enabled;
      document.querySelectorAll("[data-filter]").forEach((button) => {
        button.disabled = !enabled;
      });
    }

    function visibleCards() {
      const query = state.query.trim().toLocaleLowerCase("zh-CN");
      return state.cards.filter((card) => {
        if (state.filter !== "all" && card.type !== state.filter) return false;
        if (!query) return true;
        return [card.title, card.sourcePath, card.preview]
          .join("\n")
          .toLocaleLowerCase("zh-CN")
          .includes(query);
      });
    }

    function moveSelected(id, direction) {
      const index = state.selectedIds.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= state.selectedIds.length) return;
      [state.selectedIds[index], state.selectedIds[nextIndex]] = [
        state.selectedIds[nextIndex],
        state.selectedIds[index],
      ];
      render();
    }

    function renderCardList() {
      const visible = visibleCards();
      elements.visibleCount.textContent = `当前显示 ${visible.length} 张`;

      if (!state.cards.length) {
        elements.cardList.innerHTML = `
          <div class="empty-state">
            <div class="empty-mark">卡</div>
            <h3>还没有学习卡片</h3>
            <p>完成一次知识点讲解或一道题后，Agent 会生成卡片并刷新这里。</p>
          </div>`;
        return;
      }

      if (!visible.length) {
        elements.cardList.innerHTML = `
          <div class="empty-state">
            <div class="empty-mark">⌕</div>
            <h3>没有找到匹配的卡片</h3>
            <p>换一个关键词，或切回“全部”类型试试。</p>
          </div>`;
        return;
      }

      elements.cardList.innerHTML = visible
        .map((card) => {
          const selectedIndex = state.selectedIds.indexOf(card.id);
          const selected = selectedIndex >= 0;
          const problem = card.type === "problem_card";
          return `
            <article class="selector-card${selected ? " selected" : ""}${problem ? " problem" : ""}">
              <label class="selector-label">
                <input type="checkbox" data-card-id="${escapeHtml(card.id)}" ${selected ? "checked" : ""}>
                <span class="checkmark">${selected ? selectedIndex + 1 : ""}</span>
                <span class="selector-main">
                  <span class="selector-meta">
                    <span class="type-badge"><i class="type-dot"></i>${cardTypeLabel(card)}</span>
                    <span class="card-date">${formatDate(card.updatedAt)}</span>
                  </span>
                  <strong class="selector-title">${escapeHtml(card.title)}</strong>
                  <span class="selector-preview">${escapeHtml(card.preview || "卡片内容待补充")}</span>
                </span>
              </label>
              ${
                selected
                  ? `<div class="order-tools" aria-label="调整导出顺序">
                      <button class="order-button" data-move="-1" data-card-id="${escapeHtml(card.id)}" type="button" title="向前移动" ${selectedIndex === 0 ? "disabled" : ""}>↑</button>
                      <button class="order-button" data-move="1" data-card-id="${escapeHtml(card.id)}" type="button" title="向后移动" ${selectedIndex === state.selectedIds.length - 1 ? "disabled" : ""}>↓</button>
                    </div>`
                  : ""
              }
            </article>`;
        })
        .join("");
    }

    function renderSelection() {
      const count = state.selectedIds.length;
      elements.selectionCount.textContent = count
        ? `已选 ${count} / ${state.cards.length} 张`
        : "尚未选择";
      elements.exportCount.textContent = String(count);
      elements.exportButton.disabled = count === 0 || state.loadingExport || !IS_STANDALONE;
      elements.clearSelected.disabled = count === 0;

      if (!count) {
        elements.selectedSequence.innerHTML =
          '<li class="sequence-empty">点击左侧卡片开始编排。</li>';
        return;
      }

      elements.selectedSequence.innerHTML = state.selectedIds
        .map((id, index) => {
          const card = state.cardsById.get(id);
          return `<li><b>${index + 1}</b><span>${escapeHtml(card?.title || id)}</span></li>`;
        })
        .join("");
    }

    function render() {
      renderCardList();
      renderSelection();
    }

    async function loadCard(metadata) {
      if (!metadata) throw new Error("所选卡片不在当前清单中");
      if (state.cardCache.has(metadata.id)) return state.cardCache.get(metadata.id);
      const pending = loadScript(metadata.chunkPath, "export")
        .then(() => {
          const markdown = window.CARD_EXPORT_CARD_CHUNKS?.[metadata.id];
          if (typeof markdown !== "string") {
            throw new Error("卡片资源已加载，但没有找到正文");
          }
          return parseCard(markdown, metadata);
        })
        .catch((error) => {
          state.cardCache.delete(metadata.id);
          throw new Error(`${metadata.title}: ${error.message}`);
        });
      state.cardCache.set(metadata.id, pending);
      return pending;
    }

    function normalizedSections(card) {
      const order = card.type === "knowledge_card" ? KNOWLEDGE_ORDER : PROBLEM_ORDER;
      return order.map((label) => {
        if (label === "原理") {
          const direct = (card.sections || []).find(
            (section) => section.label === "原理" && section.markdown,
          );
          if (direct) return { label, markdown: direct.markdown, legacyLabel: "" };

          const coreIdea = (card.sections || []).find(
            (section) => section.label === "核心想法" && section.markdown,
          )?.markdown;
          const derivation = (card.sections || []).find(
            (section) => section.label === "推导步骤" && section.markdown,
          )?.markdown;
          const legacyPrinciple = [coreIdea, derivation ? `### 推导\n\n${derivation}` : ""]
            .filter(Boolean)
            .join("\n\n");
          return { label, markdown: legacyPrinciple, legacyLabel: legacyPrinciple ? "旧版组合" : "" };
        }

        const aliases = SECTION_ALIASES[label] || [label];
        const source = aliases
          .map((alias) => (card.sections || []).find((section) => section.label === alias))
          .find((section) => section && section.markdown);
        return {
          label,
          markdown: source?.markdown || "",
          legacyLabel: source && source.label !== label ? source.label : "",
        };
      });
    }

    function sectionClass(card, label) {
      if (card.type === "knowledge_card") {
        if (label === "知识点") return " lead";
        if (label === "题目链接") return " connection";
      } else {
        if (label === "题目") return " lead";
        if (label === "最终答案") return " connection";
      }
      return "";
    }

    function parseSolutionSteps(markdown) {
      const source = String(markdown ?? "").replace(/\r\n/g, "\n");
      const matches = Array.from(source.matchAll(/^(\d+)[.)]\s+(.+)$/gm));
      if (!matches.length) return [];
      return matches.map((match, index) => {
        const contentStart = match.index + match[0].length;
        const contentEnd = matches[index + 1]?.index ?? source.length;
        return {
          number: Number(match[1]),
          title: match[2],
          markdown: normalizeText(source.slice(contentStart, contentEnd)),
        };
      });
    }

    function renderSolutionStep(step) {
      return `
        <div class="solution-step">
          <span class="solution-step-number">${step.number}</span>
          <div class="solution-step-body">
            <h4>${renderInline(step.title)}</h4>
            ${step.markdown ? renderMarkdown(step.markdown) : ""}
          </div>
        </div>`;
    }

    function renderSectionParts(card) {
      const parts = [];
      for (const section of normalizedSections(card)) {
        if (card.type === "problem_card" && section.label === "解题步骤") {
          const steps = parseSolutionSteps(section.markdown);
          if (steps.length) {
            steps.forEach((step, index) => {
              parts.push(`
                <section class="print-section solution-section${sectionClass(card, section.label)}">
                  ${index === 0 ? "<h3>解题步骤</h3>" : '<h3 class="continued-label">解题步骤 · 续</h3>'}
                  ${renderSolutionStep(step)}
                </section>`);
            });
            continue;
          }
        }

        parts.push(`
          <section class="print-section${sectionClass(card, section.label)}">
            <h3>${escapeHtml(section.label)}</h3>
            ${
              section.markdown
                ? renderMarkdown(section.markdown)
                : '<p class="print-empty">本项暂无记录。</p>'
            }
          </section>`);
      }
      return parts;
    }

    function renderCardHeader(card, index, continued = false) {
      return `
        <header>
          <span class="print-number">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <small>${cardTypeLabel(card)}${continued ? " · 续" : ""}</small>
            <h2>${renderInline(card.title)}</h2>
          </div>
        </header>`;
    }

    function renderPrint(selectedCards) {
      const layoutMeta = {
        single: { columns: 1, page: "A4 portrait" },
        double: { columns: 2, page: "A4 portrait" },
        triple: { columns: 3, page: "A4 landscape" },
      }[state.layout];

      elements.pageSizeStyle.textContent =
        `@media print { @page { size: ${layoutMeta.page}; margin: 8mm; } }`;
      elements.printRoot.className =
        `print-root is-preparing print-layout-${state.layout}`;
      elements.printRoot.style.setProperty("--print-columns", String(layoutMeta.columns));
      elements.printRoot.innerHTML = "";

      const columns = [];
      let columnIndex = -1;

      const addPage = () => {
        const page = document.createElement("section");
        page.className = "print-page";
        const grid = document.createElement("div");
        grid.className = "print-page-grid";
        page.append(grid);
        for (let index = 0; index < layoutMeta.columns; index += 1) {
          const column = document.createElement("div");
          column.className = "print-column";
          grid.append(column);
          columns.push(column);
        }
        elements.printRoot.append(page);
      };

      const nextColumn = () => {
        columnIndex += 1;
        if (!columns[columnIndex]) addPage();
        return columns[columnIndex];
      };

      const overflows = (column) => column.scrollHeight > column.clientHeight + 1;

      let currentColumn = nextColumn();

      selectedCards.forEach((card, cardIndex) => {
        const problemClass = card.type === "problem_card" ? " problem" : "";
        const parts = renderSectionParts(card);
        let continued = false;
        let fragment;

        const beginFragment = () => {
          fragment = document.createElement("article");
          fragment.className =
            `print-card print-card-fragment${problemClass}${continued ? " continued" : ""}`;
          fragment.innerHTML = renderCardHeader(card, cardIndex, continued);
          currentColumn.append(fragment);
          typesetMath(fragment);

          if (overflows(currentColumn) && currentColumn.children.length > 1) {
            fragment.remove();
            currentColumn = nextColumn();
            currentColumn.append(fragment);
          }
        };

        beginFragment();

        parts.forEach((partHtml) => {
          const template = document.createElement("template");
          template.innerHTML = partHtml.trim();
          const section = template.content.firstElementChild;
          fragment.append(section);
          typesetMath(section);

          if (!overflows(currentColumn)) return;

          section.remove();
          const hasSection = Boolean(fragment.querySelector(".print-section"));
          if (!hasSection) {
            fragment.remove();
          }
          currentColumn = nextColumn();
          continued = hasSection || continued;
          beginFragment();
          fragment.append(section);
          typesetMath(section);

          if (overflows(currentColumn)) {
            section.classList.add("oversized-section");
            currentColumn.classList.add("contains-oversized");
          }
        });
      });

      elements.printRoot.classList.remove("is-preparing");
    }

    elements.cardList.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-card-id]");
      if (!input) return;
      const id = input.dataset.cardId;
      const selectedIndex = state.selectedIds.indexOf(id);
      if (input.checked && selectedIndex < 0) {
        state.selectedIds.push(id);
      } else if (!input.checked && selectedIndex >= 0) {
        state.selectedIds.splice(selectedIndex, 1);
      }
      render();
    });

    elements.cardList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-move]");
      if (button) moveSelected(button.dataset.cardId, Number(button.dataset.move));
    });

    elements.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderCardList();
    });

    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderCardList();
      });
    });

    elements.selectVisible.addEventListener("click", () => {
      for (const card of visibleCards()) {
        if (!state.selectedIds.includes(card.id)) state.selectedIds.push(card.id);
      }
      render();
    });

    elements.clearSelected.addEventListener("click", () => {
      state.selectedIds = [];
      render();
    });

    document.querySelectorAll('input[name="layout"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.layout = input.value;
      });
    });

    elements.exportButton.addEventListener("click", async () => {
      if (!IS_STANDALONE || !state.selectedIds.length || state.loadingExport) return;
      state.loadingExport = true;
      elements.exportButton.textContent = "正在读取卡片…";
      elements.exportStatus.textContent = "正在按需加载正文";
      renderSelection();

      try {
        const selectedCards = await Promise.all(
          state.selectedIds.map((id) => loadCard(state.cardsById.get(id))),
        );
        renderPrint(selectedCards);
        setWarning("");
        const date = new Date().toISOString().slice(0, 10);
        document.title = `学习卡片-${date}`;
        requestAnimationFrame(() => window.print());
      } catch (error) {
        setWarning(`无法读取选中的卡片正文：${error.message}`, true);
      } finally {
        state.loadingExport = false;
        elements.exportButton.textContent = "导出 PDF";
        elements.exportStatus.textContent = "本次将导出";
        renderSelection();
      }
    });

    window.addEventListener("afterprint", () => {
      document.title = originalTitle;
    });

    try {
      if (!window.CARD_EXPORT_MANIFEST) {
        await loadScript(`${CONFIG.resourceRoot}/manifest.js`, "export");
      }
      const manifest = window.CARD_EXPORT_MANIFEST;
      if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.cards)) {
        throw new Error("manifest.js 格式不受支持，请重新运行刷新脚本");
      }

      state.cards = manifest.cards;
      state.cardsById = new Map(state.cards.map((card) => [card.id, card]));
      document.querySelector("#total-stat").textContent = String(state.cards.length);
      document.querySelector("#knowledge-stat").textContent = String(
        state.cards.filter((card) => card.type === "knowledge_card").length,
      );
      document.querySelector("#problem-stat").textContent = String(
        state.cards.filter((card) => card.type === "problem_card").length,
      );
      setControlsEnabled(true);

      if (Array.isArray(manifest.warnings) && manifest.warnings.length) {
        setWarning(`有 ${manifest.warnings.length} 个文件未能读取，其他卡片仍可正常导出。`);
      }
      render();
      typesetMath(document.body);
    } catch (error) {
      setControlsEnabled(false);
      elements.selectionCount.textContent = "清单读取失败";
      elements.cardList.innerHTML = `
        <div class="empty-state">
          <div class="empty-mark">!</div>
          <h3>暂时无法读取卡片清单</h3>
          <p>请让 Agent 重新运行卡片导出刷新脚本后再打开此页面。</p>
        </div>`;
      setWarning(`卡片清单读取失败：${error.message}`, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
