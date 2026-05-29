import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import Dashboard from './pages/Dashboard.jsx';
import GrantDetail from './pages/GrantDetail.jsx';
import Sources from './pages/Sources.jsx';
import Eligibility from './pages/Eligibility.jsx';
import About from './pages/About.jsx';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<Dashboard />} />
        <Route path="grants/:id" element={<GrantDetail />} />
        <Route path="sources" element={<Sources />} />
        <Route path="eligibility" element={<Eligibility />} />
        <Route path="about" element={<About />} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
