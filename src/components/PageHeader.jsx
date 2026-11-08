// Tiêu đề màn hình theo prototype (NS.ui.pageHead): mã màn hình nằm
// TRÊN tiêu đề (chữ nhỏ, phần tên in đậm màu accent-dark), H1 25px,
// mô tả 13px màu muted, hành động ở góc phải.
export default function PageHeader({ title, screenCode = null, description = null, actions = null }) {
  let codeMain = null;
  let codeBold = null;
  if (screenCode) {
    const parts = String(screenCode).split(" · ");
    codeMain = parts[0];
    codeBold = parts.slice(1).join(" · ") || null;
  }
  return (
    <div className="page-head">
      <div className="page-head__main">
        {screenCode ? (
          <div className="page-code">
            <span>{codeMain}</span>
            {codeBold ? <b>{codeBold}</b> : null}
          </div>
        ) : null}
        <h1>{title}</h1>
        {description ? <p className="page-sub">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
