// Auth shell theo prototype (views-auth.js + app.css .auth):
// trái là panel mực với hero lớn và vòng tròn trang trí,
// phải là form căn giữa, tối đa 400px.
export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand__top">
          <span className="brand-mark brand-mark--light">SC</span>
          <span>SCMS · Smart Cafe</span>
        </div>
        <div className="auth-hero">
          <h1>
            Một sổ vận hành
            <br />
            cho cả chuỗi cà phê.
          </h1>
          <p>Bán hàng, ca quỹ, kho, nhân sự và báo cáo chuỗi trong cùng một nhịp vận hành.</p>
        </div>
        <div className="auth-foot">SCMS · Smart Cafe Management System · Phiên bản 1.0</div>
      </aside>
      <main className="auth-main">
        <div className="auth-box">{children}</div>
      </main>
    </div>
  );
}
