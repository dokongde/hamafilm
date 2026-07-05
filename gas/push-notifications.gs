/** ============================================================
 * 하마필름 스케줄 — 출근 푸시 알림 (FCM HTTP v1)
 * Apps Script 프로젝트(기존 스케줄 앱 GAS)에 이 파일 전체를
 * 새 스크립트 파일로 추가해서 쓴다. 연동 방법은 SETUP.md 참고.
 *
 * 필요한 사전 설정:
 *  - 스크립트 속성(Script Properties)에 FCM_SA_JSON =
 *    Firebase 서비스 계정 키 JSON 전체 텍스트
 *  - 프로젝트 시간대: Europe/Berlin 권장 (아래 TZ 상수로도 방어)
 *  - setupPushTrigger() 1회 실행 → 15분마다 sendShiftReminders 실행
 * ============================================================ */

// ===== 설정 (여기만 바꾸면 됨) =====
var REMINDER_MIN_BEFORE = 60;   // 시프트 시작 몇 분 전에 알림을 보낼지
var TRIGGER_EVERY_MIN   = 15;   // 트리거 실행 주기(분) — setupPushTrigger와 일치시킬 것
var TZ                  = "Europe/Berlin";
var PUSH_SHEET_NAME     = "push"; // 구독(토큰) 저장 시트 이름

// 이 프로젝트의 웹앱 배포 URL (shifts 데이터를 doGet으로 읽는 데 사용)
// ※ GAS 편집기에서 시트를 직접 읽도록 바꿔도 됨 — loadShifts_() 참고
var WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw48A5z_PANeJWD-GRZbNc0SPj2uZmurngM1TQiq3tx69VDR9zDC153IOsVcxGSGaV8/exec";

/* ============================================================
 * 1) doPost 연동 — 기존 doPost(e) 함수 "맨 앞"에 아래 두 줄 추가:
 *
 *   var _b = JSON.parse(e.postData.contents);
 *   if (_b && _b.pushAction) return handlePushAction_(_b);
 *
 * (기존 로직은 그대로 두면 됨)
 * ============================================================ */

// ===== 구독 저장/삭제 =====
function handlePushAction_(body) {
  var out = { ok: false };
  try {
    if (body.pushAction === "subscribe") {
      upsertToken_(body);
      out = { ok: true };
    } else if (body.pushAction === "unsubscribe") {
      removeToken_(body.token);
      out = { ok: true };
    } else {
      out = { ok: false, error: "unknown pushAction" };
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function getPushSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID); // 독립형 스크립트라 ID로 직접 연다 (SHEET_ID는 Code.gs 전역)
  var sh = ss.getSheetByName(PUSH_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PUSH_SHEET_NAME);
    sh.appendRow(["token", "staffId", "staffName", "ua", "updatedAt"]);
  }
  return sh;
}

function upsertToken_(body) {
  if (!body.token || !body.staffId) throw new Error("token/staffId 필요");
  var sh = getPushSheet_();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === body.token) {
      sh.getRange(i + 1, 1, 1, 5).setValues([[
        body.token, body.staffId, body.staffName || "", body.ua || "", new Date().toISOString()
      ]]);
      return;
    }
  }
  sh.appendRow([body.token, body.staffId, body.staffName || "", body.ua || "", new Date().toISOString()]);
}

function removeToken_(token) {
  if (!token) return;
  var sh = getPushSheet_();
  var rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === token) sh.deleteRow(i + 1);
  }
}

// staffId → [token, ...]
function tokensByStaff_() {
  var sh = getPushSheet_();
  var rows = sh.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var sid = String(rows[i][1]);
    if (!rows[i][0]) continue;
    if (!map[sid]) map[sid] = [];
    map[sid].push(rows[i][0]);
  }
  return map;
}

/* ============================================================
 * 2) 시프트 데이터 읽기
 * 기본: 자기 자신의 doGet을 호출해 shifts 버킷을 파싱 (내부 시트
 * 구조에 의존하지 않아 안전). 필요하면 시트 직접 읽기로 교체.
 * ============================================================ */
function loadShifts_() {
  var res = UrlFetchApp.fetch(WEB_APP_URL, { muteHttpExceptions: true, followRedirects: true });
  var j = JSON.parse(res.getContentText());
  var raw = j && j.data && j.data.shifts;
  if (!raw) return [];
  var parsed = JSON.parse(raw);
  return parsed.shifts || [];
}

/* ============================================================
 * 3) 리마인더 발송 — 시간 트리거가 15분마다 호출
 * "시작 REMINDER_MIN_BEFORE분 전 ~ (REMINDER_MIN_BEFORE-트리거주기)분 전"
 * 창에 들어온 시프트에 1회 발송. CacheService로 중복 발송 방지(6시간).
 * ============================================================ */
