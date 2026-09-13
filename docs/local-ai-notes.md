# LASTLY 로컬 AI · 모델 · 용어 정리

팀 논의·캡처·실험 중에 나온 개념을 한곳에 모은 메모입니다.  
(2026-09 기준, LASTLY Sprint 맥락)

---

## 1. 큰 그림: 로컬 AI vs WebGPU

| | 로컬 AI (온디바이스) | WebGPU |
|---|---|---|
| 질문 | 모델을 **이 기기**에서 돌릴까, **서버**로 보낼까 | 브라우저에서 **GPU**로 돌릴까, **CPU**로 돌릴까 |
| 비유 | 요리를 **우리 집 주방**에서 한다 | 주방에 **가스레인지(GPU)**가 있다 |
| 반대편 | 클라우드 API (OpenAI, Gemini 등) | WASM = CPU로 돌리기 |
| LASTLY | Whisper·LFM을 브라우저에 받아 캐시에 둠 | 가능하면 WebGPU, 안 되면 WASM |

한 줄:

> **로컬 AI = 정책(서버에 안 보낸다)**  
> **WebGPU = 그 정책을 브라우저에서 버틸 수 있게 하는 가속기**

로컬 AI가 WebGPU를 꼭 쓰는 건 아닙니다. 로컬이어도 CPU(WASM)만으로 돌릴 수 있습니다.  
다만 느려서, 브라우저에서는 WebGPU가 “현실적인 속도”를 만드는 쪽에 가깝습니다.

칩에 GPU가 있는 것과, 브라우저가 WebGPU로 열어주는 것은 **별개**입니다.  
열쇠(WebGPU)가 없으면 엔진(칩 GPU)이 있어도 CPU(WASM)로 갑니다.

---

## 2. LASTLY에 이미 있는 구조

팀원 캡처의 “로컬 어댑터 → STT → 이해 → 확인 → 저장”은 **새로 도입할 그림이 아니라, 지금 파이프라인에 가깝습니다.**

```
말하기
  → Web Speech (실시간 받아쓰기)   ※ 브라우저 자체 STT
  → 실패 시 Whisper (로컬 ONNX, WebGPU→WASM)
이해
  → 규칙 게이트
  → Gemma 3 1B (MediaPipe WebGPU, 동의 후)
  → 실패 시 규칙만으로 계속
확인 후
  → IndexedDB 저장
```

클라우드 LLM API는 본선에 없습니다.  
도구는 **Transformers.js** (+ ONNX Runtime Web)입니다.

---

## 3. 용어 치트시트 (외우기용)

### Web Speech API
브라우저에 들어 있는 **받아쓰기**(마이크 → 글자).  
LASTLY가 만든 STT가 아니라 사파리·크롬이 제공하는 기능.  
개발·실시간 STT는 Safari 기준.

### Whisper
로컬 **음성→글** 모델. Web Speech가 실패·미지원일 때 폴백.  
`onnx-community/whisper-base` 등.

### LFM (LFM2.5-350M)
로컬 **이해** 모델. 받아쓴 문장에서 의도·할일·날짜·주기(JSON)를 뽑으려 함.  
앱 본선. `dtype: "q4"`.

### WASM (WebAssembly)
브라우저에서 **CPU로** 네이티브에 가까운 코드를 돌리는 방식.  
여기선 “WebGPU 없을 때 같은 모델을 CPU로 돌리기”로 외우면 됨.  
**모델이 바뀌는 게 아니라 실행 장소(CPU)가 바뀜.**

### ONNX
모델을 여러 환경에서 돌리기 쉽게 포장한 **공통 상자**.  
외우기: **USB-C처럼, 모델 호환 포맷.**  
`.onnx` 파일 + ONNX Runtime이 연다.

### ONNX Runtime / 세션
상자를 열어 **실제로 추론을 돌리는 엔진**.  
“세션 생성” = 모델을 메모리에 올려 실행 준비를 끝내는 단계.  
여기서 죽으면 파일이 있어도 AI는 안 돌아감.

### Transformers.js
Hugging Face 모델을 **브라우저/Node에서** 돌리게 해주는 JS 라이브러리.  
외우기: **주방을 차리는 도구.** 모델 이름 자체가 아님.  
LASTLY는 이미 사용 중. (WebLLM은 큰 채팅 모델용에 가깝고, JSON 슬롯만 뽑는 일에는 과한 편.)

### 양자화 (q4, q8, 1비트 등)
모델 숫자 정밀도를 줄여 **용량·속도를 아끼는** 압축.  
4비트(q4) = 대략 무게를 크게 줄인 버전.  
**LASTLY LFM은 이미 q4.**  
너무 줄이면(1비트 등) 용량은 좋은데 JSON이 깨질 위험이 커짐.

### ROI
Return On Investment. **들인 시간·비용 대비 얻는 이득.**  
파인튜닝·모델 교체가 “숫자로 확실히 나아지는지”를 보는 기준.

### 워커 (Web Worker)
브라우저 **백그라운드 일손**.  
화면(홀)은 안 멈추고, 모델 계산(주방)은 옆에서 돌림.  
LFM·Whisper는 워커에서 로드.

