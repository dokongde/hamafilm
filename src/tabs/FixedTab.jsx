import { curYM } from "../lib/utils";

  // ─── 고정 ───
function FixedTab({ data, gSt, persist, setModal }) {
    const DN = ["", "월", "화", "수", "목", "금", "토"];
    const byStaff = {};
    (data.fixed||[]).forEach(f => {
      if (!byStaff[f.staffId]) byStaff[f.staffId] = [];
      byStaff[f.staffId].push(f);
    });
    return (
      <div>
        <div className="card">
          <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>방학 기간</span>
            <button className="btn bs sm" onClick={()=>setModal({type:"addVac"})}>+ 방학 추가</button>
          </div>
          {(data.vacations||[]).length === 0 ? (
            <p style={{color:"#888",fontSize:12}}>없음</p>
          ) : (
            (data.vacations||[]).sort((a, b) => a.start.localeCompare(b.start)).map(v => (
              <div key={v.id} className="fxr">
                <div>
                  <span className="badge bgrn" style={{marginRight:7}}>{v.name}</span>
                  <span style={{fontSize:12,color:"#888"}}>{v.start} ~ {v.end}</span>
                </div>
                <button className="btn bd sm" onClick={async()=>await persist({...data, vacations:(data.vacations||[]).filter(x=>x.id!==v.id)})}>삭제</button>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <div className="ct" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>직원별 고정 스케줄</span>
            <button className="btn bp sm" onClick={()=>setModal({type:"addFixed"})}>+ 고정 추가</button>
          </div>
          {Object.keys(byStaff).length === 0 ? (
            <p style={{color:"#888",fontSize:12}}>없음</p>
          ) : (
            Object.entries(byStaff).map(([sid, fxs]) => {
              const st = gSt(parseInt(sid));
              return (
                <div key={sid} style={{marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:5}}>
                    <span className="dot" style={{background:st?.color||"#666"}} />{st?.name||"?"}
                  </div>
                  {fxs.map(f => (
                    <div key={f.id} className="fxr">
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                        <span className={"badge " + (f.type === "오프닝" ? "bylw" : "bgrn")}>{f.type}</span>
                        {[...f.dows].sort().map(d => (
                          <span key={d} className="badge bblu">{DN[d]}요일</span>
                        ))}
                      </div>
                      <button className="btn bd sm" onClick={async()=>await persist({...data, fixed:(data.fixed||[]).filter(x=>x.id!==f.id)})}>삭제</button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
        <div className="card" style={{border:"1px solid rgba(245,197,24,.3)"}}>
          <div className="ct" style={{color:"#f5c518"}}>⚡ 자동 생성</div>
          <div style={{fontSize:12,color:"#888",marginBottom:10}}>방학·공휴일·일요일 제외</div>
          <button className="btn bp" style={{width:"100%"}} onClick={()=>setModal({type:"genFixed", ym:curYM()})}>⚡ 이번달 생성</button>
        </div>
      </div>
    );
}

export { FixedTab };
