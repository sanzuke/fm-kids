import { createRoot } from 'react-dom/client';
import { loadTuning } from './game/tuning';
void loadTuning();
import { App } from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
