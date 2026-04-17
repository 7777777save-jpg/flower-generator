const DEFAULT_CORE_TAGS = ["内耗", "摆烂", "社恐", "焦虑", "熬夜", "拖延"];

const TAG_PROFILES = {
  "内耗": {
    aliases: ["内耗", "精神内耗", "自我内耗"],
    cues: ["反复想", "想太多", "纠结", "拉扯", "自责", "对比", "消耗", "不敢", "怕出错", "停不下来"],
  },
  "摆烂": {
    aliases: ["摆烂", "开摆", "躺平", "摆了"],
    cues: ["不想动", "提不起劲", "躺着", "拖着", "放空", "敷衍", "摸鱼", "懒得", "摆着", "不想努力"],
  },
  "社恐": {
    aliases: ["社恐", "社交恐惧", "不想社交"],
    cues: ["不敢说话", "不敢开口", "怕尴尬", "怕冷场", "怕打扰", "怕被孤立", "不敢发言", "不敢求助", "回消息压力", "不敢主动"],
  },
  "焦虑": {
    aliases: ["焦虑", "焦麻了", "焦绿", "焦灼"],
    cues: ["睡不着", "慌", "担心", "害怕", "没底", "未来", "找工作", "ddl", "截止", "赶不上", "来不及"],
  },
  "熬夜": {
    aliases: ["熬夜", "晚睡", "通宵", "修仙"],
    cues: ["凌晨", "夜里", "白天困", "作息乱", "睡不着", "补觉", "越熬越累", "咖啡续命", "恶性循环"],
  },
  "拖延": {
    aliases: ["拖延", "拖着", "拖到最后", "拖症"],
    cues: ["磨蹭", "不开始", "临时抱佛脚", "拖到ddl", "迟迟不动", "总想等等", "拖着不做"],
  },
  "卷": {
    aliases: ["卷", "内卷", "卷王"],
    cues: ["跟不上", "怕落后", "绩点", "实习", "证书", "比别人", "不敢停", "竞争", "规划"],
  },
  "迷茫": {
    aliases: ["迷茫", "没方向", "不知道要什么"],
    cues: ["未来", "找不到方向", "不知道选什么", "看不到结果", "不知道该干嘛", "空心"],
  },
};

const DESCRIPTIVE_MARKERS = [
  "但", "却", "可是", "又", "同时", "因为", "所以", "导致", "变得", "形成", "结果", "越来越",
  "明明", "知道", "不想", "害怕", "总是", "每天", "长期", "一边", "表面", "其实", "晚上", "白天",
  "一直", "反复", "越", "怕", "想", "提不起劲", "拖着", "睡不着",
];

const ACTION_CUES = [
  "熬夜", "刷手机", "拖延", "拖着", "摸鱼", "躺", "发呆", "回避", "逃避", "学习", "复习", "赶ddl",
  "不回消息", "社交", "开口", "求助", "做不完", "开始不了", "停不下来", "逼自己", "比较", "硬撑",
];

const EMOTION_CUES = [
  "焦虑", "疲惫", "很累", "崩溃", "压抑", "烦", "怕", "慌", "空虚", "孤独", "内耗", "难受", "窒息",
  "无力", "麻木", "自责", "愧疚", "不安", "失控", "紧绷",
];

