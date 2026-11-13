// Standalone version of the config `percli plugin generate` used to write (it imported ../jest.shared
// from the perses/plugins monorepo, which does not exist outside it). Plain CommonJS so Jest needs no
// ts-node.
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
        },
      },
    ],
  },
  moduleNameMapper: {
    "^use-resize-observer$": "use-resize-observer/polyfilled",
  },
  setupFilesAfterEnv: ["<rootDir>/src/setup-tests.ts"],
  testTimeout: 15000,
};
