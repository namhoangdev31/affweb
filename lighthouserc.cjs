module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm start",
      startServerReadyPattern: "Ready",
      url: [
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/partners",
        "http://127.0.0.1:3000/faq"
      ],
      numberOfRuns: 2,
      settings: {
        chromeFlags: "--no-sandbox --headless"
      }
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }]
      }
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci/reports" }
  }
};
