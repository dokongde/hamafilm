export const css = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Noto Sans KR', sans-serif; background: #ffffff; color: #1a1a1a; min-height: 100vh; }
.tb { display: flex; align-items: center; justify-content: space-between; padding: 0 14px; height: 50px; background: #ffffff; border-bottom: 1px solid #e0e0e0; position: sticky; top: 0; z-index: 50; }
.logo { font-family: 'Noto Sans KR', sans-serif; font-size: 15px; font-weight: 700; color: #4dabf7; letter-spacing: 1px; }
.logo small { color: #888; font-size: 10px; font-family: 'Noto Sans KR', sans-serif; margin-left: 5px; font-weight: 400; letter-spacing: 0; }
.nav { display: flex; gap: 2px; overflow-x: auto; }
.nt { padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 500; color: #666; border: none; background: transparent; white-space: nowrap; }
.nt.on { color: #4dabf7; background: rgba(77,171,247,.12); }
.pg { padding: 14px; max-width: 900px; margin: 0 auto; }
.card { background: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
.ct { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.chip { background: #f5f5f7; border-radius: 8px; padding: 12px; }
.chip .lb { font-size: 10px; color: #888; margin-bottom: 4px; }
.chip .vl { font-family: 'Space Mono', monospace; font-size: 16px; font-weight: 700; color: #1a1a1a; }
.chip .sb { font-size: 10px; color: #888; margin-top: 2px; }
input, select { background: #ffffff; border: 1px solid #d0d0d0; border-radius: 7px; color: #1a1a1a; font-family: 'Noto Sans KR', sans-serif; font-size: 13px; padding: 7px 10px; width: 100%; outline: none; }
input:focus, select:focus { border-color: #4dabf7; box-shadow: 0 0 0 2px rgba(77,171,247,.15); }
input::placeholder { color: #b0b0b0; }
label { font-size: 11px; color: #666; display: block; margin-bottom: 3px; }
.fr { display: grid; gap: 8px; margin-bottom: 8px; }
.fc2 { grid-template-columns: 1fr 1fr; }
.btn { padding: 7px 12px; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; font-family: 'Noto Sans KR', sans-serif; }
.bp { background: #4dabf7; color: #fff; }
.bp:hover { background: #339af0; }
.bs { background: #f5f5f7; color: #1a1a1a; border: 1px solid #d0d0d0; }
.bs:hover { background: #e8e8ed; }
.bd { background: rgba(255,71,87,.1); color: #e63946; border: 1px solid rgba(255,71,87,.3); }
.bg2 { background: rgba(46,213,115,.12); color: #20a060; border: 1px solid rgba(46,213,115,.3); }
.sm { padding: 3px 7px; font-size: 11px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.tbl th { padding: 7px 9px; text-align: left; color: #888; font-weight: 500; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #e0e0e0; }
.tbl td { padding: 7px 9px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
.tbl tr:last-child td { border-bottom: none; }
.tbl tr:hover td { background: #fafafa; }
.badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.bgrn { background: rgba(46,213,115,.18); color: #20a060; }
.bylw { background: rgba(245,197,24,.2); color: #b8860b; }
.bred { background: rgba(255,71,87,.15); color: #e63946; }
.bblu { background: rgba(77,171,247,.18); color: #1971c2; }
.bgry { background: rgba(0,0,0,.06); color: #666; }
.bprp { background: rgba(165,94,234,.18); color: #7950f2; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
.mn { font-family: 'Space Mono', monospace; }
.pos { color: #20a060; font-family: 'Space Mono', monospace; font-weight: 600; }
.cg { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cdow { text-align: center; font-size: 10px; color: #888; padding: 4px 0; font-weight: 600; }
.cday { min-height: 60px; background: #f5f5f7; border-radius: 6px; padding: 4px; cursor: pointer; border: 1px solid transparent; overflow: hidden; display: flex; flex-direction: column; }
.cday:hover { background: #ebebef; }
.cday.today { border-color: #4dabf7; box-shadow: 0 0 0 1px #4dabf7; }
.cday.understaffed { background: rgba(255, 212, 0, 0.25); border: 1.5px solid #ffd400; box-shadow: 0 0 8px rgba(255, 212, 0, 0.4); }
.cday.hol { background: #ffe8e8; }
.cday.vac { background: #e6f7e9; }
.cday.other { opacity: .35; }
.dn { font-size: 10px; font-weight: 600; margin-bottom: 1px; color: #666; }
.sp { font-size: 8px; font-weight: 600; padding: 1px 3px; border-radius: 2px; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; }
.spgrp { display: flex; flex-direction: column; gap: 1px; }
.spgrp-bottom { margin-top: auto; }
.sp-open { border-left: 2px solid #f5c518; }
.sp-close { border-left: 2px solid #2ed573; }
.ov { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 12px; backdrop-filter: blur(2px); }
.modal { background: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
.modal h3 { font-size: 15px; font-weight: 700; margin-bottom: 14px; color: #1a1a1a; }
.mf { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.slb { display: block; width: 100%; padding: 10px 12px; border-radius: 8px; border: 2px solid #e0e0e0; background: #ffffff; color: #1a1a1a; font-family: 'Noto Sans KR', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; text-align: left; margin-bottom: 6px; }
.slb:hover { border-color: #b0b0b0; }
.slb.sel { border-color: #4dabf7; background: rgba(77,171,247,.08); color: #1971c2; }
.slb.taken { opacity: .55; cursor: default; border-color: #2ed573; background: rgba(46,213,115,.06); }
.slb.fxd { border-color: rgba(165,94,234,.5); }
.sln { font-weight: 700; margin-bottom: 1px; }
.slt { font-size: 11px; color: #888; font-family: 'Space Mono', monospace; }
.spc { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sc { padding: 12px 8px; border-radius: 9px; border: 2px solid #e0e0e0; background: #ffffff; cursor: pointer; text-align: center; }
.sc:hover { border-color: #4dabf7; }
.sav { width: 38px; height: 38px; border-radius: 50%; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; }
.snm { font-size: 12px; font-weight: 700; color: #1a1a1a; }
.dp { display: flex; gap: 5px; flex-wrap: wrap; margin: 6px 0; }
.dpl { padding: 4px 9px; border-radius: 16px; border: 1px solid #d0d0d0; background: #ffffff; cursor: pointer; font-size: 11px; font-weight: 600; color: #666; }
.dpl.on { border-color: #4dabf7; background: rgba(77,171,247,.1); color: #1971c2; }
.fxr { background: #f5f5f7; border-radius: 7px; padding: 9px 11px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }
.pb { background: #ffffff; border: 1px solid #e0e0e0; border-radius: 14px; padding: 26px 20px; width: 100%; max-width: 280px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
.pds { display: flex; gap: 9px; justify-content: center; margin-bottom: 16px; }
.pde { width: 13px; height: 13px; border-radius: 50%; border: 2px solid #d0d0d0; background: transparent; }
.pde.f { background: #4dabf7; border-color: #4dabf7; }
.ppd { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
.pb2 { padding: 13px; border-radius: 9px; background: #f5f5f7; border: 1px solid #d0d0d0; color: #1a1a1a; font-size: 18px; font-weight: 700; cursor: pointer; font-family: 'Space Mono', monospace; }
.pb2:hover { background: #e8e8ed; }
.notice { border-radius: 7px; padding: 9px 12px; font-size: 12px; margin-bottom: 10px; }
.n-red { background: rgba(255,71,87,.1); border: 1px solid rgba(255,71,87,.3); color: #e63946; }
.n-grn { background: rgba(46,213,115,.1); border: 1px solid rgba(46,213,115,.3); color: #20a060; }
.n-blu { background: rgba(77,171,247,.1); border: 1px solid rgba(77,171,247,.3); color: #1971c2; }
@media (max-width: 480px) { .g4 { grid-template-columns: 1fr 1fr; } .g3 { grid-template-columns: 1fr; } }
`;
