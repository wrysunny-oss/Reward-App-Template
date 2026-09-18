import productConfig from '../../product.generated.json';

export type ProductModuleKey = keyof typeof productConfig.modules;
export type ProductModules = Record<ProductModuleKey, boolean>;

/** 模板级模块清单由 product.config.json 生成；运行时能力以服务端 bootstrap 返回值为准。 */
export const productModules: ProductModules = Object.freeze({...productConfig.modules});
