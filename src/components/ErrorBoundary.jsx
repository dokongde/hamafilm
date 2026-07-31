import { Component } from "react";

// ═══ 에러 바운더리 ═══
// 화면(탭) 하나에서 렌더 에러가 나도 앱 전체가 흰 화면이 되지 않게 막는다.
// 각 탭/화면을 개별로 감싸므로, 한 탭이 죽어도 다른 탭은 계속 동작한다.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errMsg: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errMsg: String(error && error.message ? error.message : error) };
  }
  componentDidCatch(error, info) {
    // 나중에 디버깅용: 에러 + 컴포넌트 스택을 콘솔에 남긴다
    console.error(`[ErrorBoundary:${this.props.label || "화면"}]`, error, info && info.componentStack);
  }
  retry = () => {
    if (this.props.onRetry) { try { this.props.onRetry(); } catch (e) {} }
    this.setState({ hasError: false, errMsg: "" });
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ textAlign: "center", padding: "28px 14px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>⚠️ 이 화면에 문제가 생겼어요</div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
            {this.props.label ? `"${this.props.label}" 화면만 잠시 멈췄어요. 다른 탭은 정상 동작해요.` : "이 화면만 잠시 멈췄어요. 다른 탭은 정상 동작해요."}
          </div>
          <button className="btn bp" onClick={this.retry}>다시 시도</button>
          <div style={{ fontSize: 10, color: "#b0b0b0", marginTop: 12, fontFamily: "'Space Mono', monospace", wordBreak: "break-all" }}>
            {this.state.errMsg}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
// renderCal 같은 인라인 render 함수를 "컴포넌트의 렌더 단계"에서 실행시키는 래퍼.
// 이렇게 해야 함수 안에서 throw가 나도 부모(App) 렌더가 아니라
// ErrorBoundary 안쪽에서 터져서 바운더리가 잡을 수 있다.
function Screen({ render }) { return render(); }

export { ErrorBoundary, Screen };
