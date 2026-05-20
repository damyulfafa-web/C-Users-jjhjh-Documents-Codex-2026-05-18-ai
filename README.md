# 카카오 톡스토어 맞춤 영양 챗봇 스타터

카카오톡 채널/톡스토어에서 개인맞춤형 건강기능식품 상담 흐름을 운영하기 위한 챗봇 서버와 데모 화면입니다.

## 구성

- `server.mjs`: 카카오 챗봇 스킬 서버 형식의 Webhook
- `public/`: 브라우저에서 테스트하는 채팅 데모
- `data/products.json`: 추천에 사용하는 상품 후보 데이터
- `docs/kakao-setup.md`: 카카오 채널/챗봇 연결 안내
- `docs/compliance-checklist.md`: 맞춤형 건기식 운영 체크리스트
- `docs/chatbot-policy.md`: 챗봇 응답 정책과 금지 표현

## 실행

```powershell
npm start
```

브라우저에서 `http://localhost:8787`로 접속하면 데모를 볼 수 있습니다.

## OpenAI 연결

API 키가 있으면 자연어 상담 답변을 OpenAI Responses API로 생성합니다. 키가 없으면 문진과 규칙 기반 추천만으로 동작합니다.

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:OPENAI_MODEL="gpt-5.5"
$env:STORE_URL="https://store.kakao.com/dypharm"
$env:EXPERT_URL="https://pf.kakao.com/_HJnvn"
npm start
```

OpenAI 공식 문서는 Responses API 사용을 최신 생성 인터페이스로 안내하고 있으며, JavaScript SDK 예시도 `responses.create` 흐름을 사용합니다. 이 스타터는 별도 SDK 없이 같은 `/v1/responses` 엔드포인트를 호출합니다.

## 카카오 스킬 서버 엔드포인트

카카오 챗봇 관리자센터의 스킬 서버 URL에 아래 주소를 연결합니다.

```text
https://내도메인/kakao
```

로컬 테스트 중에는 터널링 도구로 `http://localhost:8787/kakao`를 외부 HTTPS URL로 노출해야 합니다.

## 운영 전 필수 수정

- `data/products.json`의 상품명, 기능성, 주의 문구를 실제 판매 상품 기준으로 바꾸기
- `STORE_URL`, `EXPERT_URL`을 실제 톡스토어/상담 신청 링크로 설정하기
- 맞춤형건강기능식품판매업, 맞춤형건강기능식품관리사, 표시사항, 소분/조합 범위 등 법적 요건 확인하기
- 건강 상태, 약물, 임신/수유, 알레르기 입력값은 개인정보/민감정보로 보고 수집 최소화와 보관 정책 정하기
