import { mergeConfig } from 'vite';
import viteConfig from './vite.config.ts';

export default mergeConfig(viteConfig, {
  test: {
    include: ['tests-e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 15000
  }
});
