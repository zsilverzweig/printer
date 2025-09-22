/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Performance optimizations
  experimental: {
    optimizePackageImports: [
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tooltip",
      "lucide-react",
    ],
  },
  // Reduce bundle size
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: "all",
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
          },
        },
      };
    }

    // Add performance logging
    // if (dev) {
    //   config.plugins.push({
    //     apply: (compiler) => {
    //       compiler.hooks.compile.tap("PerformancePlugin", () => {
    //         console.log(
    //           "[PERF] Webpack compilation starting at:",
    //           new Date().toISOString()
    //         );
    //       });

    //       // compiler.hooks.done.tap("PerformancePlugin", (stats) => {
    //       //   console.log(
    //       //     "[PERF] Webpack compilation completed at:",
    //       //     new Date().toISOString()
    //       //   );
    //       //   console.log(
    //       //     "[PERF] Compilation time:",
    //       //     stats.endTime - stats.startTime,
    //       //     "ms"
    //       //   );
    //       // });
    //     },
    //   });
    // }

    return config;
  },
};

module.exports = nextConfig;

// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "silver-branch-labs",
  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: process.env.NODE_ENV === "production",

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
