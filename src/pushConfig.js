// ============================================================
// 푸시 알림 설정 (Firebase Cloud Messaging)
//
// 활성화 절차 (gas/SETUP.md 참고):
//  1. Firebase 콘솔에서 웹앱 config 값을 firebase 항목에 채운다
//  2. 클라우드 메시징 > 웹 푸시 인증서의 공개키를 vapidKey에 넣는다
//  3. public/firebase-messaging-sw.js 에도 같은 config를 넣는다
//  4. enabled 를 true 로 바꾼다
//
// enabled=false 인 동안에는 직원 화면에 알림 UI가 아예 노출되지 않는다.
// ============================================================

export const PUSH_CONFIG = {
  enabled: true,
  firebase: {
    apiKey: "AIzaSyBPwbzE799EUsnRXw6Ga6FLpbrlADHa5qo",
    authDomain: "hamafilm-schedule.firebaseapp.com",
    projectId: "hamafilm-schedule",
    storageBucket: "hamafilm-schedule.firebasestorage.app",
    messagingSenderId: "35696967712",
    appId: "1:35696967712:web:0eb82d4e96ef682741bc45"
  },
  // Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서 (키 쌍)
  vapidKey: "BHFtPR7VqUFB4VsOlbUHhxmkYKpliun4vEZsnqECRmq5qnvudfZqQZq_CMPDlDJB4k2XLTDbPtkyWqcoGnlhxTM"
};
