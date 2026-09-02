import { useState, useEffect, useCallback } from "react";
import { PUSH_CONFIG } from "./pushConfig";
import { isIOS, isStandalone, pushSupported, pushEnabledHere, enablePush, disablePush, refreshPush } from "./push";
import { easter, addD, dstr, hessenHols, DOW_KO, isInVacation, setCurrentVacations, getSlots, dowKo, todayStr, curYM, nextYM, prevYM, getCarryIn, fmtE, fmt, nid, shiftHours, actualMinutes, timeDiff, needsAttention, REPORT_KINDS, reportKindLabel, getMonthRange } from "./lib/utils";
import { css } from "./styles";
import { ErrorBoundary, Screen } from "./components/ErrorBoundary";
import { ScheduleTab } from "./tabs/ScheduleTab";
import { FixedTab } from "./tabs/FixedTab";
import { StaffMgmtTab } from "./tabs/StaffMgmtTab";
import { StaffView } from "./StaffView";
import { ModalHost } from "./components/ModalHost";
import { DEFAULT_PIN, STORE_KEY, PIN_KEY, SESSION_KEY, DEFAULT_DATA, GAS_URL, saveSession, clearSession, loadSession, notifyLoginEvent, GS, splitData, loadData, saveData, fetchAll, loadPin, savePin, flushPending, loadPendingSnapshot } from "./data/gas";
import { EditShiftModal, AddShiftModal, AddFixedModal, AddVacModal, GenFixedModal } from "./components/modals/shift";
import { PinChange, AddStaffModal } from "./components/modals/staff";
import { AddSalesModal, CashOutModal } from "./components/modals/sales";
import { AddPayrollModal, EditPaymentModal, ExpenseModal, HistoricalModal } from "./components/modals/payroll";
import { ChecklistRunModal, ChecklistManageModal } from "./components/modals/checklist";
import { ManualSettingsModal, CsvImportModal } from "./components/modals/settings";
import { KioskCodeSetting, KioskGateModal, KioskView } from "./components/kiosk";
import { StaffPushCard, AdminPushCard } from "./components/push-cards";
import { SalaryTab } from "./tabs/SalaryTab";
import { SalesTab } from "./tabs/SalesTab";
import { ReconTab } from "./tabs/ReconTab";
import { StatsTab } from "./tabs/StatsTab";





// ═══════════════════════════════════════════════════
// 모든 모달 컴포넌트는 최상위에 정의
// ═══════════════════════════════════════════════════








// ─── 직원 퇴근 시 서랍 현금 입력 모달 ───
// 오프닝=인계 금액 / 클로징=마감 금액. shift 레코드에 cashCount(숫자)+cashMemo 저장(spread 보존).
// doCheckOut이 actualEnd·memo 세팅 후 이 모달로 넘김 → 여기서 최종 persist + 관리자 퇴근 푸시 + 토스트.
















// ═══════════════════════════════════════════════════
// 탭 컴포넌트들 (각자 useState 사용)
// ═══════════════════════════════════════════════════






// ═══════════════════════════════════════════════════
// 메인 App
// ═══════════════════════════════════════════════════

