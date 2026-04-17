const state = {
  fetchedItems: [],
  fetchedItemCount: 0,
  fetchErrors: [],
  fetchErrorCount: 0,
  lastAnalysis: null,
  lastSavedTo: "",
  loginConfirmed: false,
  busy: false,
  statusText: "等待开始。",
  workspaceLoaded: false,
  workspaceHydrated: false,
  hydratePromise: null,
  saveTimer: null,
};

const elements = {
  coreTagsInput: document.querySelector("#coreTagsInput"),
  manualTextInput: document.querySelector("#manualTextInput"),
  sinceDaysInput: document.querySelector("#sinceDaysInput"),
  maxItemsInput: document.querySelector("#maxItemsInput"),
  maxPatternsInput: document.querySelector("#maxPatternsInput"),
  statusText: document.querySelector("#statusText"),
  workspaceMeta: document.querySelector("#workspaceMeta"),
  resultWrap: document.querySelector("#resultWrap"),
  fetchBtn: document.querySelector("#fetchBtn"),
  analyzeOnlyBtn: document.querySelector("#analyzeOnlyBtn"),
  clearWorkspaceBtn: document.querySelector("#clearWorkspaceBtn"),
  openLoginBtn: document.querySelector("#openLoginBtn"),
  confirmLoginBtn: document.querySelector("#confirmLoginBtn"),
  platformInputs: Array.from(document.querySelectorAll("input[type='checkbox']")),
};

boot();

async function boot() {
  bindEvents();
  renderPendingAnalysis("正在恢复上一次工作区...");
  await loadWorkspace();
  renderWorkspaceReadyHint();
  syncActionAvailability();
}

function bindEvents() {
  elements.fetchBtn.addEventListener("click", () => runPipeline({ fetchFirst: true }));
  elements.analyzeOnlyBtn.addEventListener("click", () => runPipeline({ fetchFirst: false }));
  elements.clearWorkspaceBtn.addEventListener("click", clearWorkspace);
  elements.openLoginBtn.addEventListener("click", openLoginPagesForSelectedPlatforms);
  elements.confirmLoginBtn.addEventListener("click", confirmLoginComplete);

  elements.platformInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.loginConfirmed = false;
      if (readPlatforms().length) {
        setStatus("平台有变动，系统已保留既有语料，但如果要继续抓新平台，请重新点“点击登录”后再确认。");
      } else {
        setStatus("未选择平台时，可以继续基于已有语料和手动文本分析。");
      }
      syncActionAvailability();
      scheduleWorkspaceSave();
    });
  });

  for (const input of [
    elements.coreTagsInput,
    elements.manualTextInput,
    elements.sinceDaysInput,
    elements.maxItemsInput,
    elements.maxPatternsInput,
  ]) {
    input.addEventListener("input", () => {
      if (!state.workspaceLoaded) return;
      scheduleWorkspaceSave();
      updateWorkspaceMeta();
    });
  }
}

async function loadWorkspace() {
  try {
    const response = await fetch("/api/workspace?mode=summary", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || "无法读取工作区");
    }

    applyWorkspace(data.workspace);
    state.workspaceLoaded = true;
    syncActionAvailability();
  } catch (error) {
    console.error(error);
    state.workspaceLoaded = true;
    setStatus(`工作区恢复失败：${error.message}`);
    updateWorkspaceMeta();
  }
}

