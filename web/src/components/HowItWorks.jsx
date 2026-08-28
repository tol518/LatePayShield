const STEPS = [
  {
    title: 'Enter the invoice',
    body: 'Paste or upload the invoice. Extracted values arrive marked as suggested and stay editable until you confirm them.',
  },
  {
    title: 'Confirm the criteria',
    body: 'You set the minimum qualifying amount, the deadline, the XRPL destination and tag, and when the evidence window starts.',
  },
  {
    title: 'Share payment instructions',
    body: 'Your customer gets one screen with the exact destination, amount, and destination tag, each with a copy control.',
  },
  {
    title: 'Check the evidence',
    body: 'The agreement shows a field-by-field result: what the evidence matched, and what it does not establish.',
  },
];

export default function HowItWorks() {
  return (
    <section className="section" id="how-it-works">
      <div className="shell">
        <div className="section__head">
          <h2>How it works</h2>
          <p>Four steps, and a person confirms every value that matters before anything is recorded.</p>
        </div>

        <ol className="steps">
          {STEPS.map((step, index) => (
            <li className="step" key={step.title}>
              <span className="step__num" aria-hidden="true">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
