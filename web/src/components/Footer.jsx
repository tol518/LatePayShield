const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#evidence', label: 'Evidence' },
  { href: '#statuses', label: 'Statuses' },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer__inner">
        <p>LatePay Shield · Testnet prototype · Not a production payment service</p>
        <nav className="footer__links" aria-label="Footer">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
