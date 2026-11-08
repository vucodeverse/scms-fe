import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import Icon from "../components/Icon.jsx";
import SessionHeaderRight from "../components/SessionHeader.jsx";

// Task shell theo prototype (core.js NS.ui.task): top rail đầy đủ +
// task-head (nút quay lại dạng icon, mã màn hình trên tiêu đề H1 21px,
// mô tả, meta ở góc phải) + thân căn giữa tối đa 1320px.
// Hành động lưu/huỷ của form nằm trong panel qua .form-actions như
// prototype; `footer` chỉ dùng khi màn hình cần thanh cố định riêng.
export default function TaskLayout({
  title,
  subtitle = null,
  screenCode = null,
  codeLabel = null,
  backTo = null,
  meta = null,
  footer = null,
  actions = null,
  children,
}) {
  const { user } = useAuth();
  const { navigate } = useRouter();

  return (
    <div className="task-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand-mark">SC</span>
          <span>SCMS</span>
          {user?.branchName ? <span className="topbar__branch">{user.branchName}</span> : null}
        </div>
        <div className="d-flex align-items-center gap-3">
          <SessionHeaderRight />
        </div>
      </header>

      <div className="task-head">
        {backTo ? (
          <button
            type="button"
            className="task-head__back"
            aria-label="Quay lại"
            onClick={() => navigate(backTo)}
          >
            <Icon name="back" size={16} />
          </button>
        ) : null}
        <div className="task-head__main">
          {screenCode ? (
            <div className="page-code">
              <span>{screenCode}</span>
              {codeLabel ? <b>{codeLabel}</b> : null}
            </div>
          ) : null}
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {meta ? <div className="task-head__meta">{meta}</div> : null}
      </div>

      <main className="task-body">{children}</main>
      {footer}
      {!footer && actions ? <footer className="task-actions">{actions}</footer> : null}
    </div>
  );
}
