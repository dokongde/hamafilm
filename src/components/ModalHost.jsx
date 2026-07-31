import { hessenHols, dowKo, todayStr, fmtE, shiftHours, timeDiff, needsAttention } from "../lib/utils";
import { saveSession, notifyLoginEvent } from "../data/gas";
import { EditShiftModal, AddShiftModal, AddFixedModal, AddVacModal, GenFixedModal } from "../components/modals/shift";
import { AddStaffModal } from "../components/modals/staff";
import { AddSalesModal, CashInModal, CashOutModal } from "../components/modals/sales";
import { AddPayrollModal, EditPaymentModal, ExpenseModal, HistoricalModal } from "../components/modals/payroll";
import { ChecklistRunModal, ChecklistManageModal } from "../components/modals/checklist";
import { ManualSettingsModal, CsvImportModal } from "../components/modals/settings";
import { KioskGateModal } from "../components/kiosk";

  // ─── 모달 ───
function ModalHost({ closeModal, data, doPinInput, gSt, isVac, lockKiosk, modal, persist, pinBuf, pinErr, setModal, setPinBuf, setPinErr, setSvDate, setSvSel, setSvSid, showToast, unlockKiosk, vacName }) {
    if (!modal) return null;

    if (modal.type === "pin") {
      return (
        <div className="ov" onClick={e => {
          if (e.target === e.currentTarget) {
            closeModal();
            setPinBuf("");
            setPinErr("");
          }
        }}>
          <div className="pb">
            <div style={{fontFamily:"'Noto Sans KR', sans-serif",fontSize:17,fontWeight:700,color:"#4dabf7",marginBottom:4,letterSpacing:1}}>💙 HAMAFILM</div>
            <div style={{fontSize:12,color:"#888",marginBottom:18}}>관리자 PIN</div>
            <div className="pds">
              {[0,1,2,3].map(i => (
                <div key={i} className={"pde" + (i < pinBuf.length ? " f" : "")} />
              ))}
            </div>
            {pinErr ? <div style={{color:"#ff4757",fontSize:12,marginBottom:8}}>{pinErr}</div> : null}
            <div className="ppd">
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} className="pb2" onClick={()=>doPinInput(String(d))}>{d}</button>
              ))}
              <button className="pb2" onClick={()=>doPinInput("0")} style={{gridColumn:2}}>0</button>
              <button className="pb2" style={{fontSize:14,color:"#888"}} onClick={()=>setPinBuf(b => b.slice(0, -1))}>⌫</button>
            </div>
            <button style={{background:"none",border:"none",color:"#888",fontSize:12,cursor:"pointer"}} onClick={()=>{closeModal(); setPinBuf(""); setPinErr("");}}>취소</button>
          </div>
        </div>
      );
    }

    if (modal.type === "staffPin") {
      const targetStaff = (data.staff||[]).find(s => s.id === modal.staffId);
      const doStaffPinInput = (d) => {
        if (pinBuf.length >= 4) return;
        const newBuf = pinBuf + d;
        setPinBuf(newBuf);
        setPinErr("");
        if (newBuf.length === 4) {
          if (targetStaff && newBuf === targetStaff.pin) {
            // 성공
            setSvSid(targetStaff.id);
            setSvDate(todayStr());
            setSvSel(null);
            closeModal();
            setPinBuf("");
            saveSession(targetStaff.id); // 로그인 유지
            notifyLoginEvent(targetStaff.id, targetStaff.name, "in");
          } else {
            setPinErr("PIN이 틀렸습니다");
            setTimeout(() => setPinBuf(""), 600);
          }
        }
      };
      return (
        <div className="ov" onClick={e => {
          if (e.target === e.currentTarget) {
            closeModal();
            setPinBuf("");
            setPinErr("");
          }
        }}>
          <div className="pb">
            <div className="sav" style={{background:targetStaff?.color || "#4dabf7", margin:"0 auto 8px"}}>
              {targetStaff?.name?.slice(0,1) || "?"}
            </div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{targetStaff?.name} 님</div>
            <div style={{fontSize:12,color:"#888",marginBottom:18}}>PIN을 입력하세요</div>
            <div className="pds">
              {[0,1,2,3].map(i => (
                <div key={i} className={"pde" + (i < pinBuf.length ? " f" : "")} />
              ))}
            </div>
            {pinErr ? <div style={{color:"#e63946",fontSize:12,marginBottom:8}}>{pinErr}</div> : null}
            <div className="ppd">
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} className="pb2" onClick={()=>doStaffPinInput(String(d))}>{d}</button>
              ))}
              <button className="pb2" onClick={()=>doStaffPinInput("0")} style={{gridColumn:2}}>0</button>
              <button className="pb2" style={{fontSize:14,color:"#888"}} onClick={()=>setPinBuf(b => b.slice(0, -1))}>⌫</button>
            </div>
            <button style={{background:"none",border:"none",color:"#888",fontSize:12,cursor:"pointer"}} onClick={()=>{closeModal(); setPinBuf(""); setPinErr("");}}>취소</button>
          </div>
        </div>
      );
    }

    if (modal.type === "dayDetail") {
      const ds = modal.date;
      const hols = hessenHols(new Date(ds).getFullYear());
      const shifts = (data.shifts||[]).filter(s => s.date === ds);
      return (
        <div className="ov" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal">
            <h3>📅 {ds} ({dowKo(ds)})</h3>
            {hols[ds] ? <span className="badge bred" style={{marginBottom:8,display:"inline-block"}}>🎌 {hols[ds]}</span> : null}
            {isVac(ds) ? <span className="badge bgrn" style={{marginBottom:8,display:"inline-block",marginLeft:4}}>🏖 {vacName(ds)}</span> : null}
            {shifts.length === 0 ? (
              <p style={{color:"#888",fontSize:13}}>스케줄 없음</p>
            ) : (
              shifts.map(sh => {
                const st = gSt(sh.staffId);
                const h = shiftHours(sh);
                const tCls = sh.slotType === "오프닝" ? "bylw" : "bgrn";
                const hasActual = sh.actualStart || sh.actualEnd;
                const diff = timeDiff(sh);
                const flagged = needsAttention(sh);
                return (
                  <div key={sh.id} style={{
                    background: flagged ? "rgba(165, 94, 234, 0.1)" : "#f5f5f7",
                    border: flagged ? "1.5px solid #a55eea" : "1px solid transparent",
                    borderRadius:8,
                    padding:10,
                    marginBottom:7,
                    display:"flex",
                    justifyContent:"space-between",
                    alignItems:"center",
                    gap:8
                  }}>
                    <div style={{flex:1,minWidth:0}}>
                      <span className="dot" style={{background:st?.color||"#666"}} />
                      <strong>{st?.name||"?"}</strong>
                      <span className={"badge " + tCls} style={{marginLeft:5}}>{sh.slotType}</span>
                      {flagged ? <span style={{marginLeft:5,fontSize:10,color:"#7950f2",fontWeight:700}}>⏰ 확인필요</span> : null}
                      <div style={{fontSize:11,color:"#888",marginTop:2}}>
                        예정 {sh.start}~{sh.end} · {h}h · €{fmtE(h * (st?.wage || 0))}
                      </div>
                      {hasActual ? (
                        <div style={{fontSize:11,color: flagged ? "#7950f2" : "#666",marginTop:2,fontWeight: flagged ? 600 : 400}}>
                          ⏱️ 실제 {sh.actualStart || "?"}~{sh.actualEnd || "..."}
                          {diff !== null ? (
                            <span style={{marginLeft:6, color: diff > 0 ? "#20a060" : "#e63946", fontWeight:700}}>
                              ({diff > 0 ? "+" : ""}{Math.floor(Math.abs(diff)/60) > 0 ? Math.floor(Math.abs(diff)/60)+"h" : ""}{Math.abs(diff)%60 > 0 ? Math.abs(diff)%60+"분" : ""})
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {sh.memo ? <div style={{fontSize:10,color:"#888",marginTop:2,fontStyle:"italic"}}>📝 {sh.memo}</div> : null}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      <button className="btn bs sm" onClick={()=>setModal({type:"editShift", shift: sh})}>수정</button>
                      <button className="btn bd sm" onClick={async()=>{
                        if(!confirm("삭제?")) return;
                        await persist({...data, shifts: (data.shifts||[]).filter(s => s.id !== sh.id)});
                        closeModal();
                        showToast("삭제");
                      }}>삭제</button>
                    </div>
                  </div>
                );
              })
            )}
            <div className="mf">
              <button className="btn bs" onClick={closeModal}>닫기</button>
              <button className="btn bp" onClick={()=>setModal({type:"addShift", date:ds})}>+ 추가</button>
            </div>
          </div>
        </div>
      );
    }

    if (modal.type === "addShift") return <AddShiftModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} isVac={isVac} vacName={vacName} />;
    if (modal.type === "addFixed") return <AddFixedModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "addVac") return <AddVacModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "addStaff") return <AddStaffModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "addSales") return <AddSalesModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "cashIn") return <CashInModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "cashOut") return <CashOutModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "kioskGate") return <KioskGateModal modal={modal} data={data} close={closeModal} onSuccess={modal.intent === "lock" ? lockKiosk : unlockKiosk} toast={showToast} />;
    if (modal.type === "genFixed") return <GenFixedModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} isVac={isVac} />;
    if (modal.type === "addPayroll") return <AddPayrollModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} />;
    if (modal.type === "editPayment") return <EditPaymentModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} />;
    if (modal.type === "expense") return <ExpenseModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "csvImport") return <CsvImportModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "editShift") return <EditShiftModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} />;
    if (modal.type === "checklistRun") return <ChecklistRunModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} gSt={gSt} />;
    if (modal.type === "checklistManage") return <ChecklistManageModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "manualSettings") return <ManualSettingsModal data={data} persist={persist} close={closeModal} toast={showToast} />;
    if (modal.type === "historical") return <HistoricalModal modal={modal} data={data} persist={persist} close={closeModal} toast={showToast} />;

    return null;
}

export { ModalHost };
