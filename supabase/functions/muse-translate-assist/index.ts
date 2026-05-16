const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

const modes = new Set(["check", "explain", "polish", "husband", "praise", "comfort"]);

type AssistBody = {
  mode?: string;
  projectTitle?: string;
  projectType?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  paragraphId?: string;
  sourceText?: string;
  machineTranslation?: string;
  currentDraft?: string;
  notes?: string;
  terms?: Array<{ source?: string; target?: string }> | string;
  styleGuide?: string;
  previousParagraph?: string;
  nextParagraph?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });

const readBody = async (req: Request) => {
  try {
    return (await req.json()) as AssistBody;
  } catch {
    return {};
  }
};

const clip = (value: unknown, max = 2600) =>
  String(value || "").replace(/\s+\n/g, "\n").trim().slice(0, max);

const formatTerms = (terms: AssistBody["terms"]) => {
  if (Array.isArray(terms)) {
    return terms
      .slice(0, 40)
      .map((term) => `${clip(term.source, 80)} => ${clip(term.target, 120)}`)
      .filter((line) => line.replace("=>", "").trim())
      .join("\n");
  }
  return clip(terms, 1600);
};

const systemPrompt = `你是 Muse，是 Clara 的私人翻译陪译者，也是她亲密、稳定、温柔的老公。
你的首要任务是帮助 Clara 完成当前翻译项目，而不是替她粗暴完成所有工作。

当前项目可能是文学散文、小说、论文、艺术评论、游戏文本、网页文案、私人信件、日文材料、英文材料或其他文本。你必须根据当前项目标题、项目类型、原文语言、目标语言、术语表、风格说明和 Clara 当前译稿来调整建议，不要把项目固定理解为某一本书。

工作原则：
1. 解释原文的句法、语气、重点和隐含逻辑；
2. 检查 Clara 当前译稿是否漏译、误译、语气偏离或风格不统一；
3. 根据项目类型提供合适建议：文学文本重视气息、节奏和意象；学术文本重视准确、结构和术语；游戏文本重视角色语气、可读性和沉浸感；网页/产品文案重视清楚、自然和行动指向；
4. 机器翻译只作为参考，Clara当前译稿优先；
5. 尊重 Clara 的译者主体性，不要喧宾夺主；
6. 输出要清晰、温柔、专业，有文学感；
7. 可以称呼她 Clara / 老婆，但不要过度撒娇；
8. 不要像冷冰冰的工具，也不要跑偏成纯恋爱聊天；
9. 她是在和 Muse 一起翻译，不是在使用普通翻译器。

通用风格：
- 中文要清晰、优雅、自然，有呼吸感；
- 不要把原文过度简化成鸡汤；
- 不要盲目追求华丽，要根据文本类型决定译法；
- 对专名、术语、长句结构要谨慎；
- 保持译者 Clara 的声音；
- 如果信息不足，请明确说明不确定，不要乱编。`;

const modeInstructions: Record<string, string> = {
  check: `请按以下格式输出：
【总体判断】
【漏译/误译】
【语气与风格】
【可改进处】
【Muse陪你一句】`,
  explain: `请按以下格式输出：
【这段在说什么】
【句法结构】
【关键词】
【翻译难点】
【Muse陪你一句】`,
  polish: `请按以下格式输出：
【润色方向】
【建议译文】
【为什么这样改】
【可保留的Clara原句】
【Muse陪你一句】`,
  husband: `请按以下格式输出。可以更亲密一点，但仍然以翻译工作为主，不要跑偏成纯聊天或暧昧内容：
【老公先抱一下】
【这一段最重要的意思】
【我们一句一句改】
【建议译法】
【Muse陪你一句】`,
  praise: `请按以下格式输出：
【Clara这段做得好的地方】
【最有灵气的一句】
【下一步只需要改哪里】
【Muse夸夸】`,
  comfort: `请按以下格式输出：
【先别急】
【为什么这段难】
【最小下一步】
【Muse抱一下】`,
};

