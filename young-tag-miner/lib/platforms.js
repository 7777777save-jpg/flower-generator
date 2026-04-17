const path = require("path");
const { chromium } = require("playwright");

const SESSION_DIR = path.join(__dirname, "..", ".session", "browser-data");
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_WAIT_MS = 5_000;

let browserContextPromise = null;
let browserMode = {
  headless: true,
};

const PLATFORM_CONFIG = {
  weibo: {
    label: "微博",
    loginUrl: "https://weibo.com/",
    searchUrl: ({ keyword, sinceDays }) => {
      const timescope = buildTimescope(sinceDays);
      return `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}&suball=1&Refer=g&timescope=${encodeURIComponent(timescope)}`;
    },
    extractors: [
      () => collectBlocks(".card-wrap .txt"),
      () => collectBlocks(".card-feed .txt"),
      () => collectBlocks("[node-type='feed_list_content']"),
      () => collectBlocks(".txt-cut"),
    ],
  },
  bilibili: {
    label: "B站",
    loginUrl: "https://www.bilibili.com/",
    searchUrl: ({ keyword }) =>
      `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}&order=pubdate`,
    extractors: [
      () => collectCombined([
        ".bili-video-card__info--des",
        ".video-list .so-item .des",
        ".bili-video-card__info--bottom",
        ".video-list .so-item .subtitle",
        ".video-list .so-item .des",
        ".bili-video-card__info--tit",
        ".video-list .so-item .title",
      ]),
    ],
  },
  xiaohongshu: {
    label: "小红书",
    loginUrl: "https://www.xiaohongshu.com/explore",
    searchUrl: ({ keyword }) =>
      `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`,
    extractors: [
      () => collectCombined([
        "section .desc span",
        "[class*='note-item'] [class*='desc']",
        "section .title span",
        "[class*='note-item'] [class*='title']",
      ]),
    ],
  },
  douyin: {
    label: "抖音",
    loginUrl: "https://www.douyin.com/",
    searchUrl: ({ keyword }) =>
      `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=general`,
    extractors: [
      () => collectCombined([
        "[data-e2e='search-result-container'] [data-e2e='search-card-desc']",
        "[class*='search-result'] [class*='desc']",
        "[data-e2e='search-result-container'] [data-e2e='search-card-title']",
        "[class*='search-result'] [class*='title']",
      ]),
    ],
  },
};

