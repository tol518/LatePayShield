/* Line icons at a shared 24px viewBox. Size comes from CSS, colour from currentColor.
   Every icon is decorative: status meaning is always carried by adjacent text. */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  'aria-hidden': 'true',
  focusable: 'false',
};

export function ShieldCheck(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.7 4.5 5.2v6.1c0 4.9 3 8.4 7.5 9.9 4.5-1.5 7.5-5 7.5-9.9V5.2L12 2.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
      <path d="m8.75 11.9 2.3 2.3 4.2-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

/* A leaf of a ledger, ruled like the record it stands for. */
export function Document(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5h7l5 5v12H6v-17Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="miter" />
      <path d="M13 3.5v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="miter" />
      <path d="M8.3 13.4h7.4M8.3 16.4h7.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" />
    </svg>
  );
}

/* An hourglass, not a clock face: it reads as "time running out", never as a
   generic dashboard timestamp. */
export function Clock(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 3.6h11M6.5 20.4h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      <path d="M7.5 3.6v3c0 2.3 1.6 4 4.5 5.4 2.9 1.4 4.5 3.1 4.5 5.4v3M16.5 3.6v3c0 2.3-1.6 4-4.5 5.4-2.9 1.4-4.5 3.1-4.5 5.4v3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
    </svg>
  );
}

/* A dial with tick marks rather than a smooth spinner arc; the calling
   component adds .is-spinning to turn it, the adjacent text still carries
   the actual status. */
export function Progress(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.3" opacity="0.35" />
      <path d="M12 3.8a8.2 8.2 0 0 1 7.1 4.1" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      <path d="M12 3.8v2.6M20.2 12h-2.6M12 20.2v-2.6M3.8 12h2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" opacity="0.35" />
    </svg>
  );
}

/* The medallion: two concentric rings stand for a record that has been
   checked and sealed, not merely ticked off a list. Reused only where an
   outcome is contract-final, so it carries that meaning consistently. */
export function CheckCircle(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="12" r="6.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="m8.9 12.2 2.1 2.1 4-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function Check(props) {
  return (
    <svg {...base} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function InfoCircle(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      <rect x="11.25" y="15.4" width="1.5" height="1.5" fill="currentColor" />
    </svg>
  );
}

export function Person(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.6" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" />
    </svg>
  );
}

export function Warning(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.2 3.2 19.4h17.6L12 4.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="miter" />
      <path d="M12 10v3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" />
      <rect x="11.25" y="15.9" width="1.5" height="1.5" fill="currentColor" />
    </svg>
  );
}