const PATTERN_LIBRARY = [
  {
    phrase: "拖延但伴随焦虑",
    test: (text) => hasAny(text, ["拖延", "拖着", "拖到最后", "磨蹭", "开始不了", "迟迟不动"]) &&
      hasAny(text, ["焦虑", "慌", "自责", "愧疚", "着急", "心慌"]),
  },
  {
    phrase: "想努力但缺乏动力",
    test: (text) => hasAny(text, ["想努力", "想学习", "想认真", "想改变", "想做"]) &&
      hasAny(text, ["提不起劲", "没动力", "动不了", "不想动", "做不下去", "懒得"]),
  },
  {
    phrase: "害怕社交同时渴望连接",
    test: (text) => hasAny(text, ["不想社交", "害怕社交", "不敢说话", "不敢开口", "怕尴尬", "怕冷场"]) &&
      hasAny(text, ["怕被孤立", "想融入", "想交朋友", "渴望连接", "想被理解", "想有人陪"]),
  },
  {
    phrase: "信息过载导致疲惫",
    test: (text) => hasAny(text, ["信息太多", "消息太多", "通知太多", "刷太多", "短视频", "群消息"]) &&
      hasAny(text, ["疲惫", "累", "麻木", "烦", "脑子炸了", "崩溃"]),
  },
  {
    phrase: "长期熬夜形成恶性循环",
    test: (text) => hasAny(text, ["熬夜", "晚睡", "凌晨", "通宵"]) &&
      hasAny(text, ["白天困", "起不来", "恶性循环", "越熬越累", "作息乱"]),
  },
  {
    phrase: "ddl逼近时开始心慌自责",
    test: (text) => hasAny(text, ["ddl", "截止", "dead line", "赶due"]) &&
      hasAny(text, ["心慌", "自责", "焦虑", "愧疚", "慌"]),
  },
  {
    phrase: "明知道要做却迟迟启动不了",
    test: (text) => hasAny(text, ["明知道", "知道要", "该学习", "该开始", "必须做"]) &&
      hasAny(text, ["就是不想", "启动不了", "开始不了", "提不起劲", "拖着不做"]),
  },
  {
    phrase: "反复自我比较带来消耗",
    test: (text) => hasAny(text, ["和别人比", "对比", "比较", "看别人"]) &&
      hasAny(text, ["内耗", "焦虑", "消耗", "自卑", "失落"]),
  },
  {
    phrase: "靠刷屏逃避现实压力",
    test: (text) => hasAny(text, ["刷手机", "刷视频", "一直刷", "停不下来"]) &&
      hasAny(text, ["逃避", "不想面对", "压力", "空虚", "更累"]),
  },
  {
    phrase: "白天摆着晚上开始自责",
    test: (text) => hasAny(text, ["白天", "白日"]) &&
      hasAny(text, ["摆着", "拖着", "摸鱼", "什么也没做"]) &&
      hasAny(text, ["晚上自责", "夜里自责", "焦虑", "愧疚"]),
  },
  {
    phrase: "表面松弛其实一直紧绷",
    test: (text) => hasAny(text, ["表面", "看起来", "嘴上说", "装作"]) &&
      hasAny(text, ["其实", "心里", "一直紧绷", "很焦虑", "根本没放松"]),
  },
  {
    phrase: "害怕麻烦别人所以把话憋回去",
    test: (text) => hasAny(text, ["怕麻烦别人", "不想麻烦别人", "怕打扰别人"]) &&
      hasAny(text, ["不说", "憋着", "自己扛", "自己消化", "不敢求助"]),
  },
  {
    phrase: "对未来失控感持续上升",
    test: (text) => hasAny(text, ["未来", "毕业", "找工作", "就业", "前途"]) &&
      hasAny(text, ["焦虑", "没底", "失控", "慌", "看不清", "不确定"]),
  },
  {
    phrase: "休息也休息得不踏实",
    test: (text) => hasAny(text, ["想休息", "休息一下", "想躺"]) &&
      hasAny(text, ["不踏实", "玩也焦虑", "躺也不安", "休息不下来"]),
  },
  {
    phrase: "集体生活放大社交压力",
    test: (text) => hasAny(text, ["宿舍", "寝室", "合租", "室友"]) &&
      hasAny(text, ["尴尬", "压抑", "没边界", "社交压力", "不自在"]),
  },
  {
    phrase: "怕落后所以不敢停下",
    test: (text) => hasAny(text, ["怕落后", "怕跟不上", "怕被甩开", "不敢停"]) &&
      hasAny(text, ["一直学", "一直卷", "停不下来", "强迫自己"]),
  },
];

function analyzeCorpus(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const coreTags = normalizeCoreTags(input.coreTags || input.keywords || DEFAULT_CORE_TAGS);
  const rawManualText = String(input.manualText || "");
  const maxPatternsPerTag = clamp(Number(input.maxPatternsPerTag) || Number(input.targetCount) || 6, 3, 10);

  const corpus = [
    ...items.map((item) => ({
      ...item,
      text: normalizeRawText(item.text || ""),
    })),
  ].filter((item) => item.text);

  if (rawManualText.trim()) {
    corpus.push({
      platform: "manual",
      keyword: "手动补充",
      title: "手动补充文本",
      url: "",
      text: normalizeRawText(rawManualText),
    });
  }

  const fragments = collectFragments(corpus);
  const tagAnalyses = coreTags.map((tag) => analyzeTag(tag, fragments, maxPatternsPerTag));
  const surfacedNodeCount = tagAnalyses.reduce((sum, group) => sum + group.nodes.length, 0);

  return {
    meta: {
      itemCount: corpus.length,
      fragmentCount: fragments.length,
      coreTagCount: coreTags.length,
      maxPatternsPerTag,
      surfacedNodeCount,
    },
    coreTags,
    tagAnalyses,
    stageSummary: `围绕 ${coreTags.length} 个核心标签，从 ${fragments.length} 条句子片段中归纳原因状态。`,
  };
}