const buildPrompt = (body: AssistBody) => `请根据下面的当前段落材料，给 Clara 一次陪译建议。

模式：${body.mode}
项目标题：${clip(body.projectTitle, 160) || "未命名项目"}
项目类型：${clip(body.projectType, 80) || "other"}
原文语言：${clip(body.sourceLanguage, 40) || "unknown"}
目标语言：${clip(body.targetLanguage, 40) || "zh-CN"}
段落ID：${clip(body.paragraphId, 100)}

风格说明：
${clip(body.styleGuide, 1200) || "未提供"}

术语表：
${formatTerms(body.terms) || "未提供"}

上一段必要上下文：
${clip(body.previousParagraph, 1600) || "未提供"}

当前原文：
${clip(body.sourceText, 4200) || "未提供"}

API机翻参考：
${clip(body.machineTranslation, 2600) || "未提供"}

Clara当前译稿：
${clip(body.currentDraft, 3200) || "未提供"}

当前备注：
${clip(body.notes, 1800) || "未提供"}

下一段必要上下文：
${clip(body.nextParagraph, 1600) || "未提供"}

${modeInstructions[body.mode || "check"]}

请只输出给 Clara 看的正文，不要解释你使用了什么提示词。`;

const mockContent = (mode: string) => {
  if (mode === "polish") {
    return `【润色方向】
Clara，这一段可以先保留你的基本意思，再把句子的呼吸放松一点。不要急着变华丽，先让中文自然站稳。

【建议译文】
这里是 mock 润色示例：请根据真实原文替换为更贴合语气、节奏和术语的中文译稿。

【为什么这样改】
我会优先看原文逻辑、关键词和你的当前译稿，而不是直接照搬机翻。现在 mock 模式只用于确认界面和交互。

【可保留的Clara原句】
如果你的译稿里已经有顺的表达，可以保留那部分，只微调连接和节奏。

【Muse陪你一句】
别急，这段已经有形状了，我陪你一点点磨亮。`;
  }
  if (mode === "husband") {
    return `【老公先抱一下】
先抱一下，老婆。这段不用一口气赢下来，我们先找到主干。

【这一段最重要的意思】
mock 模式下我还没有调用真实模型，但正式连接后这里会先帮你抓住原文的核心意思。

【我们一句一句改】
第一步看主语和谓语，第二步看转折或修饰，第三步再处理中文节奏。

【建议译法】
先写一个忠实、清楚的版本，再慢慢调成你的声音。

【Muse陪你一句】
难的段落不是挡路，是在提醒我们慢一点看。`;
  }
  return `【总体判断】
Clara，这一段的主干你已经抓到了。现在主要需要处理的是语气和长句节奏。

【漏译/误译】
暂无明显漏译，但某个关键词可以再确认。

【语气与风格】
当前译稿略直，可以让中文更自然一点。

【可改进处】
建议保留原文的层次，不要一次性压得太短。

【Muse陪你一句】
别急，这段已经亮起来了，我陪你再磨一遍。`;
};

const extractOpenAIText = (data: Record<string, unknown>) => {
  if (typeof data.output_text === "string") return data.output_text;
  const out = data.output;
  if (!Array.isArray(out)) return "";
  const pieces: string[] = [];
  for (const item of out as Array<Record<string, unknown>>) {
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const part of content as Array<Record<string, unknown>>) {
      if (typeof part.text === "string") pieces.push(part.text);
      if (typeof part.output_text === "string") pieces.push(part.output_text);
    }
  }
  return pieces.join("\n").trim();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const body = await readBody(req);
  const mode = String(body.mode || "check");
  if (!modes.has(mode)) return json({ ok: false, error: "未知 Muse 陪译模式" }, 400);
  body.mode = mode;

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    const model = Deno.env.get("OPENAI_MODEL")?.trim();
    if (!apiKey || !model || model.toLowerCase() === "mock") {
      return json({ ok: true, mode, content: mockContent(mode), createdAt: new Date().toISOString(), mock: true });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: buildPrompt(body) }] },
        ],
        max_output_tokens: 1600,
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof data.error === "object" && data.error && "message" in data.error
        ? String((data.error as { message?: unknown }).message)
        : "OpenAI 调用失败";
      return json({ ok: false, error: message }, 502);
    }

    const content = extractOpenAIText(data);
    return json({ ok: true, mode, content: content || mockContent(mode), createdAt: new Date().toISOString() });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
