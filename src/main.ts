import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/caveat/500.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './ui/styles.css';

import { renderForm } from './input/form';
import { renderFeed } from './archive/feed';
import { renderDay } from './archive/day-view';
import { renderSettings } from './ui/settings';

const app = document.getElementById('app')!;

async function route() {
  const h = location.hash || '#/archive';
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach(a => a.classList.toggle('on', h.startsWith('#/' + a.dataset.nav)));
  app.innerHTML = '';
  window.scrollTo(0, 0);
  if (h.startsWith('#/new')) renderForm(app);
  else if (h.startsWith('#/settings')) renderSettings(app);
  else if (h.startsWith('#/day/')) await renderDay(app, decodeURIComponent(h.slice(6)));
  else await renderFeed(app);
}

window.addEventListener('hashchange', route);
route();