### 규칙 게이트 / 규칙 폴백
정규식·패턴으로 의도·날짜 등을 잡는 코드.  
모델이 죽거나 애매하면 **규칙만으로** 앱이 계속 동작.  
그래서 LFM이 안 열려도 “뭔가 이해된 것처럼” 보일 수 있음.

### 골든셋 (79문장)
정답이 적힌 평가 문장 모음.  
모델·규칙을 **느낌**이 아니라 **4축(유형·할일·날짜·주기)** 숫자로 비교할 때 씀.

### jsep vs non-jsep (ORT WASM)
ONNX Runtime Web 빌드 종류.  
jsep은 WebGPU 쪽에 가깝고, Safari/WebKit에서 세션·리소스 이슈가 보고된 적 있음.  
CPU만 쓸 때는 non-jsep WASM을 쓰는 우회가 있음.

---

## 4. 모델 이야기 (팀에 나온 것들)

### 이미 쓰는 것

| 역할 | 모델 | 비고 |
|------|------|------|
| 받아쓰기 폴백 | Whisper-base | Web Speech 실패 시 |
| 이해 본선 | LFM2.5-350M q4 | 규칙과 병합 |

### 논의·실험 후보

| 모델 | 한 줄 | LASTLY 관점 |
|------|--------|-------------|
| **Gemma 4 / 큰 Gemma** | 범용·용량 큼 (캡처의 700MB급 등) | 모바일 PWA 본선에는 과한 편 |
| **Function Gemma (~270M)** | **함수/도구 호출**에 맞춰 다듬어진 작은 Gemma | JSON·슬롯 추출 실험 후보. 기성품 ONNX로 벤치 가능. 파인튜닝은 별도 |
| **Qwen 2.5 0.5B Instruct q4** | 초소형 지시 따르기 | 용량·속도 면에서 실험 후보 |
| **Gemma 3 1비트 등** | 극단 양자화 | ROI 불명확. JSON 깨짐 위험 |

### Function Gemma가 뭔가
일반 채팅보다 **“이 함수를 이런 인자로 호출해”** 형태에 강한 쪽.  
LASTLY처럼 `intent/action/date/interval`을 구조화해 뽑을 때 실험 가치가 있음.  
**기성품으로 먼저 벤치 → 숫자 보고 파인튜닝 여부 결정**이 맞음.  
파인튜닝 자체는 GPU 있으면 수십 분~반나절 가능해도, **데이터 준비가 병목**. 골든 79만으로는 과적합하기 쉬움.

### 본선 교체 조건 (합의했던 감)

- 골든 4축이 LFM보다 **확실히** 나을 것  
- JSON/함수 호출이 안 깨질 것  
- 용량·속도가 LFM의 대략 **2배 이하**일 것  
- 숫자 나오기 전에는 본선 유지

---

## 5. 모바일에서 GPU vs CPU

- 폰에도 GPU 있음 (게임·화면용).  
- **되면 GPU(WebGPU)가 보통 더 빠름.**  
- 다만 모바일 브라우저는 WebGPU를 못 여는 경우가 많음 → **CPU 폴백 필수.**  
- LASTLY 설계도 **GPU 시도 → 실패 시 WASM**.  
- 칩 GPU 유무와 브라우저 WebGPU 지원은 별개로 볼 것.

---

## 6. 벤치·확인 방법 (참고)

| 목적 | 방법 |
|------|------|
| 브라우저에서 LFM 세션만 | `http://localhost:5173/lfm-check.html` → `LFM_OK` / `LFM_FAIL` |
| Chrome에서 Gemma(MediaPipe) | `npm run download:gemma` 후 `http://localhost:5173/gemma-check.html` → `GEMMA_OK` |
| Node에서 LFM 생성·골든 | `npm run bench:models:node -- --limit=1` (또는 79) → `bench-out/` |
| 단위 테스트(규칙 위주) | `npm test` |

품질 비교는 브라우저 ORT 이슈가 있으면 **Node CPU** 쪽이 현실적일 수 있다.

---

## 7. 한 장 요약

1. **로컬 AI** = 서버 안 보냄. **WebGPU** = 브라우저 GPU 가속. **WASM** = CPU로 같은 모델.  
2. LASTLY는 이미 온디바이스(Web Speech → Whisper, 규칙 + LFM).  
3. **4비트(q4)는 이미 사용 중.**  
4. Gemma 대형·Function Gemma·Qwen 0.5B는 **실험 후보**. 본선 교체는 골든 숫자 후.  
5. Transformers.js = 도구, ONNX = 모델 상자, 세션 = 상자 열기.  
6. 세션이 안 열리면 앱은 **규칙만**으로 갈 수 있어, “되는 줄” 알기 어렵다 → `/lfm-check.html`로 확인.

---

## 관련 파일

- 이해 워커: `src/recognition/lfm.worker.ts`  
- 로드·폴백: `src/recognition/parse.ts`  
- ORT 경로/장치: `src/recognition/pinOrtWasm.ts`, `src/recognition/ortDevice.ts`  
- LFM 연결 확인: `public/lfm-check.html`  
- Node 벤치: `scripts/bench-runner/`, `npm run bench:models:node`