async function warmupBrowserSession({ headless = true } = {}) {
  const context = await getBrowserContext({ headless });
  const page = await context.newPage();

  try {
    await page.goto("https://www.baidu.com", {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    return {
      message: headless ? "无头浏览器会话已准备好" : "浏览器会话已打开，可手动登录平台后再回来抓取",
      headless,
    };
  } finally {
    await page.close();
  }
}

async function getSessionStatus() {
  const ready = Boolean(browserContextPromise);
  return {
    ready,
    headless: browserMode.headless,
    supportedPlatforms: Object.keys(PLATFORM_CONFIG),
  };
}

async function openLoginPages(platforms = []) {
  const normalizedPlatforms = platforms.filter((platform) => PLATFORM_CONFIG[platform]);
  const context = await getBrowserContext({ headless: false });
  const opened = [];

  for (const platform of normalizedPlatforms) {
    const config = PLATFORM_CONFIG[platform];
    const page = await context.newPage();
    await page.goto(config.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    opened.push({
      platform,
      label: config.label,
      url: config.loginUrl,
    });
  }

  return {
    opened,
    message: opened.length
      ? "登录页已打开，请在浏览器里完成扫码或账号登录"
      : "没有选择平台，暂未打开登录页",
  };
}

async function fetchPlatformTexts(options = {}) {
  const {
    keywords = [],
    platforms = [],
    sinceDays = 30,
    maxItemsPerKeyword = 12,
    manualText = "",
  } = options;

  const normalizedKeywords = normalizeKeywords(keywords);
  const normalizedPlatforms = platforms.filter((platform) => PLATFORM_CONFIG[platform]);
  const results = [];
  const errors = [];

  if (normalizedPlatforms.length && normalizedKeywords.length) {
    const context = await getBrowserContext();

    for (const platform of normalizedPlatforms) {
      for (const keyword of normalizedKeywords) {
        try {
          const items = await collectPlatformKeyword({
            context,
            platform,
            keyword,
            sinceDays,
            maxItemsPerKeyword,
          });
          results.push(...items);
        } catch (error) {
          errors.push({
            platform,
            keyword,
            message: error.message,
          });
        }
      }
    }
  }

  if (manualText && manualText.trim()) {
    results.push({
      platform: "manual",
      keyword: "手动补充",
      text: manualText.trim(),
      url: "",
      title: "手动粘贴文本",
    });
  }

  return {
    items: dedupeResults(results),
    errors,
    keywords: normalizedKeywords,
    platforms: normalizedPlatforms,
  };
}

async function collectPlatformKeyword({ context, platform, keyword, sinceDays, maxItemsPerKeyword }) {
  const config = PLATFORM_CONFIG[platform];
  const page = await context.newPage();
  const url = config.searchUrl({ keyword, sinceDays });

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.waitForTimeout(DEFAULT_WAIT_MS);

    const extraction = await page.evaluate(
      ({ extractors, helperSource, maxItemsPerKeyword, keyword }) => {
        const extractorFunctions = extractors.map((source) => {
          return new Function(`
            ${helperSource}
            return (${source})();
          `);
        });

        const collected = [];

        for (const extractor of extractorFunctions) {
          try {
            const list = extractor();
            if (Array.isArray(list) && list.length) {
              collected.push(...list);
            }
          } catch (error) {
            console.warn(error);
          }
        }

        if (!collected.length) {
          const bodyText = document.body?.innerText || "";
          const lines = bodyText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length >= 8 && line.length <= 120);
          collected.push(...lines.filter((line) => line.includes(keyword)).slice(0, maxItemsPerKeyword));
        }

        return Array.from(new Set(collected.map((entry) => entry.trim()).filter(Boolean))).slice(0, maxItemsPerKeyword * 4);
      },
      {
        extractors: config.extractors.map((extractor) => extractor.toString()),
        helperSource: sharedCollectorHelpers(),
        maxItemsPerKeyword,
        keyword,
      }
    );

    const items = extraction
      .map((text) => normalizeCorpusText(text))
      .filter(Boolean)
      .filter((text) => isUsefulCorpusText(text, keyword))
      .sort((left, right) => scoreCorpusText(right, keyword) - scoreCorpusText(left, keyword))
      .slice(0, maxItemsPerKeyword)
      .map((text, index) => ({
        platform,
        keyword,
        title: `${config.label} ${keyword} ${index + 1}`,
        text,
        url,
      }));

    if (!items.length) {
      throw new Error(`没有抓到可用文本，页面可能需要登录或验证码: ${url}`);
    }

    return items;
  } finally {
    await page.close();
  }
}

async function getBrowserContext(options = {}) {
  const requestedHeadless = typeof options.headless === "boolean" ? options.headless : browserMode.headless;

  if (browserContextPromise && browserMode.headless !== requestedHeadless) {
    await closeBrowserContext();
  }

  browserMode = {
    headless: requestedHeadless,
  };

  if (!browserContextPromise) {
    browserContextPromise = chromium.launchPersistentContext(SESSION_DIR, {
      headless: requestedHeadless,
      viewport: {
        width: 1440,
        height: 920,
      },
      locale: "zh-CN",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      args: [
        "--disable-blink-features=AutomationControlled",
      ],
    });

    browserContextPromise.catch(() => {
      browserContextPromise = null;
    });
  }

  return browserContextPromise;
}

async function closeBrowserContext() {
  if (!browserContextPromise) return;

  try {
    const context = await browserContextPromise;
    await context.close();
  } catch {
    // Ignore close failures and allow a fresh context on next request.
  } finally {
    browserContextPromise = null;
  }
}

function normalizeKeywords(keywords) {
  const list = Array.isArray(keywords) ? keywords : String(keywords || "").split(/[,\n，]/);
  return Array.from(
    new Set(
      list
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function dedupeResults(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = `${item.platform}::${item.keyword}::${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function buildTimescope(sinceDays) {
  const end = new Date();
  const start = new Date(end.getTime() - Number(sinceDays || 30) * 24 * 60 * 60 * 1000);
  return `custom:${formatDate(start)}:${formatDate(end)}`;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sharedCollectorHelpers() {
  return `
    function normalizeSpace(value) {
      return (value || "").replace(/\\s+/g, " ").trim();
    }

    function collectBlocks(selector) {
      return Array.from(document.querySelectorAll(selector))
        .map((node) => normalizeSpace(node.innerText || node.textContent || ""))
        .filter((text) => text.length >= 6 && text.length <= 180);
    }

    function collectCombined(selectors) {
      const values = [];
      for (const selector of selectors) {
        values.push(...collectBlocks(selector));
      }
      return values;
    }
  `;
}

function normalizeCorpusText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[【】]/g, " ")
    .replace(/#[^#]+#/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulCorpusText(text, keyword) {
  if (!text) return false;
  if (text.length < 8 || text.length > 120) return false;
  if (isUiNoise(text)) return false;
  if (isHeadlineLike(text)) return false;

  const score = scoreCorpusText(text, keyword);
  return score >= 2.6;
}

function scoreCorpusText(text, keyword) {
  let score = 0;
  if (text.includes(keyword)) score += 1.3;
  if (/[，。！？!?]/.test(text)) score += 1.8;
  if (hasAnyPiece(text, [
    "因为", "所以", "但是", "但", "又", "结果", "导致", "明明", "知道", "不想", "害怕", "怕", "每天",
    "长期", "总是", "白天", "晚上", "夜里", "开始", "变得", "形成", "一直", "越", "越来越",
  ])) score += 1.5;
  if (hasAnyPiece(text, [
    "焦虑", "内耗", "崩溃", "疲惫", "社交", "尴尬", "孤立", "拖延", "提不起劲", "熬夜", "睡不着", "压力",
    "ddl", "未来", "工作", "宿舍", "室友", "刷手机", "停不下来", "自责", "愧疚", "心慌",
  ])) score += 1.6;
  if (hasAnyPiece(text, ["怎么", "谁懂", "绝了", "笑死", "震惊", "空心", "合集", "测评", "教程", "盘点"])) score -= 1.8;
  if (/^[^，。！？!?]{0,22}$/.test(text)) score -= 1.2;
  return score;
}

function isHeadlineLike(text) {
  if (/^[^，。！？!?]{0,18}$/.test(text) && !hasAnyPiece(text, ["因为", "但是", "明明", "不想", "害怕", "每天", "长期"])) {
    return true;
  }

  return hasAnyPiece(text, [
    "谁懂", "都给我", "我哭死", "绝了", "震惊", "救命", "空心", "合集", "推荐", "攻略", "盘点",
    "测评", "教程", "实测", "分享", "日常", "Vlog", "vlog", "记录一下",
  ]);
}

function isUiNoise(text) {
  return hasAnyPiece(text, [
    "打开App", "打开APP", "扫码登录", "立即下载", "下载APP", "评论", "收藏", "转发", "关注",
    "展开", "收起", "查看更多", "置顶", "热评", "赞", "回复", "发布于",
  ]);
}

function hasAnyPiece(text, pieces) {
  return pieces.some((piece) => text.includes(piece));
}

module.exports = {
  fetchPlatformTexts,
  getSessionStatus,
  openLoginPages,
  warmupBrowserSession,
};