function sendShiftReminders() {
  var now = new Date();
  var today = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  var hm = Utilities.formatDate(now, TZ, "HH:mm").split(":");
  var nowMin = parseInt(hm[0], 10) * 60 + parseInt(hm[1], 10);

  var tokens = tokensByStaff_();
  if (Object.keys(tokens).length === 0) return; // 구독자 없음

  var shifts = loadShifts_();
  var cache = CacheService.getScriptCache();

  shifts.forEach(function (s) {
    if (s.date !== today || !s.start) return;
    var list = tokens[String(s.staffId)];
    if (!list || !list.length) return;

    var p = s.start.split(":");
    var startMin = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    var diff = startMin - nowMin; // 시작까지 남은 분

    // 알림 창: 예) 60분 전 트리거 주기 15분 → 남은 시간이 (45, 60]일 때 발송
    if (diff > REMINDER_MIN_BEFORE || diff <= REMINDER_MIN_BEFORE - TRIGGER_EVERY_MIN) return;

    var dedupKey = "sent_" + today + "_" + s.id;
    if (cache.get(dedupKey)) return;
    cache.put(dedupKey, "1", 21600); // 6시간 — 당일 재발송 방지

    var title, emoji;
    if (s.slotType === "오프닝") { title = "🌅 오늘 오프닝 출근이에요"; }
    else if (s.slotType === "클로징") { title = "🌆 오늘 클로징 출근이에요"; }
    else { title = "🕐 오늘 근무가 있어요"; }
    var body = s.start + "~" + (s.end || "") + " 근무 · 곧 시작해요!";

    list.forEach(function (tk) {
      sendFcm_(tk, title, body, "shift_" + s.id);
    });
  });
}

/* ============================================================
 * 4) FCM HTTP v1 발송 (서비스 계정 → OAuth 토큰 → 발송)
 * ============================================================ */
function getServiceAccount_() {
  var raw = PropertiesService.getScriptProperties().getProperty("FCM_SA_JSON");
  if (!raw) throw new Error("스크립트 속성 FCM_SA_JSON 이 없습니다 (Firebase 서비스 계정 키 JSON)");
  return JSON.parse(raw);
}

function getFcmAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("fcm_access_token");
  if (cached) return cached;

  var sa = getServiceAccount_();
  var nowSec = Math.floor(Date.now() / 1000);
  var b64 = function (o) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, "");
  };
  var unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600
  });
  var sig = Utilities.computeRsaSha256Signature(unsigned, sa.private_key);
  var jwt = unsigned + "." + Utilities.base64EncodeWebSafe(sig).replace(/=+$/, "");

  var res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  var tok = JSON.parse(res.getContentText()).access_token;
  if (!tok) throw new Error("FCM 토큰 발급 실패: " + res.getContentText().slice(0, 200));
  cache.put("fcm_access_token", tok, 3000); // 50분 캐시
  return tok;
}

function sendFcm_(deviceToken, title, body, tag) {
  var sa = getServiceAccount_();
  var url = "https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send";
  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + getFcmAccessToken_() },
    // data-only 메시지 — 표시는 서비스워커(onBackgroundMessage)가 담당
    payload: JSON.stringify({
      message: {
        token: deviceToken,
        data: { title: title, body: body, tag: tag || "", url: "/" },
        webpush: { headers: { Urgency: "high", TTL: "7200" } }
      }
    }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 404 || res.getContentText().indexOf("UNREGISTERED") >= 0) {
    // 만료/삭제된 토큰 → 시트에서 제거
    removeToken_(deviceToken);
  } else if (code >= 300) {
    console.error("FCM 발송 실패 " + code + ": " + res.getContentText().slice(0, 300));
  }
}

/* ============================================================
 * 5) 관리 유틸 — 편집기에서 직접 실행
 * ============================================================ */

// 트리거 설치 (1회 실행) — 기존 동일 트리거는 정리 후 재설치
function setupPushTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendShiftReminders") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendShiftReminders").timeBased().everyMinutes(TRIGGER_EVERY_MIN).create();
  console.log("트리거 설치 완료: sendShiftReminders / " + TRIGGER_EVERY_MIN + "분마다");
}

// 테스트 발송 — 구독된 모든 기기에 테스트 알림
function testPushAll() {
  var tokens = tokensByStaff_();
  var n = 0;
  Object.keys(tokens).forEach(function (sid) {
    tokens[sid].forEach(function (tk) {
      sendFcm_(tk, "💙 하마필름 테스트", "알림이 잘 도착하면 설정 완료!", "test");
      n++;
    });
  });
  console.log("테스트 발송: " + n + "건");
}

// 현재 구독 현황 확인
function listSubscriptions() {
  var sh = getPushSheet_();
  console.log(JSON.stringify(sh.getDataRange().getValues(), null, 2));
}
