const path = require('path');
const fs = require('fs');
const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

/**
 * Siri reads App Shortcut phrases from `AppShortcuts.strings`, not from
 * `Localizable.strings` (which app.json `locales` already writes). This adds
 * `<lang>.lproj/AppShortcuts.strings` to the app target from
 * `plugins/app-shortcuts/<lang>.json`: keys are the English phrases in
 * `app-intents/AppShortcuts.swift` with `${applicationName}` / `${param}`
 * placeholders, values the translated phrases.
 */
module.exports = function withAppShortcutsStrings(config) {
  return withXcodeProject(config, async (config) => {
    const { projectRoot } = config.modRequest;
    const dir = path.join(projectRoot, 'plugins/app-shortcuts');
    const localesMap = {};
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      localesMap[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    config.modResults = await IOSConfig.Locales.writeStringsFile({
      localesMap,
      supportingDirectory: path.join(projectRoot, 'ios', projectName, 'Supporting'),
      fileName: 'AppShortcuts.strings',
      projectName,
      project: config.modResults,
    });
    return config;
  });
};
