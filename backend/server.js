import 'dotenv/config';
import { createApp } from './src/app.js';
import { getConfig } from './src/config.js';

const config = getConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`MailMind API prête sur http://localhost:${config.port}`);
  if (!config.oauthReady) {
    console.warn(`OAuth non configuré. Variables manquantes : ${config.missing.join(', ')}`);
  }
});

