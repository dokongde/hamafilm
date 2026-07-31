import { fmtE } from "../lib/utils";
import { PinChange } from "../components/modals/staff";
import { KioskCodeSetting } from "../components/kiosk";
import { AdminPushCard } from "../components/push-cards";

  // ─── 직원 관리 ───
function StaffMgmtTab({ adminDevice, data, disableAdminDevice, enableAdminDevice, persist, pin, setModal, setPin, showToast }) {
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700}}>직원 관리</div>
        <button className="btn bp sm" onClick={()=>setModal({type:"addStaff"})}>+ 추가</button>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>이름</th><th>연락처</th><th>시급</th><th>색상</th><th></th></tr></thead>
          <tbody>
            {(data.staff||[]).map(st => (
              <tr key={st.id}>
                <td><strong>{st.name}</strong></td>
                <td style={{color:"#888"}}>{st.phone || "—"}</td>
                <td className="mn">€{fmtE(st.wage)}/h</td>
                <td><span style={{display:"inline-block",width:16,height:16,borderRadius:"50%",background:st.color}} /></td>
                <td>
                  <button className="btn bs sm" onClick={()=>setModal({type:"addStaff", edit:st})}>수정</button>
                  <button className="btn bd sm" style={{marginLeft:3}} onClick={async()=>{
                    if (!confirm("삭제?")) return;
                    await persist({
                      ...data,
                      staff: (data.staff||[]).filter(s=>s.id!==st.id),
                      fixed: (data.fixed||[]).filter(f=>f.staffId!==st.id)
                    });
                  }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{marginTop:12,border:"1px solid rgba(77,171,247,.3)"}}>
        <div className="ct" style={{color:"#1971c2"}}>📋 체크리스트 & 매뉴얼</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <button
            className="btn bs"
            onClick={()=>setModal({type:"checklistManage"})}
            style={{padding:"12px",textAlign:"left",lineHeight:1.4}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>📋 체크리스트 편집</div>
            <div style={{fontSize:10,color:"#666"}}>
              {(data.checklists||[]).length}개 · 항목 {(data.checklists||[]).reduce((t,c)=>t+c.items.length,0)}개
            </div>
          </button>
          <button
            className="btn bs"
            onClick={()=>setModal({type:"manualSettings"})}
            style={{padding:"12px",textAlign:"left",lineHeight:1.4}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>📘 매뉴얼 링크</div>
            <div style={{fontSize:10,color:"#666"}}>
              {data.settings?.manualUrl ? "✓ 설정됨" : "미설정"}
            </div>
          </button>
        </div>
        <div style={{fontSize:10,color:"#888",padding:"6px 8px",background:"#f5f5f7",borderRadius:5}}>
          💡 매뉴얼은 Google Docs 등 외부 링크로 연결 (사진/영상 등 풍부한 자료)
        </div>
      </div>

      <AdminPushCard toast={showToast} />

      <div className="card" style={{marginTop:12,border:"1px solid rgba(245,197,24,.2)"}}>
        <div className="ct" style={{color:"#f5c518"}}>🔐 관리자 PIN 변경</div>
        <PinChange pin={pin} setPin={setPin} />
      </div>

      <div className="card" style={{marginTop:12,border:"1px solid rgba(77,171,247,.25)"}}>
        <div className="ct" style={{color:"#1971c2"}}>🏪 매장 기기(출퇴근 kiosk) 코드</div>
        <KioskCodeSetting data={data} persist={persist} toast={showToast} />
      </div>

      <div className="card" style={{marginTop:12,border:"1px solid rgba(121,80,242,.3)"}}>
        <div className="ct" style={{color:"#7950f2"}}>📱 관리자 전용 기기 고정</div>
        <div style={{fontSize:11,color:"#888",marginBottom:8,lineHeight:1.5}}>
          켜면 <strong>이 기기</strong>는 앱을 열 때마다 직원 자동로그인을 무시하고 <strong>항상 관리자 PIN 화면</strong>으로 뜹니다. (사장님 폰용 — 기기별 설정, 다른 기기엔 영향 없음)
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {adminDevice ? (
            <>
              <span style={{fontSize:12,fontWeight:700,color:"#7950f2"}}>✓ 이 기기 = 관리자 전용</span>
              <button className="btn bs sm" onClick={disableAdminDevice}>해제</button>
            </>
          ) : (
            <button className="btn bp sm" onClick={enableAdminDevice}>이 기기를 관리자 전용으로 고정</button>
          )}
        </div>
      </div>
    </div>
  );
}

export { StaffMgmtTab };
