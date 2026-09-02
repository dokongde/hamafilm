// ============================================================
// 웹 푸시 클라이언트 로직 (FCM)
// - 직원이 "알림 켜기"를 누르면: 권한 요청 → SW 등록 → FCM 토큰 발급
//   → GAS로 {pushAction:"subscribe", staffId, token} 전송해 저장
// - firebase SDK는 버튼을 누를 때만 동적 import (평소 번들에 미포함)
// ============================================================

import { PUSH_CONFIG } from "./pushConfig";

const LS_KEY = (sid) => `hamafilm_push_${sid}`;

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS
}

// 홈 화면에서 실행 중인가 (iOS는 이 상태에서만 푸시 가능)
export function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    || window.navigator.standalone === true;
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// 이 기기에서 알림을 켠 상태인지 (로컬 기록 + 실제 권한 둘 다 확인)
export function pushEnabledHere(staffId) {
  try {
    return !!localStorage.getItem(LS_KEY(staffId)) && Notification.permission === "granted";
  } catch (e) { return false; }
}

async function postToGas(gasUrl, body) {
  const res = await fetch(gasUrl, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow"
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = JSON.parse(await res.text());
  if (!j.ok) throw new Error(j.error || "저장 실패");
  return j;
}

// 알림 켜기 — 성공 시 true, 사용자가 권한 거부하면 "denied" throw
export async function enablePush(gasUrl, staffId, staffName) {
  if (!PUSH_CONFIG.enabled) throw new Error("푸시 미설정");
  if (!pushSupported()) throw new Error("이 브라우저는 알림을 지원하지 않아요");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("denied");

  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;

  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken } = await import("firebase/messaging");
  const app = getApps().length ? getApps()[0] : initializeApp(PUSH_CONFIG.firebase);
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: PUSH_CONFIG.vapidKey,
    serviceWorkerRegistration: reg
  });
  if (!token) throw new Error("토큰 발급 실패");

  await postToGas(gasUrl, {
    pushAction: "subscribe",
    staffId,
    staffName: staffName || "",
    token,
    ua: navigator.userAgent.slice(0, 120),
    at: new Date().toISOString()
  });

  try { localStorage.setItem(LS_KEY(staffId), token); } catch (e) {}
  return true;
}

// 자동 토큰 갱신 — 앱 열 때마다 조용히 호출.
// 이미 이 기기에서 알림을 켠 적이 있으면(권한 granted + 로컬 기록) 최신 FCM 토큰을 받아
// 바뀌었을 때만 GAS에 다시 등록한다. 권한 요청·토스트 없음, 실패해도 조용히 무시.
// → iOS 웹 토큰이 가끔 갱신돼 알림이 끊기던 문제를, 앱을 여는 것만으로 자동 복구.
export async function refreshPush(gasUrl, staffId, staffName) {
  try {
    if (!PUSH_CONFIG.enabled || !pushSupported()) return false;
    if (Notification.permission !== "granted") return false;
    let prev = null;
    try { prev = localStorage.getItem(LS_KEY(staffId)); } catch (e) {}
    if (!prev) return false; // 이 기기에서 켠 적 없으면 건드리지 않음

    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, getToken } = await import("firebase/messaging");
    const app = getApps().length ? getApps()[0] : initializeApp(PUSH_CONFIG.firebase);
    const token = await getToken(getMessaging(app), {
      vapidKey: PUSH_CONFIG.vapidKey,
      serviceWorkerRegistration: reg
    });
    if (!token || token === prev) return false; // 토큰 그대로면 재등록 불필요

    await postToGas(gasUrl, {
      pushAction: "subscribe",
      staffId,
      staffName: staffName || "",
      token,
      ua: navigator.userAgent.slice(0, 120),
      at: new Date().toISOString()
    });
    try { localStorage.setItem(LS_KEY(staffId), token); } catch (e) {}
    return true;
  } catch (e) { return false; }
}

// 알림 끄기 — 토큰 삭제 + GAS에서 구독 제거
export async function disablePush(gasUrl, staffId) {
  let token = null;
  try { token = localStorage.getItem(LS_KEY(staffId)); } catch (e) {}
  try {
    const { getApps, initializeApp } = await import("firebase/app");
    const { getMessaging, deleteToken } = await import("firebase/messaging");
    const app = getApps().length ? getApps()[0] : initializeApp(PUSH_CONFIG.firebase);
    await deleteToken(getMessaging(app));
  } catch (e) { /* 토큰이 이미 없어도 계속 진행 */ }
  if (token) {
    try { await postToGas(gasUrl, { pushAction: "unsubscribe", staffId, token }); } catch (e) {}
  }
  try { localStorage.removeItem(LS_KEY(staffId)); } catch (e) {}
  return true;
}
