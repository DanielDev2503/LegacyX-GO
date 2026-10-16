import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Elemento #app no encontrado en el DOM');
}

const app = mount(App, { target });

export default app;
