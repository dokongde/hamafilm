/** ============================================================
 * 하마필름 스케줄 — 출근 푸시 알림 (FCM HTTP v1)
 * Apps Script 프로젝트(기존 스케줄 앱 GAS)에 이 파일 전체를
 * 새 스크립트 파일로 추가해서 쓴다. 연동 방법은 SETUP.md 참고.
 *
 * 필요한 사전 설정:
 *  - 스크립트 속성(Script Properties)에 FCM_SA_JSON =
 *    Firebase 서비스 계정 키 JSON 전체 텍스트
 *  - 프로젝트 시간대: Europe/Berlin 권장 (아래 TZ 상수로도 방어)
 *  - setupPushTrigger() 1회 실행 →
 *      · 5분마다 sendShiftReminders (30분 전 / 시작 직전 / 종료 직전)
 *      · 매달 15일 오전 10시 sendMonthlyConfirm (근무내역 확인)
 * ============================================================ */

// ===== 설정 (여기만 바꾸면 됨) =====
var REMINDER_MIN_BEFORE = 30;   // 시프트 시작 몇 분 전에 알림을 보낼지
var TRIGGER_EVERY_MIN   = 5;    // 트리거 실행 주기(분) — setupPushTrigger와 일치시킬 것
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
    } else if (body.pushAction === "notifyPay") {
      out = notifyPay_(body);
    } else if (body.pushAction === "clockEvent") {
      out = clockEvent_(body);
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

// staff 목록 (wage 포함) — data 버킷에서 읽는다.
// 구형(hamafilm_v2 래핑) / 신형(키 직접) 두 형식 모두 지원.
function loadStaff_() {
  var res = UrlFetchApp.fetch(WEB_APP_URL, { muteHttpExceptions: true, followRedirects: true });
  var j = JSON.parse(res.getContentText());
  var raw = j && j.data && j.data.data;
  if (!raw) return [];
  var parsed = JSON.parse(raw);
  var d = parsed["hamafilm_v2"] || parsed;
  return d.staff || [];
}

// "HH:mm" → 분. 형식이 아니면 null.
function toMin_(hm) {
  if (!hm || typeof hm !== "string" || hm.indexOf(":") < 0) return null;
  var p = hm.split(":");
  var v = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  return isNaN(v) ? null : v;
}

// 시프트 근무시간(h) — 앱의 shiftHours()와 동일 규칙:
// sh.hours 우선, 없으면 start~end 간격 (기본 슬롯도 hours == end-start).
function shiftHours_(sh) {
  if (sh.hours) return Number(sh.hours);
  var s = toMin_(sh.start), e = toMin_(sh.end);
  if (s == null || e == null) return 0;
  return Math.max(e - s, 0) / 60;
}

/* ============================================================
 * 3) 리마인더 발송 — 시간 트리거가 5분마다 호출
 * 알림 3종 (각각 CacheService 키 분리로 중복 발송 방지, 6시간):
 *   a) 시작 30분 전 (sent_)  — 남은 시간이 (25, 30]일 때
 *   b) 시작 직전   (start_) — 남은 시간이 [0, 5]일 때
 *   c) 종료 직전   (end_)   — 종료까지  [0, 5]일 때
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

  // 창에 들어왔고 아직 안 보낸 경우에만 true (+ 캐시 마킹)
  function shouldSend(inWindow, key) {
    if (!inWindow) return false;
    if (cache.get(key)) return false;
    cache.put(key, "1", 21600); // 6시간 — 당일 재발송 방지
    return true;
  }

  shifts.forEach(function (s) {
    if (s.date !== today) return;
    var list = tokens[String(s.staffId)];
    if (!list || !list.length) return;

    var send = function (title, body, tag) {
      list.forEach(function (tk) { sendFcm_(tk, title, body, tag); });
    };

    var startMin = toMin_(s.start);
    var endMin = toMin_(s.end);

    // a) 시작 30분 전
    if (startMin != null) {
      var diff = startMin - nowMin; // 시작까지 남은 분
      var inWin = diff <= REMINDER_MIN_BEFORE && diff > REMINDER_MIN_BEFORE - TRIGGER_EVERY_MIN;
      if (shouldSend(inWin, "sent_" + today + "_" + s.id)) {
        var title;
        if (s.slotType === "오프닝") { title = "🌅 오늘 오프닝 출근이에요"; }
        else if (s.slotType === "클로징") { title = "🌆 오늘 클로징 출근이에요"; }
        else { title = "🕐 오늘 근무가 있어요"; }
        send(title, s.start + "~" + (s.end || "") + " 근무 · " + REMINDER_MIN_BEFORE + "분 뒤 시작해요!", "shift_" + s.id);
      }
    }

    // b) 시작 직전 (남은 시간 0~5분)
    if (startMin != null) {
      var dS = startMin - nowMin;
      if (shouldSend(dS >= 0 && dS <= TRIGGER_EVERY_MIN, "start_" + today + "_" + s.id)) {
        send("🏃 곧 시작!", s.start + " 근무 — 출근 버튼 누르고 체크리스트 확인하세요!", "shiftstart_" + s.id);
      }
    }

    // c) 종료 직전 (종료까지 0~5분)
    if (endMin != null) {
      var dE = endMin - nowMin;
      if (shouldSend(dE >= 0 && dE <= TRIGGER_EVERY_MIN, "end_" + today + "_" + s.id)) {
        send("🏁 곧 퇴근!", s.end + " 마감 — 퇴근 버튼 누르고 체크리스트 확인하세요!", "shiftend_" + s.id);
      }
    }
  });
}

/* ============================================================
 * 3-1) 월급 준비 알림 — doPost {pushAction:"notifyPay", staffId, memo?}
 * 해당 직원의 모든 구독 기기에 발송. 응답 {ok:true, sent:n}
 * (sent:0 이면 그 직원은 알림 미구독 상태)
 * ============================================================ */
function notifyPay_(body) {
  if (!body.staffId && body.staffId !== 0) return { ok: false, error: "staffId 필요" };
  var tokens = tokensByStaff_();
  var list = tokens[String(body.staffId)] || [];
  var msg = body.memo ? String(body.memo) : "이번 달 급여가 준비되었습니다. 확인해주세요!";
  var n = 0;
  list.forEach(function (tk) {
    sendFcm_(tk, "💰 월급이 준비됐어요", msg, "pay_" + body.staffId);
    n++;
  });
  return { ok: true, sent: n };
}

/* ============================================================
 * 3-1b) 관리자 출퇴근 알림 — doPost
 *   {pushAction:"clockEvent", staffId, staffName, type:"in"|"out",
 *    time:"HH:mm", planned:"HH:mm"(선택 — 예정 시작/종료 시각)}
 * 앱에서 직원이 출근/퇴근 체크 시 호출 → staffId "admin" 으로
 * 구독된 모든 기기(사장님 폰)에 발송. 응답 {ok:true, sent:n}
 * planned가 오면 시프트 재조회 없이 정시/지각을 계산해 표시.
 * ============================================================ */
function clockEvent_(body) {
  if (!body || (body.type !== "in" && body.type !== "out")) {
    return { ok: false, error: 'type은 "in"|"out"' };
  }
  var isIn = body.type === "in";
  var name = body.staffName || (body.staffId != null ? "직원 " + body.staffId : "직원");
  var title = isIn ? "✅ " + name + " 출근" : "🌙 " + name + " 퇴근";

  var txt = String(body.time || "");
  var t = toMin_(body.time), p = toMin_(body.planned);
  if (t != null && p != null) {
    var diff = t - p; // 실제 - 예정 (분)
    if (isIn) {
      txt += diff > 0 ? " (" + diff + "분 지각)" : " (정시)";
    } else {
      txt += diff < 0 ? " (" + (-diff) + "분 일찍)" : " (정시)";
    }
  }

  var list = tokensByStaff_()["admin"] || [];
  var n = 0;
  list.forEach(function (tk) {
    sendFcm_(tk, title, txt, "clock_" + (body.staffId != null ? body.staffId : "") + "_" + body.type);
    n++;
  });
  return { ok: true, sent: n };
}

/* ============================================================
 * 3-2) 매달 15일 근무내역 확인 알림 — 트리거가 15일 오전 10시 호출
 * 이번 달 1일~오늘 시프트를 직원별 집계 (앱과 동일: hours × wage,
 * 휴게 차감 없음) → 구독된 직원에게 확인 요청 발송.
 * ============================================================ */
function sendMonthlyConfirm() {
  var now = new Date();
  var ym = Utilities.formatDate(now, TZ, "yyyy-MM");
  var today = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  var monthNum = parseInt(ym.split("-")[1], 10);

  var cache = CacheService.getScriptCache();
  var dedupKey = "monthly_" + ym;
  if (cache.get(dedupKey)) return; // 같은 달 중복 실행 방지
  cache.put(dedupKey, "1", 21600);

  var tokens = tokensByStaff_();
  if (Object.keys(tokens).length === 0) return;

  var wageBy = {};
  loadStaff_().forEach(function (st) { wageBy[String(st.id)] = Number(st.wage) || 0; });

  // 직원별 집계: 근무 날짜(일) 목록 + 총 시간
  var agg = {}; // staffId → { days: [], hours: 0 }
  loadShifts_().forEach(function (s) {
    if (!s.date || s.date.slice(0, 7) !== ym || s.date > today) return;
    var sid = String(s.staffId);
    if (!agg[sid]) agg[sid] = { days: [], hours: 0 };
    var day = parseInt(s.date.slice(8, 10), 10);
    if (agg[sid].days.indexOf(day) < 0) agg[sid].days.push(day);
    agg[sid].hours += shiftHours_(s);
  });

  var fmtNum = function (n) {
    // 21.5 → "21.5", 301.0 → "301"
    return String(Math.round(n * 100) / 100);
  };

  Object.keys(agg).forEach(function (sid) {
    var list = tokens[sid];
    if (!list || !list.length) return; // 미구독 직원은 건너뜀
    var a = agg[sid];
    a.days.sort(function (x, y) { return x - y; });
    var daysTxt = a.days.map(function (d) { return d + "일"; }).join("·");
    var amount = a.hours * (wageBy[sid] || 0);
    if (!(amount > 0)) return; // 시급 미입력 등 €0 이면 발송 안 함 ("€0 확인" 알림 방지)
    var body = daysTxt + " 근무, 총 " + fmtNum(a.hours) + "시간 · €" + fmtNum(amount)
      + " — 맞는지 확인해주세요!";
    list.forEach(function (tk) {
      sendFcm_(tk, "📋 " + monthNum + "월 근무 확인", body, "monthly_" + ym);
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
    var fn = t.getHandlerFunction();
    if (fn === "sendShiftReminders" || fn === "sendMonthlyConfirm") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendShiftReminders").timeBased().everyMinutes(TRIGGER_EVERY_MIN).create();
  ScriptApp.newTrigger("sendMonthlyConfirm").timeBased()
    .onMonthDay(15).atHour(10).inTimezone(TZ).create();
  console.log("트리거 설치 완료: sendShiftReminders / " + TRIGGER_EVERY_MIN + "분마다"
    + " + sendMonthlyConfirm / 매달 15일 10시(" + TZ + ")");
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