function applyWorkspace(workspace) {
  const form = workspace.form || {};

  elements.coreTagsInput.value = arrayToLines(form.coreTags || []);
  elements.manualTextInput.value = form.manualText || "";
  elements.sinceDaysInput.value = String(form.sinceDays ?? 30);
  elements.maxItemsInput.value = String(form.maxItemsPerKeyword ?? 10);
  elements.maxPatternsInput.value = String(form.maxPatternsPerTag ?? 6);
  applyPlatformSelection(form.platforms || []);

  state.fetchedItems = Array.isArray(workspace.fetchedItems) ? workspace.fetchedItems : [];
  state.fetchErrors = Array.isArray(workspace.fetchErrors) ? workspace.fetchErrors : [];
  state.fetchedItemCount = Number(workspace.fetchedItemCount ?? state.fetchedItems.length) || 0;
  state.fetchErrorCount = Number(workspace.fetchErrorCount ?? state.fetchErrors.length) || 0;
  state.lastAnalysis = workspace.lastAnalysis || null;
  state.lastSavedTo = workspace.lastSavedTo || "";
  state.loginConfirmed = Boolean(workspace.loginConfirmed);
  state.statusText = workspace.statusText || "等待开始。";
  state.workspaceHydrated = Boolean(workspace.workspaceHydrated);

  setStatus(state.statusText);
  updateWorkspaceMeta();

  if (state.lastAnalysis) {
    renderAnalysis(state.lastAnalysis, {
      isPartial: false,
      savedTo: state.lastSavedTo,
      summary: `已恢复上一次工作区，当前累计 ${state.fetchedItemCount} 条语料。${buildErrorSummary(state.fetchErrorCount)}`,
      compact: true,
    });
  } else {
    renderPendingAnalysis("还没有历史分析结果。开始检索后，这里会持续累积并保留结果。");
  }
}

async function runPipeline({ fetchFirst }) {
  try {
    await ensureWorkspaceHydrated();
    setStatus(fetchFirst ? "正在继续抓取与分析标签成因..." : "正在基于当前工作区分析语料...");
    toggleBusy(true);

    if (fetchFirst) {
      await runIncrementalFetchPipeline();
      return;
    }

    renderPendingAnalysis("正在从当前工作区语料里抽取原因状态句...");
    const analyzeResult = await requestAnalysis({
      items: state.fetchedItems,
      coreTags: readCoreTags(),
      manualText: elements.manualTextInput.value,
      maxPatternsPerTag: Number(elements.maxPatternsInput.value) || 6,
      saveToFile: true,
    });

    state.lastAnalysis = analyzeResult.analysis;
    state.lastSavedTo = analyzeResult.savedTo;
    renderAnalysis(analyzeResult.analysis, {
      isPartial: false,
      savedTo: analyzeResult.savedTo,
      summary: `已基于当前工作区重新分析，累计 ${state.fetchedItemCount} 条历史语料。`,
    });
    setStatus(`分析完成，已生成 ${countNodes(analyzeResult.analysis)} 条原因状态。结果已存到 ${analyzeResult.savedTo}`);
    await persistWorkspaceNow();
  } catch (error) {
    console.error(error);
    setStatus(`处理失败：${error.message}`);
  } finally {
    toggleBusy(false);
  }
}

async function openLoginPagesForSelectedPlatforms() {
  try {
    toggleBusy(true);
    const platforms = readPlatforms();

    if (!platforms.length) {
      setStatus("请先勾选你要登录的平台。");
      return;
    }

    state.loginConfirmed = false;
    syncActionAvailability();
    setStatus("正在打开平台官网登录页，请在弹出的浏览器里扫码或登录...");
    const result = await postJson("/api/session/open-login-pages", { platforms });
    setStatus(result.message);
    await persistWorkspaceNow();
  } catch (error) {
    setStatus(`打开登录页失败：${error.message}`);
  } finally {
    toggleBusy(false);
  }
}

function confirmLoginComplete() {
  const platforms = readPlatforms();

  if (!platforms.length) {
    setStatus("当前没有选择平台，不需要确认登录，直接分析即可。");
    return;
  }

  state.loginConfirmed = true;
  syncActionAvailability();
  setStatus(`已确认 ${platforms.map(platformLabel).join(" / ")} 登录完成。系统会继续沿用这次登录态。`);
  scheduleWorkspaceSave();
}