export default function App() {
  const [data, setData] = useState(null);
  const [pin, setPin] = useState(DEFAULT_PIN);
  const [mode, setMode] = useState("staff");
  const [adminTab, setAdminTab] = useState("schedule");
  const [calY, setCalY] = useState(new Date().getFullYear());
  const [calM, setCalM] = useState(new Date().getMonth());
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [pinBuf, setPinBuf] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [svSid, setSvSid] = useState(null);
  const [svDate, setSvDate] = useState(todayStr());
  const [svCalY, setSvCalY] = useState(new Date().getFullYear());
  const [svCalM, setSvCalM] = useState(new Date().getMonth());
  const [svSel, setSvSel] = useState(null);
  const [storageMode, setStorageMode] = useState("loading");
  const [lastError, setLastError] = useState("");
  // 출퇴근 전용(kiosk) 기기 잠금 — 각 기기 localStorage에 저장
  const [kioskLocked, setKioskLocked] = useState(() => { try { return localStorage.getItem("hama_kiosk") === "1"; } catch(e) { return false; } });
  const lockKiosk = () => { try { localStorage.setItem("hama_kiosk", "1"); } catch(e) {} setKioskLocked(true); };
  const unlockKiosk = () => { try { localStorage.removeItem("hama_kiosk"); } catch(e) {} setKioskLocked(false); };
  // 관리자 전용 기기 고정 — 이 기기는 직원 세션 자동로그인 무시하고 항상 관리자 PIN로 (기기별 localStorage)
  const [adminDevice, setAdminDevice] = useState(() => { try { return localStorage.getItem("hama_admin_device") === "1"; } catch(e) { return false; } });
  const enableAdminDevice = () => { try { localStorage.setItem("hama_admin_device", "1"); } catch(e) {} clearSession(); setSvSid(null); setSvSel(null); setAdminDevice(true); };
  const disableAdminDevice = () => { try { localStorage.removeItem("hama_admin_device"); } catch(e) {} setAdminDevice(false); };

  // data가 바뀔 때마다 vacations를 전역 변수에 동기화 (getSlots에서 사용)
  useEffect(() => {
    if (data) setCurrentVacations(data.vacations || []);
  }, [data]);

  useEffect(() => {
    (async () => {
      // 지난번 저장 실패로 이 기기에 보관된 미전송 변경이 있으면 그게 최신 — 서버본 대신 쓰고 재전송 시도
      const pending = loadPendingSnapshot();
      let d;
      if (pending) {
        d = pending;
        GS.STORAGE_MODE = "local";
        flushPending().then(ok => { if (ok) { setStorageMode(GS.STORAGE_MODE); setLastError(GS.LAST_ERROR); } });
      } else {
        d = await loadData();
      }
      setData(d || DEFAULT_DATA);
      const p = await loadPin();
      setPin(p);
      setStorageMode(GS.STORAGE_MODE);
      setLastError(GS.LAST_ERROR);

      // 관리자 전용 기기 플래그 확인 (이 기기는 직원 세션 무시 → 관리자 PIN)
      let adminDeviceFlag = false;
      try { adminDeviceFlag = localStorage.getItem("hama_admin_device") === "1"; } catch(e) {}

      if (adminDeviceFlag) {
        // 직원 자동로그인 안 함 — 혹시 남은 세션도 정리
        clearSession();
      } else {
        // 저장된 직원 세션 자동 복원 (로그인 유지) — 알림은 보내지 않음
        try {
          const sess = loadSession();
          if (sess) {
            const staffList = (d || DEFAULT_DATA).staff || [];
            if (staffList.some(s => s.id === sess.staffId)) {
              setSvSid(sess.staffId);
              setSvDate(todayStr());
              setSvSel(null);
            } else {
              clearSession(); // 삭제된 직원 등 — 세션 무효화
            }
          }
        } catch (e) {}
      }

      // URL ?admin=PIN 으로 관리자 직접 진입
      let enteredAdminByUrl = false;
      try {
        const params = new URLSearchParams(window.location.search);
        const adminPin = params.get("admin");
        if (adminPin && adminPin === p) {
          setMode("admin");
          enteredAdminByUrl = true;
          // URL에서 PIN 제거 (보안 - 화면에 안 보이게)
          window.history.replaceState({}, "", window.location.pathname);
        }
      } catch(e) {}

      // 관리자 전용 기기면 곧장 관리자 PIN 화면 (URL로 이미 진입했으면 생략)
      if (adminDeviceFlag && !enteredAdminByUrl) {
        setModal({ type: "pin" });
      }

      // 알림 토큰 자동 갱신 (앱 열 때마다) — iOS 웹 토큰이 바뀌어 알림이 끊기던 문제 방지.
      // 이 기기에서 켠 적 있는 구독만 최신 토큰으로 조용히 재등록. 켠 적 없으면 아무 것도 안 함.
      try {
        refreshPush(GAS_URL, "admin", "관리자");
        const sess = loadSession();
        if (sess && sess.staffId != null) {
          const st = ((d || DEFAULT_DATA).staff || []).find(s => s.id === sess.staffId);
          refreshPush(GAS_URL, sess.staffId, st ? st.name : "");
        }
      } catch (e) {}
    })();
  }, []);

  // 다른 사용자가 변경한 데이터를 주기적으로 가져옴 (실시간 동기화)
  // 단, 사용자가 입력 중이거나 모달이 열려있을 때는 폴링 정지
  useEffect(() => {
    const interval = setInterval(async () => {
      // 1. 저장 중 또는 방금 저장한 경우 (30초 이내)
      if (GS.SAVING || (Date.now() - GS.LAST_SAVE_AT < 30000)) return;
      // 미전송 변경 재전송은 화면과 무관하니 모달·입력 중이어도 시도 (성공 전엔 아래에서 서버 덮어쓰기 차단)
      if (GS.PENDING) {
        const ok = await flushPending();
        setStorageMode(GS.STORAGE_MODE);
        setLastError(GS.LAST_ERROR);
        if (!ok) return;
      }
      // 2. 모달이 열려있을 때
      if (modal !== null) return;
      // 3. input/textarea/select/button에 포커스 있을 때
      const active = document.activeElement;
      if (active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.tagName === "BUTTON"
      )) return;
      // 4. 페이지가 백그라운드일 때
      if (document.hidden) return;
      // 5. 사용자가 최근 30초 이내에 무언가 했으면 정지 (입력/클릭/스크롤)
      if (Date.now() - GS.LAST_USER_INTERACTION < 30000) return;

      try {
        const d = await loadData();
        if (d) {
          const newJson = JSON.stringify(d);
          if (newJson !== GS.LAST_SYNCED_JSON) {
            GS.LAST_SYNCED_JSON = newJson;
            setData(d);
          }
        }
        setStorageMode(GS.STORAGE_MODE);
        setLastError(GS.LAST_ERROR);
      } catch(e) {}
    }, 60000); // 60초마다 체크 (그러나 위 조건들 때문에 실제 가져오는 건 더 드물게)
    return () => clearInterval(interval);
  }, [modal]);

  // 사용자 상호작용 추적 (마우스/키보드/스크롤/터치 모두)
  useEffect(() => {
    const update = () => { GS.LAST_USER_INTERACTION = Date.now(); };
    window.addEventListener("click", update);
    window.addEventListener("touchstart", update);
    window.addEventListener("mousemove", update);
    window.addEventListener("keydown", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("input", update, true);
    return () => {
      window.removeEventListener("click", update);
      window.removeEventListener("touchstart", update);
      window.removeEventListener("mousemove", update);
      window.removeEventListener("keydown", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("input", update, true);
    };
  }, []);

  // 수동 새로고침 (다른 사람이 입력한 거 빨리 보고 싶을 때)
  const manualRefresh = useCallback(async () => {
    try {
      // 미전송 변경 먼저 올리고, 실패하면 서버본으로 덮어쓰지 않음
      if (GS.PENDING) {
        const ok = await flushPending();
        setStorageMode(GS.STORAGE_MODE);
        setLastError(GS.LAST_ERROR);
        if (!ok) {
          setToast("아직 안 올라간 변경이 있어요 — 인터넷 연결을 확인해주세요");
          setTimeout(() => setToast(""), 3000);
          return;
        }
      }
      const d = await loadData();
      if (d) {
        GS.LAST_SYNCED_JSON = JSON.stringify(d);
        setData(d);
        setStorageMode(GS.STORAGE_MODE);
      }
      setToast("🔄 동기화 완료");
      setTimeout(() => setToast(""), 2000);
    } catch(e) {
      setToast("⚠️ 동기화 실패");
      setTimeout(() => setToast(""), 2000);
    }
  }, []);

  const persist = useCallback(async (nd) => {
    setData(nd);
    GS.LAST_SYNCED_JSON = JSON.stringify(nd); // 자기가 저장한 건 동기화 비교 기준에 반영
    const ok = await saveData(nd);
    if (!ok) {
      // 저장 실패 → 기기에 보관됨 + 자동 재전송 예정 (유실 아님)
      setToast("연결이 불안정해요 — 입력 내용은 기기에 보관했고, 연결되면 자동으로 올라가요");
      setTimeout(() => setToast(""), 5000);
    }
    setStorageMode(GS.STORAGE_MODE);
    setLastError(GS.LAST_ERROR);
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  if (!data) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#ffffff",color:"#4dabf7",fontFamily:"monospace",fontSize:18}}>
        💙 로딩중…
      </div>
    );
  }

  const gSt = (id) => (data.staff||[]).find(s => s.id == id);
  const isVac = (ds) => (data.vacations||[]).some(v => ds >= v.start && ds <= v.end);
  const vacName = (ds) => {
    const v = (data.vacations||[]).find(v => ds >= v.start && ds <= v.end);
    return v ? v.name : "";
  };

  const doPinInput = (d) => {
    if (pinBuf.length >= 4) return;
    const nb = pinBuf + d;
    setPinBuf(nb);
    if (nb.length === 4) {
      setTimeout(() => {
        if (nb === pin) {
          setMode("admin");
          setPinBuf("");
          setPinErr("");
          setModal(null);
        } else {
          setPinErr("PIN 오류");
          setPinBuf("");
        }
      }, 120);
    }
  };






  const tabs = [
    ["schedule", "📅 스케줄"],
    ["fixed", "🔁 고정"],
    ["staff", "👤 직원"],
    ["salary", "💰 급여"],
    ["sales", "📊 매출"],
    ["recon", "🔍 대사"],
    ["stats", "📈 통계"]
  ];

  return (
    <>
      <style>{css}</style>
      {kioskLocked ? (
        <ErrorBoundary label="출퇴근 기기"><Screen render={() => (
          <KioskView data={data} persist={persist} setModal={setModal} toast={showToast} onExit={()=>setModal({type:"kioskGate", intent:"unlock"})} />
        )} /></ErrorBoundary>
      ) : mode === "staff" ? <ErrorBoundary label="직원 화면"><StaffView adminDevice={adminDevice} data={data} gSt={gSt} isVac={isVac} lastError={lastError} manualRefresh={manualRefresh} persist={persist} setModal={setModal} setSvCalM={setSvCalM} setSvCalY={setSvCalY} setSvDate={setSvDate} setSvSel={setSvSel} setSvSid={setSvSid} showToast={showToast} storageMode={storageMode} svCalM={svCalM} svCalY={svCalY} svDate={svDate} svSel={svSel} svSid={svSid} vacName={vacName} /></ErrorBoundary> : (
        <div>
          <div className="tb">
            <div className="logo">💙 HAMAFILM<small>관리자</small></div>
            <div className="nav">
              {tabs.map(([t, lbl]) => (
                <button key={t} className={"nt" + (adminTab === t ? " on" : "")} onClick={()=>setAdminTab(t)}>{lbl}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
              <span
                onClick={manualRefresh}
                title="클릭하면 즉시 동기화"
                style={{
                  fontSize:10,
                  padding:"3px 7px",
                  borderRadius:10,
                  background: storageMode==="shared" ? "rgba(46,213,115,.15)" : storageMode==="local" ? "rgba(255,71,87,.15)" : "rgba(255,255,255,.08)",
                  color: storageMode==="shared" ? "#2ed573" : storageMode==="local" ? "#ff4757" : "#aaa",
                  fontWeight:600,
                  cursor:"pointer"
                }}>
                {storageMode==="shared" ? "🟢" : storageMode==="local" ? "🔴" : "⚪"}
              </span>
              <button className="btn bs sm" onClick={manualRefresh} title="새로고침">🔄</button>
              <button className="btn bs sm" onClick={()=>setMode("staff")}>🔒</button>
            </div>
          </div>
          <div className="pg">
            {adminTab === "schedule" ? <ErrorBoundary label="스케줄"><ScheduleTab calM={calM} calY={calY} data={data} gSt={gSt} isVac={isVac} persist={persist} setCalM={setCalM} setCalY={setCalY} setModal={setModal} showToast={showToast} /></ErrorBoundary> : null}
            {adminTab === "fixed" ? <ErrorBoundary label="고정"><FixedTab data={data} gSt={gSt} persist={persist} setModal={setModal} /></ErrorBoundary> : null}
            {adminTab === "staff" ? <ErrorBoundary label="직원"><StaffMgmtTab adminDevice={adminDevice} data={data} disableAdminDevice={disableAdminDevice} enableAdminDevice={enableAdminDevice} persist={persist} pin={pin} setModal={setModal} setPin={setPin} showToast={showToast} /></ErrorBoundary> : null}
            {adminTab === "salary" ? <ErrorBoundary label="급여"><SalaryTab data={data} persist={persist} setModal={setModal} gSt={gSt} toast={showToast} /></ErrorBoundary> : null}
            {adminTab === "sales" ? <ErrorBoundary label="매출"><SalesTab data={data} persist={persist} setModal={setModal} /></ErrorBoundary> : null}
            {adminTab === "recon" ? <ErrorBoundary label="대사"><ReconTab data={data} persist={persist} /></ErrorBoundary> : null}
            {adminTab === "stats" ? <ErrorBoundary label="통계"><StatsTab data={data} setModal={setModal} persist={persist} /></ErrorBoundary> : null}
          </div>
        </div>
      )}
      <ErrorBoundary key={modal ? `modal-${modal.type}` : "modal-none"} label="팝업" onRetry={closeModal}><ModalHost closeModal={closeModal} data={data} doPinInput={doPinInput} gSt={gSt} isVac={isVac} lockKiosk={lockKiosk} modal={modal} persist={persist} pinBuf={pinBuf} pinErr={pinErr} setModal={setModal} setPinBuf={setPinBuf} setPinErr={setPinErr} setSvDate={setSvDate} setSvSel={setSvSel} setSvSid={setSvSid} showToast={showToast} unlockKiosk={unlockKiosk} vacName={vacName} /></ErrorBoundary>
      {toast ? (
        <div style={{position:"fixed",bottom:18,right:18,background:"#1a1a1a",color:"#fff",borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:500,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>{toast}</div>
      ) : null}
    </>
  );
}
