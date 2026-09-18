const path = require('node:path');

const productConfigPath = process.env.REWARD_APP_PRODUCT_CONFIG
  ? path.resolve(process.env.REWARD_APP_PRODUCT_CONFIG)
  : path.resolve(__dirname, 'product.generated.json');
const productConfig = require(productConfigPath);

const groMoreEnabled = productConfig.modules.advertising
  && productConfig.advertising.provider === 'gromore';

module.exports = {
  dependencies: groMoreEnabled ? {} : {
    'react-native-playnest-unionad': {
      platforms: {android: null, ios: null},
    },
  },
};