async function runIncrementalFetchPipeline() {
  const coreTags = readCoreTags();
  const platforms = readPlatforms();
  const sinceDays = Number(elements.sinceDaysInput.value) || 30;
  const maxItemsPerKeyword = Number(elements.maxItemsInput.value) || 10;
  const maxPatternsPerTag = Number(elements.maxPatternsInput.value) || 6;
  const manualText = elements.manualTextInput.value;
  const jobs = buildFetchJobs(platforms, coreTags);

  renderPendingAnalysis(`正在等待第一批语料进入图谱。当前工作区已缓存 ${state.fetchedItemCount} 条历史语料...`);

  if (manualText.trim() || state.fetchedItems.length) {
    const warmupAnalysis = await requestAnalysis({
      items: state.fetchedItems,
      coreTags,
      manualText,
      maxPatternsPerTag,
      saveToFile: false,
    });

    renderAnalysis(warmupAnalysis.analysis, {
      isPartial: true,
      savedTo: "",
      summary: `先基于当前工作区预热分析，已有 ${state.fetchedItemCount} 条历史语料。`,
    });
  }

  if (!jobs.length) {
    const finalAnalyzeResult = await requestAnalysis({
      items: state.fetchedItems,
      coreTags,
      manualText,
      maxPatternsPerTag,
      saveToFile: true,
    });

    state.lastAnalysis = finalAnalyzeResult.analysis;
    state.lastSavedTo = finalAnalyzeResult.savedTo;
    renderAnalysis(finalAnalyzeResult.analysis, {
      isPartial: false,
      savedTo: finalAnalyzeResult.savedTo,
      summary: `没有选择平台，直接复用现有工作区语料分析。`,
    });
    setStatus(`分析完成，已生成 ${countNodes(finalAnalyzeResult.analysis)} 条原因状态。结果已存到 ${finalAnalyzeResult.savedTo}`);
    await persistWorkspaceNow();
    return;
  }

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    setStatus(`正在检索 ${index + 1}/${jobs.length}：${platformLabel(job.platform)} / ${job.coreTag}。当前缓存 ${state.fetchedItemCount} 条语料。`);

    const fetchResult = await postJson("/api/fetch", {
      keywords: [job.query],
      platforms: [job.platform],
      sinceDays,
      maxItemsPerKeyword,
      manualText: "",
    });

    state.fetchedItems = mergeItems(state.fetchedItems, fetchResult.items || []);
    state.fetchErrors = mergeErrors(state.fetchErrors, fetchResult.errors || []);
    state.fetchedItemCount = state.fetchedItems.length;
    state.fetchErrorCount = state.fetchErrors.length;
    updateWorkspaceMeta();
    await persistWorkspaceNow();

    if (state.fetchedItems.length || manualText.trim()) {
      const partialAnalyzeResult = await requestAnalysis({
        items: state.fetchedItems,
        coreTags,
        manualText,
        maxPatternsPerTag,
        saveToFile: false,
      });

      state.lastAnalysis = partialAnalyzeResult.analysis;
      renderAnalysis(partialAnalyzeResult.analysis, {
        isPartial: true,
        savedTo: "",
        summary: `已完成 ${index + 1}/${jobs.length} 组检索，工作区累计 ${state.fetchedItemCount} 条语料。${buildErrorSummary(state.fetchErrorCount)}`,
      });
      await persistWorkspaceNow();
    }
  }

  const finalAnalyzeResult = await requestAnalysis({
    items: state.fetchedItems,
    coreTags,
    manualText,
    maxPatternsPerTag,
    saveToFile: true,
  });

  state.lastAnalysis = finalAnalyzeResult.analysis;
  state.lastSavedTo = finalAnalyzeResult.savedTo;
  renderAnalysis(finalAnalyzeResult.analysis, {
    isPartial: false,
    savedTo: finalAnalyzeResult.savedTo,
    summary: `抓取完成，工作区累计 ${state.fetchedItemCount} 条语料。${buildErrorSummary(state.fetchErrorCount)}`,
  });
  setStatus(`抓取和分析完成，已生成 ${countNodes(finalAnalyzeResult.analysis)} 条原因状态。结果已存到 ${finalAnalyzeResult.savedTo}`);
  await persistWorkspaceNow();
}

async function clearWorkspace() {
  try {
    toggleBusy(true);
    const result = await postJson("/api/workspace/reset", {});
    applyWorkspace(result.workspace);
    setStatus("当前工作区缓存已清空，现在是一个新的持续工作区。");
    await persistWorkspaceNow();
  } catch (error) {
    console.error(error);
    setStatus(`清空缓存失败：${error.message}`);
  } finally {
    toggleBusy(false);
  }
}

