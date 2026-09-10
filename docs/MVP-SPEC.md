# LASTLY Sprint Spec

제품 요구사항의 원천은 `docs/PRD.md`다. 이 문서는 모델·브라우저·스키마 등 구현 세부를 적는다.

## Goal

완료한 생활 행동을 자연어(또는 음성)로 넣으면 행동과 날짜를 해석하고, 사용자가 확인한 뒤 마지막 수행 기록으로 남긴다. 조회, 주기, 리스트/달력, 지남·곧·여유, 메모·검색, 설정·알림함(앱 오픈 시), 음성 안내 on/off를 지원한다.

## In

- Sprint 1 범위 전부
- `memo`, `snoozeUntil`, 홈 상태(지남/곧/여유) + D-day
- 검색(제목·별칭·메모), 설정(음성 안내·알림·데이터 삭제)
- 알림함 IndexedDB + 오늘/다른 날/나중에 (**지남·오늘 예정**만 적재)
- 음성·글: 듣기 → **바로 이해** → 완료면 되묻기(풀페이지) / 거절이면 풀페이지에서 고쳐 기록
- 내용 수정·기록 확인·거절 직접 기록·글 입력·비슷한 기록·조회 결과: 풀페이지(하단 버튼 고정)
- 기록 갱신·알림함 액션·듣기·이해 중·달력 날짜 목록은 바텀시트


## Out

- 「이대로 이해할게요」(인식 문장 중간 확인) 단계
- 웹푸시 서버·지정 시각 예약 알람 보장
- 카테고리·가족 공유·그룹 계층·전체 수행 히스토리
- 계정·서버 DB·클라우드 STT/LLM 본선
- 설정에서 샘플 기록 다시 넣기

## 발화유형 · 브라우저 · 모델 · 전환 기준 · 음성

Sprint 1과 동일. (`못`/`안` 하드 차단, Safari 개발 기준, Web Speech → Whisper, LFM2.5-350M q4)

음성 흐름: 듣기 → 이해 → (완료) 되묻기 또는 (거절) 풀페이지. TTS는 `lastly.voiceGuide`가 꺼져 있으면 생략.

## 데이터

- IndexedDB (`lastly` **v5**), 이 기기만
- records 필드: actionKey, actionLabel, lastPerformedOn, lastUtterance, inputPath, schedule, aliases, **memo**, **snoozeUntil**, updatedAt
- **inbox** 스토어: id, actionKey, dueOn, createdAt, read, status(`open`|`done`|`snoozed`)
- 구버전: memo=`""`, snoozeUntil=`null`. intervalDays는 everyDays로만 이관
- localStorage:
  - `lastly.viewMode`
  - `lastly.notifyEnabled`(기본 켜짐), `lastly.notifyTime`(기본 `09:00`), `lastly.notifyWeekends`(기본 `1`), `lastly.notifyAsked`
  - `lastly.voiceGuide`(기본 켜짐, `0`이면 TTS 끔)
- 날짜·기한은 KST. **곧** = 기한까지 0~3일(오늘 포함)
- 목록 정렬: `updatedAt` 최근순

## UI 요약

- 리스트: 구분선 행, 호버 좌우 풀블리드, 제목 옆 D-day, 주기 있으면 게이지
- 하단: 보기 토글 · 마이크 · 글 입력
- 설정·알림함 행: 리스트와 같은 호버 풀블리드
- 달력 날짜 시트·후보 목록: 박스 카드 대신 구분선 행

## 알림 규칙

- 앱 오픈 시: 알림이 켜져 있고, 설정 시각이 지났으며, 주말 규칙에 맞으면 **지남·오늘 예정**만 inbox에 upsert (D-1~D-3 곧은 제외)
- snoozeUntil ≥ 오늘이면 요약·알림함에서 제외
- 홈/음성으로 수행일을 갱신하거나 삭제하면 해당 항목 알림함은 닫힘
- OS Notification은 권한이 있을 때만, 앱이 열린 순간
- 권한 상태 표시와 앱 알림 on/off는 분리
