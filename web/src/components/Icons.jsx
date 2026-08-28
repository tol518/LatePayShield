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
      <path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.6 7.5 10 4.3-1.4 7.5-5 7.5-10v-6L12 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m8.75 11.9 2.3 2.3 4.2-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Document(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5h7l5 5v12H6v-17Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13 3.5v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function Clock(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* Static arc, not a spinner: verification state must not depend on animation. */
export function Progress(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.2 6.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CheckCircle(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8.2 12.3 2.6 2.6 5-5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check(props) {
  return (
    <svg {...base} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoCircle(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="1" fill="currentColor" />
    </svg>
  );
}

export function Person(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.6" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function Warning(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.2 3.2 19.4h17.6L12 4.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 10v3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="1" fill="currentColor" />
    </svg>
  );
}
