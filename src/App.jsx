import React, { useState } from 'react';
import LegacyApp from './LegacyApp';
import Login from './Login';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <LegacyApp />
  );
}

export default App;
