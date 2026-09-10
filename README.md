# LASTLY

**말만 하면 챙겨드릴게요.**

한 일을 말로(또는 글로) 남기면 마지막 수행일과 주기를 기억하고, “언제 했지?”라고 물으면 바로 답하는 개인용 생활 기록 PWA입니다.

이 기기 안에서만 동작합니다. 계정·서버·클라우드 인식 없이, 브라우저에서 STT·파싱을 합니다.

---

## 할 수 있는 것

- **기록** — “오늘 이불 빨았어”처럼 말하면 이해하고, 확인 후 저장
- **조회** — “설거지 언제 했어?”에 마지막 수행일로 답변
- **주기** — 7/14/30일·맞춤(간격·요일·매월) 알림 주기
- **목록·달력** — 지남/곧/여유 필터, 검색, D-day, 주기 게이지
- **메모** — 기록 부제
- **알림함** — 앱을 열었을 때 **지남·오늘 예정**만 모아 보여 줌 (서버 푸시 없음)
- **설정** — 음성 안내(TTS) on/off, 알림 시간·주말, 이 기기 데이터 삭제

---

## 실행 · 배포

**배포:** [https://lastly-lilac.vercel.app/](https://lastly-lilac.vercel.app/)

로컬:

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 을 엽니다.  
`index.html`을 파일로 직접 열면 빈 화면이 됩니다.

```bash
npm test    # 단위·골든셋 테스트
npm run build
```

**개발·실시간 받아쓰기:** Safari 기준  
**Chrome(데스크톱):** Web Speech를 먼저 시도하고, 오류·미지원이면 Whisper로 전환합니다. 받아쓰기가 자주 깨져, 지금은 Safari로 개발·데모하는 편입니다.

마이크·알림 권한은 브라우저가 요청합니다. HTTPS 또는 localhost가 필요합니다.

---

## 핵심 흐름

```
말하기 / 글 입력
    → 바로 이해 (중간 「이대로 이해할게요」 없음)
    → 완료면 확인(풀페이지) 후 저장
    → 조회면 답변
    → 애매·미완성이면 직접 고쳐 기록(풀페이지)
```

목록 카드를 누르면 **기록 갱신** 시트(오늘/다른 날 · 내용 수정 · 삭제)가 열립니다.

---

## 기술 요약

| 구분 | 내용 |
|---|---|
| UI | Vite · React · PWA |
| 저장 | IndexedDB (`lastly` v5) · localStorage(설정) |
| STT | Web Speech(실시간) → 실패 시 Whisper-base(WebGPU) |
| 이해 | LFM2.5-350M q4 + 규칙 게이트(`못`/`안` 차단, 짧은 `함` 등 완료 보정) |
| 추론 | `@huggingface/transformers` · WebGPU 우선, 불가 시 WASM |
| 날짜 | KST |

---

## 온디바이스 AI

자체 클라우드 STT·LLM API는 없습니다. **Whisper와 LFM**은 Hugging Face 모델을 받아 브라우저 캐시에 두고, UI를 막지 않도록 **Web Worker**에서 돌립니다. 실시간 받아쓰기는 브라우저 **Web Speech API**라서, Chrome 등에서는 벤더 서버를 탈 수 있습니다. (네트워크 오류 시 Whisper로 전환)

### WebGPU를 쓰는 이유

작은 모델이라도 CPU(WASM)만으로는 첫 로드와 추론이 느립니다. 워커는 WebGPU로 파이프라인을 올리고, 실패하면 WASM으로 다시 올립니다. (`navigator.gpu` 탐침은 진단용이고, 실제 선택은 로드 성공/실패입니다.)

| 단계 | WebGPU | WASM 폴백 |
|---|---|---|
| Whisper | encoder fp16 · decoder q4 | q8 |
| LFM2.5 | q4 | q4 |

### 파이프라인

```
말하기
  ├─ 본선: Web Speech API (실시간 받아쓰기)
  └─ 폴백: 녹음 → Whisper-base
        (API 없음 · iOS PWA · 오류 · 받아쓴 글이 비고 녹음이 있을 때)
        ↓
규칙 + LFM2.5-350M
  → 의도(완료/조회/예정/미완료/불확실) · 할일 · 날짜 · 주기
        ↓
완료 → 확인 후 IndexedDB 저장
조회 → 답변 (저장 없음)
```

글 입력은 STT를 건너뛰고, 같은 이해 파이프로 갑니다.

실시간 받아쓰기는 중간 결과를 바로 보여 주므로 본선입니다. Whisper는 무거워서 위 폴백일 때만 씁니다. Chrome도 Web Speech를 먼저 시도하고, Chromium에서는 받아쓰기와 녹음을 동시에 열지 않습니다. 개발·데모는 Safari가 안정적입니다.

### 모델과 선택 이유

| 역할 | 모델 | 왜 이 모델인가 |
|---|---|---|
| 받아쓰기 폴백 | [`onnx-community/whisper-base`](https://huggingface.co/onnx-community/whisper-base) | 브라우저에 올릴 수 있는 크기. 한국어 `transcribe`를 로컬에서 처리. transformers.js ONNX와 맞음 |
| 문장 이해 | [`onnx-community/LFM2.5-350M-ONNX`](https://huggingface.co/onnx-community/LFM2.5-350M-ONNX) (q4) | 350M·q4라서 기기 안에서 JSON 슬롯 추출이 가능. 챗봇이 아니라 의도·할일·날짜·주기만 뽑음 |
| 가드 | 규칙 (`못`/`안`, 짧은 `함` 등) | 부정을 완료로 올리지 않음. 규칙이 완료면 LFM이 애매해도 완료를 유지. LFM이 안 뜨면 규칙만으로도 동작 |

LFM은 temperature 0으로 JSON만 답합니다. 규칙이 완료/미완료로 보면 유형을 고정하고, 오늘·어제 같은 상대 날짜와 문장에서 잡은 주기는 규칙이 우선입니다. LFM은 할일과, 규칙이 비운 슬롯을 채웁니다.

첫 사용 때 모델을 받고, 이후에는 브라우저 캐시를 재사용합니다. (`env.useBrowserCache = true`)

요구사항·스키마 세부는 아래 문서를 봅니다.

| 문서 | 역할 |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | 제품 요구사항 원천 |
| [`docs/MVP-SPEC.md`](docs/MVP-SPEC.md) | 스키마·모델·브라우저 |
| [`docs/eval-utterances.md`](docs/eval-utterances.md) | 골든 문장 |
| [`AGENTS.md`](AGENTS.md) | 개발 이력 |

---

## 알림에 대해

지정 시각에 폰을 깨우는 **예약 알람은 없습니다.**  
서버 웹푸시 없이, **앱을 연 순간**에만 알림함·OS Notification이 동작합니다.

알림함에 들어가는 것:
- **지남** (예정일이 지남)
- **오늘이 예정일인 것**

들어가지 않는 것:
- **곧** (D-1~D-3, 아직 여유 있는 다가올 예정)

홈·음성으로 수행일을 갱신하거나 기록을 지우면, 그 항목 알림은 닫힙니다.

---

## 비범위 (현재)

계정·동기화, 가족 공유, 전체 수행 히스토리, 클라우드 STT/LLM 본선, 영어 UX, 아이폰 네이티브 푸시 보장.
