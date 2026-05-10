import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
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

  if (showLanding) return <LandingPage onEnter={handleEnter} />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
