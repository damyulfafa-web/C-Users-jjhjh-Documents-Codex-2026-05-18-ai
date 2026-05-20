import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

const products = JSON.parse(
  await readFile(join(__dirname, "data", "products.json"), "utf8")
);
const config = JSON.parse(
  await readFile(join(__dirname, "data", "chatbot-config.json"), "utf8")
);

const links = config.links || {};
const messages = config.messages || {};
const buttons = config.buttons || {};

const sessions = new Map();

const questions = config.questions || [];
const systemPrompt = config.systemPrompt || "";
const STORE_URL = process.env.STORE_URL || links.storeUrl || "https://store.kakao.com/dypharm";
const EXPERT_URL = process.env.EXPERT_URL || links.expertUrl || "https://pf.kakao.com/_HJnvn";

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { answers: {}, step: 0, updatedAt: Date.now() });
  }
  return sessions.get(id);
}

function classifyIntent(text) {
  const t = text.trim();
  if (/^(처음|시작|다시|리셋|reset)$/i.test(t)) return "restart";
  if (/상담|전문가|문의|사람|관리사/.test(t)) return "expert";
  if (/추천|영양|건강|맞춤|문진|설계|시작/.test(t)) return "assessment";
  return "chat";
}

function normalizeAnswer(message) {
  return message.replace(/^선택[:：]\s*/, "").trim();
}

function nextQuestion(session, incomingText) {
  if (session.step > 0 && session.step <= questions.length) {
    const previous = questions[session.step - 1];
    session.answers[previous.key] = normalizeAnswer(incomingText);
  }

  if (session.step >= questions.length) {
    return null;
  }

  const question = questions[session.step];
  session.step += 1;
  session.updatedAt = Date.now();
  return question;
}

function riskFlags(answers) {
  const cautions = answers.cautions || "";
  return [
    cautions.includes("임신"),
    cautions.includes("약"),
    cautions.includes("질환"),
    cautions.includes("알레르기")
  ].some(Boolean);
}

function scoreProduct(product, answers) {
  let score = 0;
  const goal = answers.goal || "";
  const diet = answers.diet || "";
  const age = answers.age || "";

  if (product.goals.some((item) => goal.includes(item))) score += 5;
  if (product.dietHints.some((item) => diet.includes(item))) score += 2;
  if (product.ageHints.some((item) => age.includes(item))) score += 1;
  if (riskFlags(answers) && product.requiresCare) score -= 4;
  return score;
}

function buildRecommendation(answers) {
  const ranked = products
    .map((product) => ({ ...product, score: scoreProduct(product, answers) }))
    .filter((product) => product.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const selected = ranked.length ? ranked : products.slice(0, 2);
  const caution = riskFlags(answers)
    ? `\n\n${messages.riskCaution}`
    : "";

  const lines = selected.map(
    (item, index) =>
      `${index + 1}. ${item.name}: ${item.shortReason} (${item.functionalClaim})`
  );

  return `${messages.recommendationTitle}\n\n${lines.join(
    "\n"
  )}${caution}\n\n${messages.legalNotice}`;
}

async function generateAiReply(userText, session) {
  if (!OPENAI_API_KEY) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: systemPrompt,
      input: [
        {
          role: "user",
          content: `사용자 메시지: ${userText}\n현재 문진 답변: ${JSON.stringify(
            session.answers
          )}\n판매 제품 후보: ${JSON.stringify(products)}`
        }
      ],
      max_output_tokens: 450
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return (data.output_text || "").trim().slice(0, 900);
}

function quickReply(label) {
  if (label === buttons.expert || label === buttons.expertApply) {
    return { label, action: "webLink", webLinkUrl: EXPERT_URL };
  }

  if (label === buttons.store) {
    return { label, action: "webLink", webLinkUrl: STORE_URL };
  }

  return { label, action: "message", messageText: label };
}

function kakaoText(text, quickReplies = []) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text: text.slice(0, 900) } }],
      quickReplies: quickReplies.map(quickReply)
    }
  };
}

function kakaoLink(text, label, url, extraReplies = []) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text: text.slice(0, 900) } }],
      quickReplies: [
        { label, action: "webLink", webLinkUrl: url },
        ...extraReplies.map(quickReply)
      ]
    }
  };
}

export async function handleChat(message, userId = "demo-user") {
  const session = getSession(userId);
  const intent = classifyIntent(message);

  if (intent === "restart") {
    sessions.set(userId, { answers: {}, step: 0, updatedAt: Date.now() });
    const fresh = getSession(userId);
    const q = nextQuestion(fresh, "");
    return kakaoText(`${messages.restartPrefix}\n\n${q.text}`, q.quickReplies);
  }

  if (intent === "expert") {
    return kakaoLink(
      messages.expertIntro,
      buttons.expertApply,
      EXPERT_URL,
      [buttons.start, buttons.recommendAgain]
    );
  }

  if (intent === "assessment" || session.step > 0) {
    const q = nextQuestion(session, message);
    if (q) return kakaoText(q.text, q.quickReplies);

    const result = buildRecommendation(session.answers);
    return kakaoLink(result, buttons.store, STORE_URL, [buttons.expert, buttons.restart]);
  }

  try {
    const aiReply = await generateAiReply(message, session);
    if (aiReply) return kakaoText(aiReply, [buttons.start, buttons.expert, buttons.store]);
  } catch (error) {
    console.error(error);
  }

  return kakaoText(
    messages.welcome,
    [buttons.start, buttons.expert, buttons.store]
  );
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw };
  }
}

function extractKakaoMessage(body) {
  return (
    body?.userRequest?.utterance ||
    body?.action?.params?.message ||
    body?.text ||
    ""
  );
}

function extractUserId(body) {
  return (
    body?.userRequest?.user?.id ||
    body?.bot?.id ||
    body?.userId ||
    "demo-user"
  );
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/public/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(__dirname, safePath);
  const typeMap = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": typeMap[extname(filePath)] || "application/octet-stream"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true, service: "nutrition-chatbot" });
  }

  if (req.method === "POST" && ["/chat", "/kakao"].includes(url.pathname)) {
    const body = await parseBody(req);
    const message = extractKakaoMessage(body);
    const userId = extractUserId(body);
    const reply = await handleChat(message, userId);
    return sendJson(res, 200, reply);
  }

  if (req.method === "GET" && url.pathname === "/products") {
    return sendJson(res, 200, products);
  }

  if (req.method === "GET" && url.pathname === "/config") {
    return sendJson(res, 200, {
      links: { storeUrl: STORE_URL, expertUrl: EXPERT_URL },
      messages,
      buttons
    });
  }

  return serveStatic(req, res);
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, () => {
    console.log(`Nutrition chatbot running at http://localhost:${PORT}`);
  });
}
