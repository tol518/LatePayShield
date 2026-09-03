import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Document,
  InfoCircle,
  Person,
  ShieldCheck,
} from './Icons.jsx';

/* '#main' rather than '#assistant': the AI extraction panel it would otherwise
   point at only renders when the local assistant is switched on, and this link
   has to work with it off too. */
const NAV = [
  { href: '#main', label: 'Invoice protection', icon: Document },
  { href: '#prepare', label: 'Agreements', icon: CheckCircle },
  { href: '#registry', label: 'Payments', icon: Clock },
  { href: '#cases', label: 'Case files', icon: Document },
  { href: '#evidence', label: 'Evidence', icon: ShieldCheck },
  { href: '#how-it-works', label: 'How it works', icon: InfoCircle },
  { href: '#statuses', label: 'Statuses', icon: Person },
];

export default function Sidebar() {
  const [activeSection, setActiveSection] = useState('main');

  useEffect(() => {
    const sections = NAV
      .map(({ href }) => document.querySelector(href))
      .filter(Boolean);

    function updateActiveSection() {
      // '#main' wraps every other tracked section, so near the very top of the
      // page its heading can sit only a few pixels above the next section's,
      // both inside the activation band below. Landing at the top always means
      // "Invoice protection" is current, regardless of what happens to be
      // hiding just under the fold.
      if (window.scrollY < 10) {
        setActiveSection('main');
        return;
      }

      const activationLine = window.innerHeight * 0.4;
      const current = [...sections]
        .sort((first, second) => {
          const firstTop = first.getBoundingClientRect().top + window.scrollY;
          const secondTop = second.getBoundingClientRect().top + window.scrollY;
          return firstTop - secondTop;
        })
        .filter((section) => section.getBoundingClientRect().top <= activationLine)
        .at(-1) ?? sections[0];
      if (current) setActiveSection(current.id);
    }

    let animationFrame = null;
    function queueActiveSectionUpdate() {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateActiveSection();
      });
    }

    updateActiveSection();
    window.addEventListener('scroll', queueActiveSectionUpdate, { passive: true });
    window.addEventListener('resize', queueActiveSectionUpdate);
    window.addEventListener('hashchange', queueActiveSectionUpdate);

    return () => {
      window.removeEventListener('scroll', queueActiveSectionUpdate);
      window.removeEventListener('resize', queueActiveSectionUpdate);
      window.removeEventListener('hashchange', queueActiveSectionUpdate);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <a className="brand sidebar__brand" href="#main">
        <img alt="LatePay Shield" className="brand__logo" src="/LPTXT.png" />
      </a>

      <nav className="sidebar__nav" aria-label="Primary">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = activeSection === href.slice(1);
          return (
          <a
            aria-current={isActive ? 'location' : undefined}
            className={isActive ? 'is-active' : ''}
            href={href}
            key={href}
            onClick={() => setActiveSection(href.slice(1))}
          >
            <Icon />
            <span>{label}</span>
          </a>
          );
        })}
      </nav>

      <div className="sidebar__foot">
        <div className="workspace-account">
          <span className="workspace-account__avatar" aria-hidden="true">
            <img alt="" src="/LPLogo.png" />
          </span>
          <span>
            <strong>LatePay workspace</strong>
            <small>Local prototype</small>
          </span>
        </div>
        <p className="sidebar__testnet">
          <span><InfoCircle /> XRPL Testnet · Prototype</span>
          <small>Test environment, no real funds</small>
        </p>
      </div>
    </aside>
  );
}
