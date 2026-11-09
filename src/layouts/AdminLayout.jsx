import { RouteLink, useRouter } from "../router/HashRouter.jsx";
import Icon from "../components/Icon.jsx";

// Admin shell theo prototype (core.js NS.ui.shell/topbar/sidebar):
// top rail 56px + sidebar 244px (icon 16px mỗi mục, chân sidebar có
// phiên bản + vai trò · tên người dùng) + vùng nội dung.
export default function AdminLayout({
  menu = [],
  branchName = null,
  headerRight = null,
  userName = null,
  userRole = null,
  children,
}) {
  const { path } = useRouter();
  // Item active là item có path khớp dài nhất (tránh hai item cùng active
  // khi một path là tiền tố của path khác, ví dụ /_showcase và /_showcase/session).
  const allPaths = menu.flatMap((s) => s.items.map((i) => i.path));
  const bestMatch = allPaths
    .filter((p) => path === p || path.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="admin-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand-mark">SC</span>
          <span>SCMS</span>
          {branchName ? <span className="topbar__branch">{branchName}</span> : null}
        </div>
        <div className="d-flex align-items-center gap-3">{headerRight}</div>
      </header>

      <div className="admin-body">
        <nav className="sidebar" aria-label="Điều hướng chính">
          <div className="sidebar__nav">
            {menu.map((section) => (
              <div key={section.group} className="sidebar__section">
                <div className="sidebar__group">{section.group}</div>
                {section.items.map((item) => {
                  const active = item.path === bestMatch;
                  return (
                    <RouteLink
                      key={item.key}
                      to={item.path}
                      className={`sidebar__item${active ? " active" : ""}`}
                    >
                      {item.icon ? (
                        <span className="sidebar__icon">
                          <Icon name={item.icon} size={16} />
                        </span>
                      ) : null}
                      <span className="sidebar__label">{item.label}</span>
                      {item.badge ? <span className="sidebar__badge">{item.badge}</span> : null}
                    </RouteLink>
                  );
                })}
              </div>
            ))}
          </div>
          {userName ? (
            <div className="sidebar__foot">
              <div>
                <strong>SCMS v1.0</strong>
              </div>
              <div className="mt-1">
                {userRole ? `${userRole} · ` : ""}
                {userName}
              </div>
            </div>
          ) : null}
        </nav>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