function renderAnalysis(analysis, options = {}) {
  try {
    const summary = options.summary || analysis.stageSummary || "";
    const modeText = options.isPartial ? "阶段性结果" : "当前工作区结果";
    const groups = getRenderableGroups(analysis, {
      maxGroups: options.compact ? 8 : (options.isPartial ? 10 : 12),
      maxNodesPerGroup: options.compact ? 4 : 6,
    });
    const layout = buildVennLayout(groups);

    elements.resultWrap.classList.remove("empty");
    elements.resultWrap.innerHTML = `
      <section class="graph-intro graph-intro--minimal">
        <div>
          <p class="graph-kicker">${escapeHtml(modeText)}</p>
          <h3>标签交集图</h3>
          <p class="hint">${escapeHtml(summary)}</p>
          <p class="hint">${escapeHtml(analysis.stageSummary || "")}</p>
        </div>
        ${options.savedTo ? `<p class="hint">结果已保存到：${escapeHtml(options.savedTo)}</p>` : "<p class='hint'>这是工作区中的临时结果，刷新页面后也会继续保留。</p>"}
      </section>
      <div class="venn-stage">
        ${groups.map((group, index) => renderVennCluster(group, layout[index])).join("") || `
          <div class="empty-graph">
            <h3>还没有足够的原因状态句</h3>
            <p>可以继续补充更像“行为 + 情绪 + 情境”的原始语料，比如“白天摆着晚上开始自责”“不想社交但又怕被孤立”。</p>
          </div>
        `}
      </div>
    `;
  } catch (error) {
    console.error("renderAnalysis failed", error);
    renderTextFallback(analysis, options);
  }
}

function renderVennCluster(group, layout) {
  const safeNodes = Array.isArray(group.nodes) ? group.nodes.slice(0, 8) : [];
  const nodes = buildInnerNodeLayout(safeNodes);

  return `
    <article
      class="venn-cluster"
      style="left:${layout.left}%; top:${layout.top}%; width:${layout.size}%; height:${layout.size}%;"
    >
      <div class="venn-cluster-label">
        <span>${escapeHtml(group.tag)}</span>
      </div>
      ${nodes.map((node, index) => `
        <article
          class="venn-node venn-node--${reasonWeightClass(safeNodes[index])}"
          style="left:${node.left}%; top:${node.top}%; width:${node.size}%; height:${node.size}%;"
          title="${escapeAttribute(buildEvidencePreview(safeNodes[index]))}"
        >
          <strong>${escapeHtml(safeNodes[index]?.phrase || "")}</strong>
        </article>
      `).join("")}
    </article>
  `;
}

function buildVennLayout(groups) {
  const presets = {
    1: [{ left: 18, top: 14, size: 54 }],
    2: [
      { left: 6, top: 18, size: 48 },
      { left: 46, top: 18, size: 48 },
    ],
    3: [
      { left: 4, top: 18, size: 46 },
      { left: 50, top: 18, size: 46 },
      { left: 27, top: 48, size: 46 },
    ],
    4: [
      { left: 4, top: 10, size: 42 },
      { left: 50, top: 10, size: 42 },
      { left: 8, top: 44, size: 42 },
      { left: 46, top: 44, size: 42 },
    ],
    5: [
      { left: 2, top: 12, size: 40 },
      { left: 34, top: 6, size: 40 },
      { left: 58, top: 16, size: 40 },
      { left: 16, top: 44, size: 40 },
      { left: 48, top: 48, size: 40 },
    ],
    6: [
      { left: 0, top: 12, size: 38 },
      { left: 30, top: 4, size: 38 },
      { left: 60, top: 12, size: 38 },
      { left: 8, top: 44, size: 38 },
      { left: 38, top: 52, size: 38 },
      { left: 62, top: 42, size: 38 },
    ],
  };

  if (presets[groups.length]) {
    return presets[groups.length];
  }

  return groups.map((group, index) => {
    const angle = (Math.PI * 2 * index) / groups.length - Math.PI / 2;
    const radius = 26;
    return {
      left: 30 + Math.cos(angle) * radius,
      top: 30 + Math.sin(angle) * radius,
      size: 34,
    };
  });
}

