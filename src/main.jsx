import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './styles.css';
import App from './App';
import LandingPage from './LandingPage';

function Root() {
  const [showLanding, setShowLanding] = useState(
    () => !sessionStorage.getItem('sl-entered')
  );

  const handleEnter = () => {
    sessionStorage.setItem('sl-entered', '1');
    setShowLanding(false);
  };

  return (
    <>
      {showLanding ? <LandingPage onEnter={handleEnter} /> : <App />}
      <Analytics />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
