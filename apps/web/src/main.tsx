import { render } from 'preact';
import { App } from './ui/App.tsx';
import './ui/styles.css';
import './ui/debrief.css';
import './ui/game.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