function buildInnerNodeLayout(nodes) {
  const presets = {
    1: [{ left: 54, top: 54, size: 24 }],
    2: [
      { left: 34, top: 50, size: 22 },
      { left: 62, top: 38, size: 22 },
    ],
    3: [
      { left: 30, top: 44, size: 22 },
      { left: 58, top: 34, size: 22 },
      { left: 52, top: 64, size: 20 },
    ],
    4: [
      { left: 28, top: 38, size: 20 },
      { left: 60, top: 30, size: 20 },
      { left: 36, top: 64, size: 20 },
      { left: 68, top: 62, size: 18 },
    ],
    5: [
      { left: 26, top: 34, size: 18 },
      { left: 56, top: 26, size: 18 },
      { left: 68, top: 50, size: 18 },
      { left: 40, top: 66, size: 18 },
      { left: 20, top: 56, size: 18 },
    ],
    6: [
      { left: 22, top: 30, size: 17 },
      { left: 48, top: 22, size: 17 },
      { left: 70, top: 34, size: 17 },
      { left: 68, top: 60, size: 17 },
      { left: 42, top: 70, size: 17 },
      { left: 18, top: 58, size: 17 },
    ],
    7: [
      { left: 20, top: 28, size: 16 },
      { left: 44, top: 20, size: 16 },
      { left: 66, top: 28, size: 16 },
      { left: 74, top: 50, size: 16 },
      { left: 58, top: 68, size: 16 },
      { left: 34, top: 72, size: 16 },
      { left: 16, top: 54, size: 16 },
    ],
    8: [
      { left: 22, top: 24, size: 15 },
      { left: 44, top: 18, size: 15 },
      { left: 66, top: 24, size: 15 },
      { left: 76, top: 42, size: 15 },
      { left: 70, top: 64, size: 15 },
      { left: 48, top: 74, size: 15 },
      { left: 24, top: 68, size: 15 },
      { left: 14, top: 46, size: 15 },
    ],
  };

  return presets[nodes.length] || presets[8];
}

function reasonWeightClass(node) {
  if (!node || typeof node.count !== "number") return "sm";
  if (node.count >= 4) return "xl";
  if (node.count >= 3) return "lg";
  if (node.count >= 2) return "md";
  return "sm";
}

function getRenderableGroups(analysis, options = {}) {
  const maxGroups = options.maxGroups || 12;
  const maxNodesPerGroup = options.maxNodesPerGroup || 6;

  return (analysis.tagAnalyses || [])
    .filter((group) => !isInvalidCoreTag(group.tag))
    .filter((group) => group.nodeCount || group.relatedSentenceCount)
    .map((group) => ({
      ...group,
      nodes: Array.isArray(group.nodes) ? group.nodes.slice(0, maxNodesPerGroup) : [],
    }))
    .sort((a, b) => {
      const aScore = (a.nodeCount || 0) * 10 + (a.relatedSentenceCount || 0);
      const bScore = (b.nodeCount || 0) * 10 + (b.relatedSentenceCount || 0);
      return bScore - aScore;
    })
    .slice(0, maxGroups);
}

function buildEvidencePreview(node) {
  const evidence = Array.isArray(node?.evidence) ? node.evidence.filter(Boolean).slice(0, 2) : [];
  return evidence.join("\n");
}

function renderTextFallback(analysis, options = {}) {
  const groups = getRenderableGroups(analysis, { maxGroups: 8, maxNodesPerGroup: 5 });
  const summary = options.summary || analysis.stageSummary || "";

  elements.resultWrap.classList.remove("empty");
  elements.resultWrap.innerHTML = `
    <section class="graph-intro graph-intro--minimal">
      <div>
        <p class="graph-kicker">当前工作区结果</p>
        <h3>标签成因概览</h3>
        <p class="hint">${escapeHtml(summary)}</p>
      </div>
    </section>
    <div class="empty-graph">
      ${groups.map((group) => `
        <p><strong>${escapeHtml(group.tag)}</strong>：${escapeHtml((group.nodes || []).map((node) => node.phrase).filter(Boolean).join(" / "))}</p>
      `).join("")}
    </div>
  `;
}

