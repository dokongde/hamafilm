/* ============================================================
 * 하마필름 스케줄 — 푸시 알림 서비스워커
 *
 * ⚠️ 설정 방법:
 *   Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹) 의 config 값을
 *   아래 FIREBASE_CONFIG 에 채워 넣는다.
 *   (src/pushConfig.js 에도 같은 값을 넣어야 한다 — 두 곳!)
 *
 * config가 비어 있으면 아무 것도 하지 않는다 (안전).
 * fetch 핸들러는 일부러 없음 — 오프라인 캐시를 하지 않아
 * Vercel 재배포 시 구버전이 캐시로 남는 문제를 원천 차단한다.
 * ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPwbzE799EUsnRXw6Ga6FLpbrlADHa5qo",
  authDomain: "hamafilm-schedule.firebaseapp.com",
  projectId: "hamafilm-schedule",
  storageBucket: "hamafilm-schedule.firebasestorage.app",
  messagingSenderId: "35696967712",
  appId: "1:35696967712:web:0eb82d4e96ef682741bc45"
};

if (FIREBASE_CONFIG.apiKey) {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

  firebase.initializeApp(FIREBASE_CONFIG);
  const messaging = firebase.messaging();

  // GAS가 data-only 메시지를 보내므로 여기서 직접 알림을 띄운다
  messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    self.registration.showNotification(d.title || "💙 하마필름", {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag || undefined, // 같은 시프트 알림 중복 방지
      data: { url: d.url || "/" }
    });
  });
}

// 알림 탭 → 앱 열기 (이미 열려 있으면 포커스)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
