const http = require("http");
const fsp = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const { fetchPlatformTexts, getSessionStatus, openLoginPages, warmupBrowserSession } = require("./lib/platforms");
const { analyzeCorpus, buildExportPayload } = require("./lib/analyzer");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3487);
const PUBLIC_DIR = path.join(__dirname, "public");
const OUTPUT_DIR = path.join(__dirname, "outputs");
const SESSION_DIR = path.join(__dirname, ".session");
const WORKSPACE_FILE = path.join(SESSION_DIR, "workspace.json");

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function start() {
  await fsp.mkdir(SESSION_DIR, { recursive: true });
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  const server = http.createServer(async (request, response) => {
    try {
      const parsedUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

      if (request.method === "OPTIONS") {
        sendEmpty(response, 204);
        return;
      }

      if (request.method === "GET" && (parsedUrl.pathname === "/" || parsedUrl.pathname.startsWith("/public/"))) {
        const relativePath = parsedUrl.pathname === "/" ? "index.html" : parsedUrl.pathname.replace(/^\/public\//, "");
        await serveStaticFile(response, relativePath);
        return;
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/status") {
        const status = await getSessionStatus();
        sendJson(response, 200, {
          ok: true,
          status,
          port: PORT,
        });
        return;
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/workspace") {
        const workspace = await readWorkspace();
        const mode = parsedUrl.searchParams.get("mode");
        sendJson(response, 200, {
          ok: true,
          workspace: mode === "full" ? workspace : summarizeWorkspace(workspace),
        });
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/session/warmup") {
        const body = await readJsonBody(request);
        const result = await warmupBrowserSession({
          headless: body.headless !== false,
        });
        sendJson(response, 200, {
          ok: true,
          ...result,
        });
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/session/open-login-pages") {
        const body = await readJsonBody(request);
        const result = await openLoginPages(Array.isArray(body.platforms) ? body.platforms : []);
        sendJson(response, 200, {
          ok: true,
          ...result,
        });
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/workspace/save") {
        const body = await readJsonBody(request);
        const workspace = await writeWorkspace(body.workspace || {}, {
          preserveHeavyData: body.workspace?.workspaceHydrated === false,
        });
        sendJson(response, 200, {
          ok: true,
          workspace,
        });
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/workspace/reset") {
        const workspace = await writeWorkspace(createDefaultWorkspace());
        sendJson(response, 200, {
          ok: true,
          workspace,
        });
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/fetch") {
        const body = await readJsonBody(request);
        const texts = await fetchPlatformTexts(body);
        sendJson(response, 200, {
          ok: true,
          ...texts,
        });
        return;
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/analyze") {
        const body = await readJsonBody(request);
        const analysis = analyzeCorpus(body);
        let filePath = "";

        if (body.saveToFile !== false) {
          const payload = buildExportPayload(analysis);
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          filePath = path.join(OUTPUT_DIR, `tags-${timestamp}.json`);
          await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
        }

        sendJson(response, 200, {
          ok: true,
          analysis,
          savedTo: filePath,
        });
        return;
      }

      sendJson(response, 404, {
        ok: false,
        message: "Not found",
      });
    } catch (error) {
      console.error(error);
      sendJson(response, 500, {
        ok: false,
        message: error.message || "服务器处理失败",
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });

  console.log(`Young Tag Miner running at http://${HOST}:${PORT}`);
}

async function readWorkspace() {
  try {
    const content = await fsp.readFile(WORKSPACE_FILE, "utf8");
    return normalizeWorkspace(JSON.parse(content));
  } catch (error) {
    if (error.code === "ENOENT") {
      return createDefaultWorkspace();
    }
    throw error;
  }
}

async function writeWorkspace(workspace, options = {}) {
  const normalized = normalizeWorkspace(
    options.preserveHeavyData ? await mergeWithExistingWorkspace(workspace) : workspace,
  );
  await fsp.writeFile(WORKSPACE_FILE, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

async function mergeWithExistingWorkspace(workspace) {
  const existing = await readWorkspace();
  return {
    ...existing,
    ...workspace,
    fetchedItems: existing.fetchedItems,
    fetchErrors: existing.fetchErrors,
    lastAnalysis: existing.lastAnalysis,
    lastSavedTo: existing.lastSavedTo,
  };
}

function createDefaultWorkspace() {
  return {
    form: {
      coreTags: ["内耗", "摆烂", "社恐", "焦虑", "熬夜", "拖延"],
      platforms: ["weibo", "bilibili", "xiaohongshu", "douyin"],
      sinceDays: 30,
      maxItemsPerKeyword: 10,
      maxPatternsPerTag: 6,
      manualText: "",
    },
    fetchedItems: [],
    fetchErrors: [],
    lastAnalysis: null,
    lastSavedTo: "",
    loginConfirmed: false,
    statusText: "等待开始。",
    updatedAt: "",
  };
}

function normalizeWorkspace(workspace = {}) {
  const defaults = createDefaultWorkspace();
  const form = workspace.form || {};
  return {
    ...defaults,
    ...workspace,
    form: {
      ...defaults.form,
      ...form,
      coreTags: normalizeCoreTags(form.coreTags ?? defaults.form.coreTags),
      platforms: normalizeStringList(form.platforms ?? defaults.form.platforms),
      sinceDays: Number(form.sinceDays ?? defaults.form.sinceDays) || defaults.form.sinceDays,
      maxItemsPerKeyword: Number(form.maxItemsPerKeyword ?? defaults.form.maxItemsPerKeyword) || defaults.form.maxItemsPerKeyword,
      maxPatternsPerTag: Number(form.maxPatternsPerTag ?? defaults.form.maxPatternsPerTag) || defaults.form.maxPatternsPerTag,
      manualText: String(form.manualText ?? defaults.form.manualText),
    },
    fetchedItems: Array.isArray(workspace.fetchedItems) ? workspace.fetchedItems : [],
    fetchErrors: Array.isArray(workspace.fetchErrors) ? workspace.fetchErrors : [],
    lastAnalysis: workspace.lastAnalysis || null,
    lastSavedTo: String(workspace.lastSavedTo || ""),
    loginConfirmed: Boolean(workspace.loginConfirmed),
    statusText: String(workspace.statusText || defaults.statusText),
    updatedAt: new Date().toISOString(),
  };
}

function summarizeWorkspace(workspace = {}) {
  const normalized = normalizeWorkspace(workspace);
  return {
    ...normalized,
    fetchedItems: [],
    fetchErrors: [],
    fetchedItemCount: normalized.fetchedItems.length,
    fetchErrorCount: normalized.fetchErrors.length,
    workspaceHydrated: false,
  };
}

function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,\n，]/);
  return Array.from(new Set(list.map((item) => String(item).trim()).filter(Boolean)));
}

function normalizeCoreTags(value) {
  return normalizeStringList(value)
    .map((item) => item
      .replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, "")
      .replace(/[（(].*?[）)]/g, "")
      .replace(/[\/|｜]/g, " ")
      .replace(/\s+/g, " ")
      .trim())
    .filter((item) => item && !isInvalidCoreTag(item));
}

function isInvalidCoreTag(tag) {
  if (!tag) return true;
  if (/^[⸻\-—–_]+$/.test(tag)) return true;
  if (tag.length > 12) return true;
  if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(tag)) return true;
  return /(状态类|行为类|身份类|关系类|结构性状态|抽象标签|自我认同|日常状态|习惯|原因层|情绪|心理|分组|标签)/.test(tag);
}

async function serveStaticFile(response, relativePath) {
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);
  const content = await fsp.readFile(filePath);

  response.writeHead(200, {
    "Content-Type": getContentType(path.extname(filePath)),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(content);
}

function getContentType(extension) {
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(payload));
}

function sendEmpty(response, statusCode) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end();
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
