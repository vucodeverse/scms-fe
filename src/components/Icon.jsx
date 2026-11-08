// Bộ icon của prototype (scms-prototype/prototype/assets/js/core.js,
// NS.ui.icon): SVG 24x24, stroke currentColor 1.5, không fill.
// Giữ nguyên path để giao diện FE khớp prototype.
const PATHS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  pos: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  orders: '<path d="M6 3h12l2 4v14H4V7z"/><path d="M8 11h8M8 15h8"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  inventory: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2"/><path d="M16 15c2.5 0 4.5 1.5 4.5 4"/>',
  report: '<path d="M4 20V4h16v16z"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  approve: '<path d="M4 12l5 5L20 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1"/>',
  branch: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/><path d="M4 9h16"/>',
  sync: '<path d="M20 7h-6V1"/><path d="M4 17h6v6"/><path d="M20 7a8 8 0 00-14-2L4 7M4 17a8 8 0 0014 2l2-2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  audit: '<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M3 6h16a2 2 0 012 2v10H3z"/><path d="M3 6V4h14"/><circle cx="17" cy="12" r="1"/>',
  box: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7"/>',
  bell: '<path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
};

export default function Icon({ name, size = 16 }) {
  const path = PATHS[name] || PATHS.arrowRight;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}