function buildExportPayload(analysis) {
  return {
    createdAt: new Date().toISOString(),
    meta: analysis.meta,
    coreTags: analysis.coreTags,
    tagAnalyses: analysis.tagAnalyses,
    stageSummary: analysis.stageSummary,
  };
}

function analyzeTag(tag, fragments, maxPatternsPerTag) {
  const profile = resolveTagProfile(tag);
  const buckets = new Map();
  let relatedSentenceCount = 0;

  for (const fragment of fragments) {
    const relevance = scoreRelevance(fragment.text, profile);
    if (relevance < 2.6) continue;

    relatedSentenceCount += 1;
    if (!looksLikeDescription(fragment.text)) continue;

    const summary = summarizeFragment(fragment.text, tag, profile);
    if (!summary) continue;

    const key = normalizeSummary(summary);
    if (!buckets.has(key)) {
      buckets.set(key, {
        phrase: summary,
        count: 0,
        relevance: 0,
        evidence: [],
        sourcePlatforms: new Set(),
      });
    }

    const bucket = buckets.get(key);
    bucket.count += 1;
    bucket.relevance += relevance;
    bucket.sourcePlatforms.add(fragment.platform || "unknown");
    if (bucket.evidence.length < 3) {
      bucket.evidence.push(fragment.text);
    }
  }

  const nodes = Array.from(buckets.values())
    .map((bucket) => ({
      phrase: bucket.phrase,
      count: bucket.count,
      sourceSpread: bucket.sourcePlatforms.size,
      score: Number((bucket.count * 2.1 + bucket.relevance + bucket.sourcePlatforms.size * 1.2).toFixed(2)),
      evidence: bucket.evidence,
    }))
    .sort((left, right) => right.score - left.score || right.count - left.count || left.phrase.localeCompare(right.phrase, "zh-Hans-CN"))
    .slice(0, maxPatternsPerTag);

  return {
    tag,
    relatedSentenceCount,
    nodeCount: nodes.length,
    nodes,
  };
}

function collectFragments(corpus) {
  const fragments = [];
  const seen = new Set();

  for (const item of corpus) {
    const primaryParts = String(item.text || "")
      .split(/[。！？!?；;\n]/)
      .map((part) => normalizeFragment(part))
      .filter(Boolean);

    for (const part of primaryParts) {
      pushFragment(fragments, seen, part, item);

      if (part.includes("，") || part.includes(",")) {
        const clauses = part
          .split(/[，,]/)
          .map((clause) => normalizeFragment(clause))
          .filter((clause) => clause.length >= 6 && clause.length <= 26);

        for (const clause of clauses) {
          pushFragment(fragments, seen, clause, item);
        }
      }
    }
  }

  return fragments;
}