function renderPendingAnalysis(message) {
  elements.resultWrap.classList.remove("empty");
  elements.resultWrap.innerHTML = `
    <div class="graph-intro graph-intro--minimal">
      <div>
        <p class="graph-kicker">持续工作区</p>
        <h3>交集图正在生成</h3>
        <p class="hint">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function buildFetchJobs(platforms, coreTags) {
  const jobs = [];

  for (const platform of platforms) {
    for (const coreTag of coreTags) {
      for (const query of buildQueryVariants(coreTag)) {
        jobs.push({
          platform,
          coreTag,
          query,
        });
      }
    }
  }

  return jobs;
}

function buildQueryVariants(coreTag) {
  const variants = {
    "内耗": ["大学生 内耗", "大学生 精神内耗", "大学生 想太多"],
    "摆烂": ["大学生 摆烂", "大学生 躺平", "大学生 提不起劲"],
    "社恐": ["大学生 社恐", "大学生 不敢社交", "大学生 害怕社交"],
    "焦虑": ["大学生 焦虑", "大学生 心慌", "大学生 不安"],
    "熬夜": ["大学生 熬夜", "大学生 晚睡", "大学生 作息乱"],
    "拖延": ["大学生 拖延", "大学生 启动不了", "大学生 拖到ddl"],
    "卷": ["大学生 内卷", "大学生 怕落后", "大学生 竞争压力"],
    "迷茫": ["大学生 迷茫", "大学生 没方向", "大学生 未来没底"],
  };

  return variants[coreTag] || [`大学生 ${coreTag}`, `当代大学生 ${coreTag}`];
}

function mergeItems(existingItems, newItems) {
  const seen = new Set();
  const merged = [];

  for (const item of [...existingItems, ...newItems]) {
    const key = `${item.platform}::${item.keyword}::${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function mergeErrors(existingErrors, newErrors) {
  const seen = new Set();
  const merged = [];

  for (const error of [...existingErrors, ...newErrors]) {
    const key = `${error.platform || ""}::${error.keyword || ""}::${error.message || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(error);
  }

  return merged;
}

function buildErrorSummary(errors) {
  const errorCount = Array.isArray(errors) ? errors.length : Number(errors) || 0;
  if (!errorCount) return "当前没有平台报错。";
  return `当前累计 ${errorCount} 组检索暂时没拿到语料，通常是登录态或风控导致。`;
}

function countNodes(analysis) {
  return (analysis.tagAnalyses || []).reduce((sum, group) => sum + group.nodeCount, 0);
}

function readCoreTags() {
  return elements.coreTagsInput.value
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item
      .replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, "")
      .replace(/[（(].*?[）)]/g, "")
      .replace(/[\/|｜]/g, " ")
      .replace(/\s+/g, " ")
      .trim())
    .filter((item) => item && !isInvalidCoreTag(item));
}

function readPlatforms() {
  return elements.platformInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function applyPlatformSelection(platforms) {
  const chosen = new Set(platforms);
  elements.platformInputs.forEach((input) => {
    input.checked = chosen.has(input.value);
  });
}

function arrayToLines(list) {
  return Array.isArray(list) ? list.join("\n") : "";
}

function isInvalidCoreTag(tag) {
  if (!tag) return true;
  if (/^[⸻\-—–_]+$/.test(tag)) return true;
  if (tag.length > 12) return true;
  if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(tag)) return true;
  return /(状态类|行为类|身份类|关系类|结构性状态|抽象标签|自我认同|日常状态|习惯|原因层|情绪|心理|分组|标签)/.test(tag);
}

function setStatus(message) {
  state.statusText = message;
  elements.statusText.textContent = message;
}

function updateWorkspaceMeta() {
  const nodeCount = state.lastAnalysis ? countNodes(state.lastAnalysis) : 0;
  const restoreMode = state.workspaceHydrated ? "已完整恢复" : "已快速恢复";
  elements.workspaceMeta.textContent = `当前缓存：${state.fetchedItemCount} 条语料，${nodeCount} 条原因状态，${state.fetchErrorCount} 条抓取提示，${restoreMode}。`;
}

function toggleBusy(isBusy) {
  state.busy = isBusy;
  syncActionAvailability();
}

function syncActionAvailability() {
  const hasPlatforms = readPlatforms().length > 0;
  const needsLoginConfirmation = hasPlatforms && !state.loginConfirmed;

  elements.openLoginBtn.disabled = state.busy;
  elements.confirmLoginBtn.disabled = state.busy || !hasPlatforms;
  elements.fetchBtn.disabled = state.busy || needsLoginConfirmation;
  elements.analyzeOnlyBtn.disabled = state.busy;
  elements.clearWorkspaceBtn.disabled = state.busy;
}

function buildWorkspaceSnapshot() {
  return {
    form: {
      coreTags: readCoreTags(),
      platforms: readPlatforms(),
      sinceDays: Number(elements.sinceDaysInput.value) || 30,
      maxItemsPerKeyword: Number(elements.maxItemsInput.value) || 10,
      maxPatternsPerTag: Number(elements.maxPatternsInput.value) || 6,
      manualText: elements.manualTextInput.value,
    },
    fetchedItems: state.fetchedItems,
    fetchErrors: state.fetchErrors,
    fetchedItemCount: state.fetchedItemCount,
    fetchErrorCount: state.fetchErrorCount,
    lastAnalysis: state.lastAnalysis,
    lastSavedTo: state.lastSavedTo,
    loginConfirmed: state.loginConfirmed,
    statusText: state.statusText,
    workspaceHydrated: state.workspaceHydrated,
  };
}

function scheduleWorkspaceSave() {
  if (!state.workspaceLoaded) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    persistWorkspaceNow().catch((error) => {
      console.error(error);
    });
  }, 250);
}

async function persistWorkspaceNow() {
  if (!state.workspaceLoaded) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  await postJson("/api/workspace/save", {
    workspace: buildWorkspaceSnapshot(),
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "请求失败");
  }

  return data;
}

async function requestAnalysis(payload) {
  return postJson("/api/analyze", payload);
}

function renderWorkspaceReadyHint() {
  if (state.workspaceHydrated || !state.fetchedItemCount) return;
  setStatus(`页面已快速打开，历史语料 ${state.fetchedItemCount} 条会在你开始检索或分析前再完整接入。`);
}

async function ensureWorkspaceHydrated() {
  if (state.workspaceHydrated || !state.fetchedItemCount) {
    state.workspaceHydrated = true;
    return;
  }

  if (!state.hydratePromise) {
    state.hydratePromise = hydrateWorkspace()
      .finally(() => {
        state.hydratePromise = null;
      });
  }

  await state.hydratePromise;
}

async function hydrateWorkspace() {
  setStatus(`正在接入历史工作区全文数据，当前共 ${state.fetchedItemCount} 条语料...`);
  const response = await fetch("/api/workspace?mode=full", { cache: "no-store" });
  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "无法读取完整工作区");
  }

  const workspace = data.workspace || {};
  state.fetchedItems = Array.isArray(workspace.fetchedItems) ? workspace.fetchedItems : [];
  state.fetchErrors = Array.isArray(workspace.fetchErrors) ? workspace.fetchErrors : [];
  state.fetchedItemCount = state.fetchedItems.length;
  state.fetchErrorCount = state.fetchErrors.length;
  state.lastAnalysis = workspace.lastAnalysis || state.lastAnalysis;
  state.lastSavedTo = workspace.lastSavedTo || state.lastSavedTo;
  state.workspaceHydrated = true;
  updateWorkspaceMeta();
}

function platformLabel(platform) {
  const map = {
    weibo: "微博",
    bilibili: "B站",
    xiaohongshu: "小红书",
    douyin: "抖音",
    manual: "手动补充",
  };
  return map[platform] || platform;
}

function hasAnyText(text, fragments) {
  return fragments.some((fragment) => text.includes(fragment));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}
