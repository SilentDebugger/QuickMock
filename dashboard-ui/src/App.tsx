import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import ServerDetail from './pages/ServerDetail';
import ImportWizard from './pages/ImportWizard';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="servers/:id" element={<ServerDetail />} />
        <Route path="import" element={<ImportWizard />} />
      </Route>
    </Routes>
  );
}
