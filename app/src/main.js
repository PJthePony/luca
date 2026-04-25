import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import { bootstrapSSO } from './lib/sso.js';
import 'tanzillo-ds';
import './styles/app.css';

const app = createApp(App);
app.use(router);

bootstrapSSO().then(() => app.mount('#app'));
