import React, { useState, useEffect } from 'react';
import LegacyApp from './LegacyApp';
import Login from './Login';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold text-slate-300 text-sm">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={() => setUser(auth.currentUser)} />;
  }

  return (
    <LegacyApp user={user} />
  );
}

export default App;
