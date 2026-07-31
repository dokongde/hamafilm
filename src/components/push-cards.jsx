import { useState, useEffect } from "react";
import { GAS_URL } from "../data/gas";
import { PUSH_CONFIG } from "../pushConfig";
import { isIOS, isStandalone, pushSupported, pushEnabledHere, enablePush, disablePush } from "../push";

// ─── 직원 화면: 출근 알림 카드 ───
// PUSH_CONFIG.enabled=false 인 동안에는 아무것도 렌더하지 않음 (미완성 기능 비노출)
function StaffPushCard({ staffId, staffName, toast }) {
  const [on, setOn] = useState(() => PUSH_CONFIG.enabled && pushEnabledHere(staffId));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (PUSH_CONFIG.enabled) setOn(pushEnabledHere(staffId)); }, [staffId]);

  if (!PUSH_CONFIG.enabled) return null;

  // iOS는 홈 화면에 추가된 상태에서만 푸시 수신 가능 → 설치 안내
  if (isIOS() && !isStandalone()) {
    return (
      <div className="card">
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>🔔 출근 알림 받기</div>
        <div style={{fontSize:12,color:"#666",lineHeight:1.7}}>
          아이폰은 <b>홈 화면에 추가한 앱에서만</b> 알림을 받을 수 있어요:
          <ol style={{margin:"6px 0 0 18px",padding:0}}>
            <li>사파리 하단 <b>공유 버튼</b> 탭</li>
            <li><b>“홈 화면에 추가”</b> 선택</li>
            <li>홈 화면의 💙 하마필름 아이콘으로 다시 열기</li>
            <li>이 자리에 나타나는 <b>알림 켜기</b> 버튼 누르기</li>
          </ol>
        </div>
      </div>
    );
  }

  if (!pushSupported()) {
    return (
      <div className="card">
        <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>🔔 출근 알림</div>
        <div style={{fontSize:12,color:"#888"}}>이 브라우저는 알림을 지원하지 않아요.</div>
      </div>
    );
  }

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush(GAS_URL, staffId, staffName);
      setOn(true);
      toast("🔔 알림 켜짐! 시프트 전에 알려드릴게요");
    } catch (e) {
      if ((e && e.message) === "denied") toast("알림 권한이 거부됐어요 — 폰 설정에서 허용해 주세요");
      else toast("알림 설정 실패: " + ((e && e.message) || e));
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true);
    try { await disablePush(GAS_URL, staffId); setOn(false); toast("알림 꺼짐"); }
    catch (e) { toast("해제 실패: " + ((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
        <div>
          <div style={{fontSize:13,fontWeight:700}}>🔔 출근 알림</div>
          <div style={{fontSize:11,color:"#888",marginTop:3}}>
            {on ? "켜짐 — 시프트 시작 전에 이 폰으로 알림이 와요" : "시프트 시작 전에 폰 알림을 받아요"}
          </div>
        </div>
        <button className={"btn sm " + (on ? "bs" : "bp")} disabled={busy} onClick={on ? turnOff : turnOn} style={{whiteSpace:"nowrap"}}>
          {busy ? "..." : on ? "끄기" : "알림 켜기"}
        </button>
      </div>
    </div>
  );
}

// ─── 관리자 화면: 관리자 알림 카드 (직원 출퇴근 체크 시 사장님 폰으로 푸시) ───
// staffId "admin" 으로 구독 → GAS clockEvent가 admin 구독 기기에 발송.
function AdminPushCard({ toast }) {
  const ADMIN_ID = "admin";
  const [on, setOn] = useState(() => PUSH_CONFIG.enabled && pushEnabledHere(ADMIN_ID));
  const [busy, setBusy] = useState(false);

  if (!PUSH_CONFIG.enabled) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush(GAS_URL, ADMIN_ID, "관리자");
      setOn(true);
      toast("🔔 관리자 알림 켜짐! 직원 출퇴근 시 알려드릴게요");
    } catch (e) {
      if ((e && e.message) === "denied") toast("알림 권한이 거부됐어요 — 폰 설정에서 허용해 주세요");
      else toast("알림 설정 실패: " + ((e && e.message) || e));
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true);
    try { await disablePush(GAS_URL, ADMIN_ID); setOn(false); toast("관리자 알림 꺼짐"); }
    catch (e) { toast("해제 실패: " + ((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{marginTop:12,border:"1px solid rgba(121,80,242,.25)"}}>
      <div className="ct" style={{color:"#7950f2"}}>🔔 관리자 알림</div>
      {isIOS() && !isStandalone() ? (
        <div style={{fontSize:12,color:"#666",lineHeight:1.7}}>
          아이폰은 <b>홈 화면에 추가한 앱에서만</b> 알림을 받을 수 있어요.
          사파리 공유 버튼 → “홈 화면에 추가” 후 그 아이콘으로 다시 열면 여기에 켜기 버튼이 나타나요.
        </div>
      ) : !pushSupported() ? (
        <div style={{fontSize:12,color:"#888"}}>이 브라우저는 알림을 지원하지 않아요.</div>
      ) : (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{fontSize:11,color:"#888",lineHeight:1.6}}>
            {on ? "켜짐 — 직원이 출근/퇴근 체크하면 이 폰으로 알림이 와요" : "직원이 출근/퇴근 체크하면 이 폰으로 알림을 받아요"}
          </div>
          <button className={"btn sm " + (on ? "bs" : "bp")} disabled={busy} onClick={on ? turnOff : turnOn} style={{whiteSpace:"nowrap"}}>
            {busy ? "..." : on ? "🔔 관리자 알림 끄기" : "🔔 관리자 알림 켜기"}
          </button>
        </div>
      )}
      <div style={{fontSize:10,color:"#888",marginTop:8,padding:"6px 8px",background:"#f5f5f7",borderRadius:5}}>
        ⚠️ 이 기기는 직원 알림 대신 관리자 알림을 받게 됩니다 (한 기기에 한 종류만)
      </div>
    </div>
  );
}

export { StaffPushCard, AdminPushCard };
