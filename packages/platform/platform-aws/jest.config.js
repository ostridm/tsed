// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
  ...require("@tsed/jest-config")(__dirname, "platform-aws"),
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 25,
      functions: 100,
      lines: 100
    }
  }
};