function pushFragment(fragments, seen, text, item) {
  if (!text) return;
  if (text.length < 6 || text.length > 42) return;
  const key = `${item.platform || "unknown"}::${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  fragments.push({
    text,
    platform: item.platform || "unknown",
    keyword: item.keyword || "",
  });
}

function scoreRelevance(text, profile) {
  let score = 0;

  for (const alias of profile.aliases) {
    if (text.includes(alias)) score += 3.2;
  }

  for (const cue of profile.cues) {
    if (text.includes(cue)) score += 1.3;
  }

  if (looksLikeDescription(text)) score += 1.1;
  if (hasAny(text, ACTION_CUES)) score += 0.7;
  if (hasAny(text, EMOTION_CUES)) score += 0.7;

  return score;
}

function summarizeFragment(text, tag, profile) {
  const cleaned = stripFiller(text);

  for (const pattern of PATTERN_LIBRARY) {
    if (pattern.test(cleaned, tag, profile)) {
      return pattern.phrase;
    }
  }

  const contrast = cleaned.match(/(.{2,14}?)(但|却|可是|只是|偏偏|又)(.{2,14})/);
  if (contrast) {
    return finalizePhrase(`${compressClause(contrast[1], profile)}${normalizeConnector(contrast[2])}${compressClause(contrast[3], profile)}`, tag, profile);
  }

  const causal = cleaned.match(/(.{2,14}?)(导致|形成|变得|变成|拖成)(.{2,14})/);
  if (causal) {
    return finalizePhrase(`${compressClause(causal[1], profile)}${causal[2]}${compressClause(causal[3], profile)}`, tag, profile);
  }

  const because = cleaned.match(/因为(.{2,12}?)(所以|于是|就)(.{2,12})/);
  if (because) {
    return finalizePhrase(`${compressClause(because[1], profile)}导致${compressClause(because[3], profile)}`, tag, profile);
  }

  const temporal = cleaned.match(/(每天|总是|长期|反复|一到晚上|白天|晚上|夜里)(.{4,14})/);
  if (temporal) {
    return finalizePhrase(`${temporal[1]}${compressClause(temporal[2], profile)}`, tag, profile);
  }

  return finalizePhrase(cleaned, tag, profile);
}

function finalizePhrase(phrase, tag, profile) {
  if (!phrase) return "";

  let normalized = phrase
    .replace(/[，,。！？!?]/g, "")
    .replace(/\s+/g, "")
    .replace(/^(然后|就是|感觉|真的|其实|好像|总觉得|越来越|一直在)/, "")
    .replace(/(一下子|一下|而已|罢了|这种状态|这件事)$/g, "");

  normalized = normalized
    .replace(/^但|^却|^又|^所以|^导致/, "")
    .replace(/但但|却却|又又/g, (value) => value.slice(0, 1))
    .trim();

  if (normalized === tag) return "";
  if (normalized.length < 6) return "";

  normalized = compressForDisplay(normalized);

  if (!hasAny(normalized, DESCRIPTIVE_MARKERS) && !hasAny(normalized, ACTION_CUES) && !hasAny(normalized, EMOTION_CUES)) {
    return "";
  }

  return normalized;
}

function compressForDisplay(value) {
  let normalized = String(value || "")
    .replace(/^(每天|总是|一直|反复)/, "$1")
    .replace(/(自己|开始|已经|有点|一下子|一下|真的|就是|好像|其实|感觉)/g, "")
    .replace(/(很怕|特别怕)/g, "怕")
    .replace(/(越来越)/g, "持续")
    .replace(/(不敢主动找人说话)/g, "不敢主动开口")
    .replace(/(消息太多脑子一直停不下来)/g, "信息过载压得人很累")
    .replace(/(白天摸鱼拖着不做)/g, "白天拖着不做")
    .replace(/(晚上又因为ddl开始心慌和自责)/ig, "ddl逼近时心慌自责")
    .replace(/(总是熬夜到凌晨两三点)/g, "熬夜到凌晨两三点")
    .replace(/\s+/g, "")
    .trim();

  if (normalized.length <= 20) {
    return normalized;
  }

  normalized = normalized
    .replace(/(每天|总是|长期|反复|白天|晚上|夜里)/g, "")
    .replace(/(同时|一直|已经|开始)/g, "")
    .trim();

  if (normalized.length <= 20) {
    return normalized;
  }

  return normalized.slice(0, 20);
}

function compressClause(clause, profile) {
  let value = stripFiller(clause);

  return value
    .replace(/^(我|我们|自己|大家|很多人|有时候|总是)/, "")
    .replace(/(这个|那种|这种|的时候|状态)$/g, "")
    .trim();
}

function stripFiller(value) {
  return String(value || "")
    .replace(/^(我觉得|我发现|我真的|真的会|就是会|好像在|好像|感觉自己|感觉|其实|然后|现在)/, "")
    .replace(/(大学生|当代大学生|大学生活)/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function looksLikeDescription(text) {
  if (!text || text.length < 6 || text.length > 42) return false;
  if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(text)) return false;

  return hasAny(text, DESCRIPTIVE_MARKERS) ||
    (hasAny(text, ACTION_CUES) && hasAny(text, EMOTION_CUES));
}

function normalizeFragment(value) {
  return String(value || "")
    .replace(/[“”"'`]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[@#][^\s#@]+/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeRawText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][^\s#@]+/g, " ")
    .replace(/[~`^=_+|<>]/g, " ")
    .replace(/[ ]+/g, " ")
    .trim();
}

function normalizeSummary(value) {
  return value.replace(/\s+/g, "").trim();
}

function resolveTagProfile(tag) {
  const base = TAG_PROFILES[tag] || {};
  return {
    aliases: Array.from(new Set([tag, ...(base.aliases || [])])),
    cues: base.cues || [],
  };
}

function normalizeConnector(connector) {
  if (connector === "又") return "同时";
  if (connector === "只是") return "但";
  return connector;
}

function hasAny(text, parts) {
  return parts.some((part) => text.includes(part));
}

function normalizeList(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,\n，]/);
  return Array.from(new Set(list.map((item) => item.trim()).filter(Boolean)));
}

function normalizeCoreTags(value) {
  return normalizeList(value)
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  analyzeCorpus,
  buildExportPayload,
};
