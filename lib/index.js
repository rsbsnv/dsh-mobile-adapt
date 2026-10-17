/**
 * dsh-mobile-adapt — 手机端适配层（Host 半）
 *
 * 这个插件的能力全部在浏览器里：改的是 CSS 与触摸行为，不碰引擎状态。
 * Host 半存在的唯一理由，是让 Loader 有一行可以挂载的插件条目，从而
 * 让 @deepseek-ai/dsh-client-modules 在扫描 `dsh.client` 时把
 * lib/client.js 收进浏览器模块图（window.__DSH_BOOT__）。
 *
 * 因此这里不注册服务、不注册工具、不加 web 路由，方便随时整行删除。
 */

export const name = 'mobile-adapt'

/** 无 Host 侧依赖：纯前端适配层。 */
export function apply() {
  // 故意留空。真正的逻辑在 lib/client.js。
}
