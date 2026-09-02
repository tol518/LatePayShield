import { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Hero from './components/Hero.jsx';
import AiInvoiceExtraction from './components/AiInvoiceExtraction.jsx';
import AgreementCreator from './components/AgreementCreator.jsx';
import LiveRegistry from './components/LiveRegistry.jsx';
import CasePack from './components/CasePack.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import EvidenceBoundaries from './components/EvidenceBoundaries.jsx';
import StatusLegend from './components/StatusLegend.jsx';
import PrototypeNotice from './components/PrototypeNotice.jsx';
import Footer from './components/Footer.jsx';
import { useRegistry } from './hooks/useRegistry.js';

export default function App() {
  const [registryRefreshKey, setRegistryRefreshKey] = useState(0);
  // Suggestions live here rather than in the assistant so the agreement form
  // stays the single owner of confirmed terms.
  const [suggestions, setSuggestions] = useState(null);
  const [registeredCaseDraft, setRegisteredCaseDraft] = useState(null);
  const registryState = useRegistry(registryRefreshKey);

  function agreementCreated(created) {
    setRegistryRefreshKey((key) => key + 1);
    setRegisteredCaseDraft(created.caseDraft);
  }

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
            <LiveRegistry state={registryState} />
            <AgreementCreator
              suggestions={suggestions}
              onCreated={agreementCreated}
            />
            <CasePack registryState={registryState} registeredDraft={registeredCaseDraft} />

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
