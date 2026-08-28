import { ShieldCheck } from './Icons.jsx';

const NAV = [
  { href: '#prepare', label: 'Prepare' },
  { href: '#registry', label: 'Live state' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#evidence', label: 'Evidence' },
  { href: '#statuses', label: 'Statuses' },
];

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="shell topbar__inner">
        <a className="brand" href="/">
          <ShieldCheck className="brand__mark" />
          LatePay Shield
        </a>

        <nav className="topbar__nav" aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </nav>

        {/* Environment context must be visible without scrolling on every screen. */}
        <p className="env-label">
          <span className="env-label__dot" aria-hidden="true" />
          XRPL Testnet · Prototype
        </p>
      </div>
    </header>
  );
}
