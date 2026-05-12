const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

const truncateForYoudao = (text: string) => {
  if (text.length <= 20) return text;
  return text.slice(0, 10) + String(text.length) + text.slice(-10);
};

const sha256 = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const readBody = async (req: Request) => {
  try {
    return (await req.json()) as Record<string, string>;
  } catch {
    return {};
  }
};

const fetchUrl = async (req: Request) => {
  const body = await readBody(req);
  const url = body.url || "";
  if (!/^https?:\/\//i.test(url)) return json({ ok: false, error: "URL 必须以 http:// 或 https:// 开头" }, 400);

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Yiyan Netlify Function)",
      accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) return json({ ok: false, error: `网页下载失败：${response.status}` }, 502);

  return json({
    ok: true,
    html: await response.text(),
    contentType: response.headers.get("content-type") || "",
  });
};

const translateYoudao = async (req: Request) => {
  const body = await readBody(req);
  const text = body.text || "";
  const appKey = Netlify.env.get("YOUDAO_APP_KEY") || body.appKey || "";
  const appSecret = Netlify.env.get("YOUDAO_APP_SECRET") || "";

  if (!text.trim()) return json({ ok: false, error: "没有要翻译的文本" }, 400);
  if (!appKey || !appSecret) return json({ ok: false, error: "服务器还没有配置有道环境变量" }, 500);

  const salt = crypto.randomUUID();
  const curtime = String(Math.floor(Date.now() / 1000));
  const sign = await sha256(appKey + truncateForYoudao(text) + salt + curtime + appSecret);
  const params = new URLSearchParams({
    q: text,
    from: body.from || "auto",
    to: body.to || "zh-CHS",
    appKey,
    salt,
    sign,
    signType: "v3",
    curtime,
  });

  const response = await fetch("https://openapi.youdao.com/api", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = (await response.json()) as { errorCode?: string; translation?: string[] };
  if (String(data.errorCode || "0") !== "0") {
    return json({ ok: false, error: `有道错误码 ${data.errorCode}`, raw: data }, 502);
  }

  return json({ ok: true, translation: (data.translation || []).join("\n") });
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") return json({}, 204);

  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  try {
    if (action === "health") return json({ ok: true, service: "译言 Netlify 代理" });
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    if (action === "fetch-url") return await fetchUrl(req);
    if (action === "youdao") return await translateYoudao(req);
    return json({ ok: false, error: "not found" }, 404);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export const config = {
  path: ["/api/health", "/api/fetch-url", "/api/youdao"],
};
