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
