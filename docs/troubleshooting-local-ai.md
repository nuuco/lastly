# Troubleshooting: 온디바이스 이해 모델

## 증상

- 말·글 입력 후 확인 화면은 뜨지만, 이해 모델이 실제로 돌지 않음
- 확인 화면 하단이 「문장 규칙으로 이해했어요」로만 표시됨
- `/lfm-check.html` 등에서 LFM 로드 실패

## 원인

- LFM2.5-350M 모델 파일 자체 문제가 아님
- 브라우저에서 LFM을 열던 ONNX Runtime 세션 생성이 실패함
- 세션이 열리지 않으면 앱은 규칙(오늘/어제, 했어 등)만으로 진행함

## 조치

| 항목 | 이전 | 이후 |
|---|---|---|
| 런타임 | ONNX Runtime | MediaPipe LLM Inference (WebGPU) |
| 모델 | LFM2.5-350M | Gemma 3 1B 4비트 (`gemma3-1b-it-int4-web.task`, 약 670MB) |
| 실행 | 메인/워커 ORT | Web Worker + MediaPipe |

- Chrome에서 짧은 한국어 → JSON 슬롯 추출 동작 확인
- STT(Web Speech)는 변경 없음
- Safari·WebGPU 미지원 환경은 규칙만 사용

## 개발 환경

1. https://huggingface.co/google/gemma-3-1b-it 라이선스 동의
2. https://huggingface.co/settings/tokens 에서 Read 토큰 발급
3. `.env.example` → `.env` 후 `HF_TOKEN=hf_...`
4. `npm run download:gemma` (`public/models/`, git 제외)
5. Chrome에서 앱 홈 「모델 받기」 또는 `/gemma-check.html`

토큰은 모델 다운로드에만 사용. 앱·클라이언트에 넣지 않음.

## 확인

확인 화면 하단 문구

| 문구 | 의미 |
|---|---|
| 문장을 이해해 봤어요 | Gemma 사용 |
| 문장 규칙으로 이해했어요 | 규칙만 사용 |
| 자세한 이해는 직접 확인해 주세요 | 모델 로드 실패 |

검증 예

- 어제 빨래했어 → 완료 · 빨래 · 어제
- 시트 세탁 언제 했지 → 조회 · 시트 세탁

## 남은 이슈

- 모델 약 670MB → 사용자 다운로드 동의·안내 UI 필요
- 다른 후보 모델로 교체·비교 가능
