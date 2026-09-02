import { InfoCircle } from './Icons.jsx';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="brand mobile-brand" href="#main">
          <img alt="LatePay Shield" className="brand__logo" src="/LPTXT.png" />
        </a>
        <p className="env-label">
          <InfoCircle />
          XRPL Testnet · Prototype
        </p>
        <span className="topbar__divider" aria-hidden="true" />
        <div className="topbar__identity" aria-label="Current workspace">
          <span className="topbar__avatar" aria-hidden="true">
            <img alt="" src="/LPLogo.png" />
          </span>
          <span><strong>LatePay workspace</strong><small>Local prototype</small></span>
        </div>
      </div>
    </header>
  );
}
