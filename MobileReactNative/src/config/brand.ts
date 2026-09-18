import appManifest from '../../app.json';

/** app.json 由仓库根目录 product.config.json 同步生成，运行时不直接读取仓库外文件。 */
export const brandConfig = Object.freeze({
  name: appManifest.displayName,
  aboutTitle: `关于${appManifest.displayName}`,
});
