import { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Hero from './components/Hero.jsx';
import AiInvoiceExtraction from './components/AiInvoiceExtraction.jsx';
import AgreementCreator from './components/AgreementCreator.jsx';
import LiveRegistry from './components/LiveRegistry.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import EvidenceBoundaries from './components/EvidenceBoundaries.jsx';
import StatusLegend from './components/StatusLegend.jsx';
import PrototypeNotice from './components/PrototypeNotice.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  const [registryRefreshKey, setRegistryRefreshKey] = useState(0);
  // Suggestions live here rather than in the assistant so the agreement form
  // stays the single owner of confirmed terms.
  const [suggestions, setSuggestions] = useState(null);

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>

      <div className="app-shell">
        <Sidebar />
        <div className="app-shell__body">
          <TopBar />

          <main className="workspace" id="main">
            <Hero />
            <AiInvoiceExtraction onSuggest={setSuggestions} />
            <LiveRegistry refreshKey={registryRefreshKey} />
            <AgreementCreator
              suggestions={suggestions}
              onCreated={() => setRegistryRefreshKey((key) => key + 1)}
            />

            <div className="workspace__supporting">
              <HowItWorks />
              <EvidenceBoundaries />
              <StatusLegend />
              <PrototypeNotice />
            </div>
          </main>

          <Footer />
        </div>
      </div>
    </>
  );
}
