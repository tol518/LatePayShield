import StatusChip from './StatusChip.jsx';
import { STATUSES, STATUS_ORDER } from '../lib/statuses.js';

export default function StatusLegend() {
  return (
    <section className="section" id="statuses">
      <div className="shell">
        <div className="section__head">
          <h2>Every state says exactly what it means</h2>
          <p>
            A pending check never looks like a confirmed one. Success styling appears only after the
            contract has accepted evidence.
          </p>
        </div>

        <ul className="legend">
          {STATUS_ORDER.map((key) => (
            <li className="legend__row" key={key}>
              <span className="legend__chip"><StatusChip status={key} /></span>
              <p>{STATUSES[key].meaning}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
