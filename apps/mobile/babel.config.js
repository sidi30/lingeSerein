module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-worklets/plugin remplace l'ancien plugin reanimated (Reanimated 4).
    // Doit rester en DERNIER dans la liste des plugins.
    plugins: ["react-native-worklets/plugin"],
  };
};
