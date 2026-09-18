import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        proxy: {
          '/docs': {
            changeOrigin: true,
            target: 'http://localhost:3000',
          },
          // 后端上传接口返回 /uploads/... 相对路径，开发环境预览时转发到静态文件服务。
          '/uploads': {
            changeOrigin: true,
            target: 'http://localhost:3000',
          },
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, '/api/v1'),
            // mock代理目标地址
            target: 'http://localhost:3000',
            ws: true,
          },
        },
      },
    },
  };
});
