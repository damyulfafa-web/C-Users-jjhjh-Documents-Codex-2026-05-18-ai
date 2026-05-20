const messages = document.querySelector("#messages");
const quickReplies = document.querySelector("#quickReplies");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
let appConfig = {
  links: {
    storeUrl: "https://store.kakao.com/dypharm",
    expertUrl: "https://pf.kakao.com/_HJnvn"
  },
  messages: {
    welcome: "안녕하세요. 생활습관 문진을 바탕으로 건강기능식품 선택을 도와드릴게요. 원하시면 바로 맞춤 문진을 시작할 수 있어요."
  },
  buttons: {
    start: "문진 시작",
    expert: "전문가 상담"
  }
};

function addMessage(text, who = "bot") {
  const bubble = document.createElement("div");
  bubble.className = `message ${who}`;
  bubble.textContent = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function setQuickReplies(replies = []) {
  quickReplies.innerHTML = "";
  replies.forEach((reply) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = reply.label;
    button.addEventListener("click", () => {
      if (reply.action === "webLink" && reply.webLinkUrl) {
        window.open(reply.webLinkUrl, "_blank", "noopener,noreferrer");
        return;
      }
      sendMessage(reply.messageText || reply.label);
    });
    quickReplies.appendChild(button);
  });
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message) return;

  addMessage(message, "user");
  input.value = "";
  setQuickReplies([]);

  const response = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, userId: "browser-demo" })
  });
  const data = await response.json();
  const textReply = data.template?.outputs?.[0]?.simpleText?.text || "잠시 후 다시 시도해 주세요.";
  addMessage(textReply, "bot");
  setQuickReplies(data.template?.quickReplies || []);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

async function startDemo() {
  try {
    const response = await fetch("/config");
    appConfig = await response.json();
  } catch {
    // 기본 설정으로 계속 실행합니다.
  }

  addMessage(appConfig.messages.welcome);
  setQuickReplies([
    {
      label: appConfig.buttons.start,
      action: "message",
      messageText: appConfig.buttons.start
    },
    {
      label: appConfig.buttons.expert,
      action: "webLink",
      webLinkUrl: appConfig.links.expertUrl
    }
  ]);
}

startDemo();
