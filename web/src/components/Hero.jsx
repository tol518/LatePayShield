export default function Hero() {
  return (
    <section className="workspace-header" aria-labelledby="workspace-title">
      <div className="workspace-header__title">
        <p className="eyebrow">Payment agreements with an evidence layer</p>
        <h1 id="workspace-title">Invoice protection</h1>
      </div>
      <ol className="journey-progress" aria-label="Agreement progress">
        <li className="is-current"><span>1</span>Invoice</li>
        <li><span>2</span>Confirm terms</li>
        <li><span>3</span>Agreement</li>
        <li><span>4</span>Evidence</li>
      </ol>
      <p className="workspace-header__lede">
        Upload an invoice, review the extracted terms, confirm the agreement, and track payment.
      </p>
    </section>
  );
}
