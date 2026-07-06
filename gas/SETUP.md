# 출근 푸시 알림 — 활성화 절차 (사장님용)

앱 쪽 코드는 이미 레포에 다 들어 있고 꺼진 상태(`enabled: false`)로 배포됩니다.
아래 절차를 마치면 직원 화면에 "🔔 알림 켜기" 버튼이 나타납니다.

## 1단계 — Firebase 프로젝트 만들기 (약 10분, 무료)

1. https://console.firebase.google.com 접속 (하마필름 구글 계정으로)
2. **프로젝트 추가** → 이름 예: `hamafilm-schedule` → 애널리틱스는 꺼도 됨 → 만들기
3. 프로젝트 홈에서 **웹 앱 추가**(`</>` 아이콘) → 닉네임 예: `hamafilm-web` → 등록
   - 이때 나오는 `firebaseConfig` 값 6개(apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)를 복사해 둔다
4. **프로젝트 설정(톱니) > 클라우드 메시징** 탭 → **웹 푸시 인증서** 섹션 → **키 쌍 생성**
   - 생성된 공개키(= VAPID 키)를 복사해 둔다
5. **프로젝트 설정 > 서비스 계정** 탭 → **새 비공개 키 생성** → JSON 파일 다운로드
   - 이 JSON은 비밀키다. 절대 레포에 커밋하지 말 것 (Apps Script 속성에만 넣는다)

## 2단계 — Apps Script(기존 스케줄 앱 GAS)에 서버 코드 추가

1. 스케줄 데이터가 저장되는 구글 시트 열기 → **확장 프로그램 > Apps Script**
2. 편집기에서 **파일 추가(＋) > 스크립트** → 이름 `push-notifications`
   → 레포의 `gas/push-notifications.gs` 내용 전체를 붙여넣기
3. 기존 `doPost(e)` 함수 **맨 앞**에 아래 두 줄 추가:
   ```js
   var _b = JSON.parse(e.postData.contents);
   if (_b && _b.pushAction) return handlePushAction_(_b);
   ```
4. **프로젝트 설정(톱니) > 스크립트 속성** → 속성 추가:
   - 이름: `FCM_SA_JSON`
   - 값: 1단계 5번에서 받은 서비스 계정 JSON 파일의 **내용 전체** 붙여넣기
5. (같은 화면에서) 시간대가 `Europe/Berlin`인지 확인
6. 편집기에서 함수 `setupPushTrigger` 선택 → **실행** (권한 승인 창 나오면 승인)
   → 5분마다 `sendShiftReminders` + 매달 15일 10시 `sendMonthlyConfirm`이 돌기 시작
7. **배포 > 배포 관리 > 수정(연필) > 새 버전 > 배포** — doPost 수정 반영 (URL은 그대로 유지됨)

## 3단계 — 앱 쪽 스위치 켜기 (개발 담당이 처리)

1단계에서 복사한 값을 전달해 주면:
- `src/pushConfig.js` — firebaseConfig 6개 값 + VAPID 키 입력, `enabled: true`
- `public/firebase-messaging-sw.js` — 같은 firebaseConfig 입력
- 빌드 → 커밋 → 푸시 (Vercel 자동 배포)

## 4단계 — 동작 확인

1. 폰에서 앱 접속 → 직원 선택 → "🔔 알림 켜기" 탭
   - **아이폰**: 먼저 사파리 공유 → "홈 화면에 추가" → 홈화면 아이콘으로 열어야 버튼이 활성화됨 (iOS 정책)
2. Apps Script 편집기에서 `listSubscriptions` 실행 → 토큰이 쌓였는지 확인
3. `testPushAll` 실행 → 폰에 테스트 알림 도착하면 완료

## 알림 종류

- 시프트 시작 **30분 전** (`REMINDER_MIN_BEFORE = 30`, 숫자만 바꾸면 조정 가능 — 트리거 주기 5분보다 큰 값 권장)
- 시프트 **시작 직전** (0~5분 전): "🏃 곧 시작! 출근 버튼 누르고 체크리스트 확인하세요!"
- 시프트 **종료 직전** (0~5분 전): "🏁 곧 퇴근! 퇴근 버튼 누르고 체크리스트 확인하세요!"
- **월급 준비 알림**: 관리자 화면 급여 탭에서 직원별 "💰 알림" 버튼 → 해당 직원 기기로 발송
- **매달 15일 10시**: 이번 달 근무내역(날짜·시간·금액) 확인 요청 알림

## 주의사항

- 서비스 계정 JSON은 **Apps Script 스크립트 속성에만** 보관 (레포/메신저 공유 금지)
- 직원이 홈화면 앱을 삭제하면 토큰이 만료됨 — 발송 실패 시 자동으로 구독 목록에서 제거되니 방치해도 됨
- 무료 한도: FCM 무제한, Apps Script 트리거 하루 90분 실행(5분 주기 = 하루 288회, 1회 수 초라 여유 있음)
