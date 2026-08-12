# 🏠 우리집 가계팀

우리집 재정을 관리하는 Claude 에이전트 팀입니다. 월급 관리, 지출 관리, 고정비 관리, 절약 코칭을 담당합니다.

## 팀 구성

| 에이전트 | 역할 |
|---|---|
| `finance-income` | 수입·월급 관리 — 월급, 하마필름 수입, 부수입 기록과 현금흐름 파악 |
| `finance-fixed-costs` | 고정비 관리 — 월세, 보험, 통신, 구독 등 매달 나가는 돈 점검과 절감 |
| `finance-spending` | 지출 분석 — 변동 지출을 카테고리별로 분석하고 과소비 패턴 발견 |
| `finance-coach` | 절약·저축 코치 — 어디서 아끼고 어디에 써야 하는지 실행 가능한 조언 |

## 사용법

Claude Code에서 `/household-finance` 를 입력하면 가계팀이 움직입니다.

- `/household-finance 결산` — 이번 달 수입·지출 전체 결산 리포트
- `/household-finance 지출기록 마트 45유로` — 지출 한 건 기록
- `/household-finance 고정비점검` — 고정비 전체 점검 및 절감 포인트 찾기
- `/household-finance 상담 <질문>` — "이거 사도 돼?", "얼마나 저축해야 해?" 같은 상담

## 데이터 구조

```
household/
├── profile.md        # 가구 기본 정보 (가족 구성, 통화, 급여일 등)
├── income.md         # 수입원 목록 (월급, 사업 수입, 부수입)
├── fixed-costs.md    # 고정비 목록 (월세, 보험, 통신, 구독)
├── goals.md          # 저축 목표와 예산 규칙
├── ledger/           # 월별 지출 기록 (YYYY-MM.md)
└── reports/          # 가계팀이 생성한 월간 결산 리포트
```

## ⚠️ 처음 할 일

`profile.md`, `income.md`, `fixed-costs.md`, `goals.md` 에 `[채워주세요]` 표시된 항목이 있습니다.
이전에 Claude와 나눈 돈 관련 대화 내용을 붙여넣거나 직접 알려주면, 가계팀이 파일에 정리해서 저장합니다.
데이터가 채워질수록 조언이 정확해집니다.
