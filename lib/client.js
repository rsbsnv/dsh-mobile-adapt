/**
 * dsh-mobile-adapt — 手机端交互与字号适配层（Client 半）
 *
 * ## 为什么需要它
 * DSH Web 的前端是纯桌面布局：CSS 里一条 `@media` 断点都没有，正文字号
 * 13–14px，图标按钮 24–32px，没有软键盘避让。DSH Mobile 这个 App 已经用
 * `dsh-android-narrow-sidebar / -settings / -rightbar` 三个插件修掉了「窄屏下
 * 列宽被压扁」的硬伤，但触摸手感、字号、键盘、滚动这些仍然没人管。
 *
 * 本插件只补这块空白，与上面三个插件**共存**：
 *   · 侧栏：把它们的「展开 = 整页替换」升级成手机惯用的「抽屉」——默认完全
 *     移出屏幕，顶栏菜单按钮滑出，遮罩点击收起（需要覆盖它们的两条让位规则，
 *     下面用 `!important` 精确抵消，不删它们的属性）。
 *   · 设置面板、右侧栏：完全不碰，继续交给 `narrow-settings` / `narrow-rightbar`。
 *
 * ## 不改什么
 * 不改 React 状态、不改用户持久化设置、不在引擎侧注册任何东西。
 * 侧栏开合的唯一真相是 AppFrame 上的 `data-sidebar-collapsed`，本插件只读取它。
 *
 * ## 调试
 * App 的 MainActivity 只把带 `[dsh-android]` 前缀的 console 与 WARNING 以上
 * 转发到 `$PREFIX/engine.log`，所以本文件所有日志都带该前缀。
 */
window.__ModuleLoader__.load({
  id: "dsh-mobile-adapt",
  factory: () => {
    /** 手机布局断点。 */
    const PHONE_QUERY = "(max-width: 767px)";
    /** 正文字号下限：392px 宽的屏幕上低于 15px 读起来会累。 */
    const MIN_CONTENT_PX = 15;
    const STYLE_ID = "dsh-mobile-adapt-style";
    const SCRIM_ID = "dsh-mobile-adapt-scrim";
    /** 侧栏右上角的调宽按钮（占原来的「收起侧边栏」位）。 */
    const WIDTH_BTN_ID = "dsh-mobile-adapt-width";
    /** 点一下切一档：60% / 75% / 90% / 100%。 */
    const WIDTH_STEPS = [0.6, 0.75, 0.9, 1];
    /** 抽屉宽度持久化的 key（存相对屏宽的比例，转屏也不会失效）。 */
    const WIDTH_KEY = "dsh-mobile-adapt:drawer-ratio";
    /** 默认宽度比例：半屏看不全标题、全屏又看不到内容，0.75 是折中。 */
    const DEFAULT_RATIO = 0.75;
    const MIN_RATIO = 0.35;
    const MAX_RATIO = 1;
    /** App 的 console 转发白名单前缀。 */
    const LOG = "[dsh-android] mobile-adapt:";
    /**
     * 跨模块实例的接管点。HMR 会把本文件重新求值成**新模块实例**，旧实例的
     * 处置函数不会被调用；留着两套观察器会互相插按钮。所以新实例先显式
     * dispose 挂在全局上的上一个实例。
     */
    const GLOBAL_KEY = "__dshPhoneAdapt__";

    const css = `
/* ============ 触摸基线（所有视口） ============ */
html { -webkit-text-size-adjust: 100%; }
button, [role="button"], a, summary { -webkit-tap-highlight-color: transparent; }
html[data-pa-phone] { touch-action: manipulation; }

/* 手指按下就给反馈；鼠标设备不受影响 */
@media (pointer: coarse) {
  #root button:active,
  #root [role="button"]:active,
  #root [role="menuitem"]:active { filter: brightness(.94); }
}

/* ============ 手机布局 ============ */
@media (max-width: 767px) {
  html, body {
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: manipulation;
  }
  #root { height: 100%; overscroll-behavior: contain; }

  /* --- 字号：正文下限，用户设置仍可往上调 --- */
  body {
    --dsh-content-font-size: max(${MIN_CONTENT_PX}px, var(--dsh-pa-content-base, 14px)) !important;
  }
  /* 输入框 16px：避免 WebView 聚焦时自动缩放整页 */
  [data-composer-seat] [contenteditable="true"],
  [data-composer-seat] textarea,
  [data-composer-seat] input:not([type="file"]) { font-size: 16px; }

  /* --- 长内容：换行 + 自己滚，别撑破布局 --- */
  [data-conversation-scroll] p,
  [data-conversation-scroll] li,
  [data-conversation-scroll] td,
  [data-conversation-scroll] a { overflow-wrap: anywhere; }
  [data-conversation-scroll] pre {
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  [data-conversation-scroll] table {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* --- 主框架压成单列 --- */
  /* 必须无条件压：窄屏下宿主的三列布局会把会话列挤没。 */
  [data-pa-frame] {
    grid-template-columns: minmax(0, 1fr) 0 0 !important;
  }
  /* 右栏打开时把第三列让出来：否则单列 grid 会把右栏压进 0 宽列 */
  [data-pa-frame][data-pa-right-open] {
    grid-template-columns: 0 0 minmax(0, 1fr) !important;
  }
  /* --- 侧栏 = 覆盖式抽屉 --- */
  [data-pa-frame] > [class*="sidebarCol"] {
    position: fixed !important;
    top: 0;
    bottom: 0;
    left: 0;
    /* 宽度可调：--dsh-pa-dw 由右缘拖拽把手写入（默认 75vw） */
    width: var(--dsh-pa-dw, 75vw) !important;
    max-width: var(--dsh-pa-dw, 75vw) !important;
    z-index: 61;
    transform: translateX(-102%);
    transition: transform 260ms cubic-bezier(.4, 0, .2, 1);
    border-right: 0 !important;
    grid-column: auto !important;
    background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, #fff));
    /* 只动画 transform；大半径阴影在整屏高度上每帧重绘，是滑出卡顿的主因之一 */
    box-shadow: 0 1px 10px rgb(0 0 0 / 16%);
    will-change: transform;
    contain: paint;
    overflow: hidden !important;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  [data-pa-frame][data-pa-drawer] > [class*="sidebarCol"] { transform: none; }
  /* 侧栏根节点的宽度是 React 内联写死的（cols.sidebar，约 280px），
     直接子元素之外可能还包了一层 slot 容器，所以两个层级都按满宽覆盖，
     否则抽屉铺满屏、内容却只占左边一窄条，右侧全是空白。 */
  [data-pa-frame] > [class*="sidebarCol"] > *,
  [data-pa-frame] > [class*="sidebarCol"] [class*="_root"] {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
  }

  /* --- 抵消 dsh-android-narrow-sidebar 的「整页替换」 ---
     它给侧栏列加 grid-column:1/-1、给对话列加 display:none；
     抽屉模式下侧栏是浮层，对话列必须留在原位。 */
  [data-android-narrow-sidebar-col] { grid-column: auto !important; }
  [data-android-narrow-yield-col] {
    display: flex !important;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  /* --- 触控命中区 --- */
  [role="menuitem"] { min-height: 44px; font-size: 15px; }
  [role="menuitem"] > * { min-height: 44px; }

  /* 侧栏从图标栏展开成宽栏时自带 wide-in / rail-in 动画，会和抽屉的
     transform 动画叠在一起，首次打开时看着就是「抖一下」。抽屉自己有位移
     动画了，这里把内部的入场动画压掉。 */
  [data-pa-frame][data-pa-drawer] > [class*="sidebarCol"] * {
    animation: none !important;
  }

  /* 「插件 → 添加插件」对话框：它的内容容器是 flex-direction:row，窄屏下
     标题 / 说明 / 输入被压成三条竖排（实测输入框只剩 59px 宽）。改成纵向。 */
  /* ---------- 设置面板：桌面两列 → 手机全屏 + 顶部横向导航 ----------
     设置面板在桌面是 [nav 188px][content] 两列，392px 宽下导航列会把内容
     挤没。这里把它改成整屏纵向：nav 变顶部可横滚的 tab 条，内容占满剩余高度。
     用 :has(> nav) 限定，只命中「带导航的设置面板」，不误伤别的对话框。 */
  [aria-modal]:has(> nav) {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    border-radius: 0 !important;
    padding: 0 !important;
    flex-direction: column !important;
    align-items: stretch !important;
    overflow: hidden !important;
  }
  [aria-modal]:has(> nav) > nav {
    box-sizing: border-box;
    flex: none !important;
    display: flex !important;
    /* 横向排列 + 自动换行：一项挨着一项，一行放不下就折到下一行继续 */
    flex-direction: row !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 6px !important;
    width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 10px 10px 8px !important;
    border-right: 0 !important;
    border-bottom: 1px solid var(--dsw-alias-border-l1, rgb(0 0 0 / 10%)) !important;
  }
  /* 导航内部的标题与按钮都按内容宽度排，不参与拉伸 */
  [aria-modal]:has(> nav) > nav * { flex: none !important; }
  [aria-modal]:has(> nav) > nav [class*="navList"] {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 6px !important;
    width: 100% !important;
    min-width: 0 !important;
    overflow: visible !important;
  }
  [aria-modal]:has(> nav) > nav [class*="navList"] > * {
    width: auto !important;
    flex: 0 0 auto !important;
  }
  [aria-modal]:has(> nav) > :not(nav) {
    flex: 1 1 auto !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
  }
  /* ---------- 右侧面板：左侧抽屉的镜像 ----------
     DSH 在窄屏下会把它做成整屏，等于「跳转到另一个页面」，和左侧抽屉的
     交互不对称。这里改成从右滑入的抽屉：同宽（跟随 --dsh-pa-dw）、左侧
     留遮罩、点遮罩 / 返回键 / 右滑都能关。 */
  /* 长按会话行是为了展开按钮，不是选字：压掉系统长按菜单与文本识别浮层 */
  [data-pa-frame][data-pa-drawer] [class*='sessionRow'],
  [data-pa-frame][data-pa-drawer] [class*='projectRow'] {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  /* 长按展开的多级按钮：由 data-pa-actions 驱动，效果与桌面 hover 一致 */
  [data-pa-frame] [class*='sessionRow'][data-pa-actions] [class*='rowActions'],
  [data-pa-frame] [class*='projectRow'][data-pa-actions] [class*='rowActions'] {
    display: inline-flex !important;
    margin-left: auto;
  }
  [data-pa-frame] [class*='sessionRow'][data-pa-actions] [class*='time'],
  [data-pa-frame] [class*='sessionRow'][data-pa-actions] [class*='pinIndicator'] {
    display: none !important;
  }

  /* 触摸屏没有真正的 hover：第一次点会话行不该让行末「长」出操作按钮，
     否则点击位置会漂移，第二次点就变成弹出菜单（真机反馈的误触）。
     React 主动打开的菜单（.menuOpen / 长按）不受影响。 */
  [class*='sessionRow']:hover [class*='rowActions'],
  [class*='projectRow']:hover [class*='rowActions'],
  [class*='searchResultRow']:hover [class*='rowActions'] { display: none !important; }

  /* --- 输入区贴合安全区 --- */
  [data-composer-seat] { padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px)); }

  /* --- 软键盘：把可用高度让给输入区 --- */
  html[data-pa-ime] #root { height: calc(100% - var(--dsh-pa-im, 0px)) !important; }
}

/* ============ 抽屉遮罩 ============ */
/* 侧栏右上角：原「收起侧边栏」按钮在抽屉模式下由左滑/遮罩替代，
   位置让给宽度调节按钮（点一下切一档，比拖细条好按） */
[data-pa-frame][data-pa-drawer] > [class*="sidebarCol"] button[aria-label="收起侧边栏"],
[data-pa-frame][data-pa-drawer] > [class*="sidebarCol"] button[aria-label="Collapse sidebar"] {
  display: none !important;
}
/* 侧栏右上角的宽度按钮（点按切档 / 按住拖拽）*/
#${WIDTH_BTN_ID} {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
#${WIDTH_BTN_ID}:active { background: var(--dsw-alias-interactive-bg-hover, rgb(0 0 0 / 6%)); }
#${WIDTH_BTN_ID} svg { width: 18px; height: 18px; display: block; }

#${SCRIM_ID} {
  position: fixed;
  inset: 0;
  /* 60：必须高于输入区(7)、顶栏(46)等，否则底部/顶部盖不住；又低于左右抽屉(61) */
  z-index: 60;
  /* 抽屉/右栏打开时只压暗一点点，别把整个屏幕糊住 */
  background: rgb(0 0 0 / 26%);
  opacity: 0;
  pointer-events: none;
  /* 常驻合成层，只做 opacity 过渡：display:none↔block 每次都要重建渲染层，
     抽屉滑出时会明显掉帧 */
  transition: opacity 180ms cubic-bezier(.4, 0, .2, 1);
  will-change: opacity;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
}
html[data-pa-drawer] #${SCRIM_ID} { opacity: 1; pointer-events: auto; }
`;

    const phoneQuery = window.matchMedia(PHONE_QUERY);



    /**
     * 侧栏当前是否展开。AppFrame 收起时带 `data-sidebar-collapsed`。
     * @param frame - AppFrame 元素。
     */
    function drawerOpen(frame) {
      return !frame.hasAttribute("data-sidebar-collapsed");
    }

    /**
     * 定位 AppFrame：优先本插件标记，其次按「根节点首个子元素 / 内联三列网格」识别。
     * @returns AppFrame 元素，找不到为 null。
     */
    function findFrame() {
      const marked = document.querySelector("[data-pa-frame]");
      if (marked !== null) return marked;

      const root = document.getElementById("root");
      const first = root === null ? null : root.firstElementChild;
      if (first instanceof HTMLElement && first.style.gridTemplateColumns !== "") return first;

      const collapsed = document.querySelector("[data-sidebar-collapsed]");
      if (collapsed !== null && collapsed.parentElement instanceof HTMLElement
        && collapsed.parentElement.style.gridTemplateColumns !== "") {
        return collapsed.parentElement;
      }
      const column = document.querySelector("[class*='sidebarCol']");
      return column === null ? null : column.parentElement;
    }

    /** 侧栏列（抽屉本体）。 */
    function findSidebarCol(frame) {
      return frame === null ? null : frame.querySelector("[class*='sidebarCol']");
    }

    /** 抽屉上次的开合状态（模块级：热重载后重新初始化，不依赖 DOM 上的残留标记）。 */
    let drawerWasOpen = null;
    /** 抽屉本次打开的时刻；滑开手势收尾时派发的 click 靠它挡掉。 */
    let drawerOpenedAt = 0;

    /**
     * 把 React 的侧栏状态镜像成 CSS 开关（`[data-pa-drawer]`）。
     * @param frame - AppFrame 元素。
     * @returns 抽屉是否打开。
     */
    function syncDrawerState(frame) {
      const open = drawerOpen(frame);
      const html = document.documentElement;
      const changed = drawerWasOpen !== open;
      if (changed) {
        drawerWasOpen = open;
        drawerOpenedAt = open ? window.performance.now() : 0;
        console.log(`${LOG} 抽屉状态 → ${open ? "开" : "关"}`);
      }
      // 只在状态真的变化时写 DOM：这个函数每帧都会被 MutationObserver 叫到，
      // 无条件 setAttribute/removeAttribute 会制造大量属性变更事件。
      if (open) {
        if (!frame.hasAttribute("data-pa-drawer")) frame.setAttribute("data-pa-drawer", "");
        if (!html.hasAttribute("data-pa-drawer")) html.setAttribute("data-pa-drawer", "");
        pushBackReason("drawer");
      } else {
        if (frame.hasAttribute("data-pa-drawer")) frame.removeAttribute("data-pa-drawer");
        if (html.hasAttribute("data-pa-drawer")) html.removeAttribute("data-pa-drawer");
        removeBackReason("drawer");
        // ⚠ 只在这一刻收键盘：放到每帧执行会让输入框永远弹不出键盘
        if (changed) {
          for (const el of document.querySelectorAll("[data-pa-actions]")) el.removeAttribute("data-pa-actions");
          blurActive();
        }
      }
      return open;
    }

    /**
     * 返回键拦截。Android WebView 的系统返回键不会经过页面，直接交给 Activity；
     * 抽屉打开时按返回会退出 App，这在手机上是明显的体验缺陷。做法是抽屉打开
     * 时压入一条 history 记录，返回键消费它时 popstate 触发、由我们关抽屉。
     * DSH Web 没有 URL 路由（不监听 popstate），所以这条记录不会干扰它的导航。
     */
    /** 返回栈：谁需要「按返回键先关我」就往里压一条名字，关了再撤掉。 */
    const backReasons = [];
    let guardPushed = false;

    function pushGuardHistory() {
      if (guardPushed) return;
      guardPushed = true;
      try {
        window.history.pushState({ dshMobileAdapt: backReasons.length }, "", window.location.href);
      } catch {
        guardPushed = false;
      }
    }

    /**
     * 登记一个「返回键可退」的层（抽屉 / 对话框）。
     * 只在第一层时压 history，多出来的层共用一个记录，返回时逐层弹。
     */
    function pushBackReason(reason) {
      if (backReasons.includes(reason)) return;
      backReasons.push(reason);
      pushGuardHistory();
    }

    /** 某个层自己关掉了（用户点 ✕ / 点遮罩），撤掉登记并把 history 记录收回去。 */
    function removeBackReason(reason) {
      const index = backReasons.indexOf(reason);
      if (index < 0) return;
      backReasons.splice(index, 1);
      if (backReasons.length === 0 && guardPushed) {
        guardPushed = false;
        try {
          window.history.back();
        } catch {
          // 历史不可回退时忽略
        }
      }
    }
    /** 关闭最上层的模态对话框（优先点它自己的关闭按钮）。 */
    function closeTopModal() {
      const modal = document.querySelector("[aria-modal]");
      if (modal === null) return;
      const close = modal.querySelector('button[aria-label="关闭"], button[aria-label="Close"]')
        ?? modal.querySelector('[class*="_close"], [class*="close"]');
      if (close instanceof HTMLElement) {
        close.click();
        return;
      }
      // 没有可点的关闭按钮：派发 Esc，交给对话框自己的键盘处理
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }

    /** 收起软键盘：抽屉打开时若输入框仍聚焦，键盘会顶在抽屉下面。 */
    function blurActive() {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
    }

    /**
     * 切换抽屉：优先走布局服务，服务缺失时退回点侧栏自带的折叠按钮。
     * @param ctx - 客户端 ctx。
     * @param frame - AppFrame 元素。
     */
    function toggleDrawer(ctx, frame) {
      blurActive();
      console.log(`${LOG} 切换抽屉（当前 ${drawerOpen(frame) ? "开" : "关"}）`);
      try {
        ctx.layout.toggleSidebar();
        return;
      } catch (error) {
        console.log(`${LOG} layout.toggleSidebar 失败，退回 DOM 点击`, error);
      }
      const sidebar = findSidebarCol(frame);
      const fallback = sidebar === null ? null : sidebar.querySelector("button[aria-label]");
      if (fallback instanceof HTMLElement) fallback.click();
    }

    /**
     * 「插件 → 添加插件」对话框的内容容器是 flex-direction:row，窄屏下把
     * 标题 / 说明 / 输入挤成三条竖排（输入框实测只剩 59px 宽）。组件自己的
     * 规则优先级更高、CSS 覆盖不进去，所以用 inline + important 定死。
     *
     * 不能只在「弹窗出现」那一刻做：那时 React 还没渲染出内容，querySelector
     * 拿到 null。挂在每帧 sync 上，渲染完自然补上（自身幂等）。
     */
    /** 右栏打开时给主框架打标记，让单列 grid 把第三列让出来。 */
    function syncRightbarGrid() {
      // 每次都实时查，别用缓存的 state.frame：右栏关闭后缓存可能失效，
      // 标记清不掉，grid 会卡在「右栏占满」，会话列被压成 0 宽（整页空白）。
      const frame = document.querySelector("[data-pa-frame]");
      if (!(frame instanceof HTMLElement)) return;
      const open = document.querySelector("[data-sidebar-right-open]") !== null;
      if (open) {
        if (!frame.hasAttribute("data-pa-right-open")) frame.setAttribute("data-pa-right-open", "");
      } else {
        if (frame.hasAttribute("data-pa-right-open")) frame.removeAttribute("data-pa-right-open");
      }
    }

    function ensureInstallDialogLayout() {
      if (!phoneQuery.matches) return;
      // 不依赖类名（哈希/被截断的类名都靠不住）：从「添加插件」那个输入框往上找，
      // 第一个 flex-direction:row 的祖先就是被挤扁的容器，把它改成纵向。
      const input = document.querySelector('input[placeholder*="dsh-plugin"]');
      if (!(input instanceof HTMLElement)) return;
      let el = input.parentElement;
      for (let i = 0; i < 6 && el !== null; i += 1) {
        const cs = window.getComputedStyle(el);
        if (cs.display.includes("flex") && cs.flexDirection === "row") {
          el.style.setProperty("flex-direction", "column", "important");
          el.style.setProperty("align-items", "stretch", "important");
          el.style.setProperty("width", "100%", "important");
          el.style.setProperty("max-width", "100%", "important");
          console.log(`${LOG} 已把添加插件表单改成纵向`);
          return;
        }
        el = el.parentElement;
      }
    }
    /**
     * 安装侧栏右上角的宽度按钮。
     *
     * 两种操作合一：
     *   · 单点 → 切档（60% / 75% / 90% / 100% 循环）；
     *   · 按住并横向拖 → 无极调宽（跟手，松手记住）。
     *
     * 为什么不用 click 判单点：触摸的 click 与拖拽会互相打架（拖完还会补一次
     * click 把宽度又切走）。所以判定放在 touch 序列里：位移超过 6px 就进入拖拽，
     * 没超过就是单点。click 只留作鼠标回退，并用时间戳去重。
     */
    function installWidthButton() {
      if (document.getElementById(WIDTH_BTN_ID) !== null) return;
      const frame = document.querySelector("[data-pa-frame]");
      if (frame === null) return;
      const sidebar = frame.querySelector("[class*='sidebarCol']");
      if (sidebar === null) return;
      const host = sidebar.querySelector("[class*='logoRow']");
      if (host === null) return;

      const button = document.createElement("button");
      button.id = WIDTH_BTN_ID;
      button.type = "button";
      button.setAttribute("aria-label", "调整侧边栏宽度（点按切换档位，按住拖动微调）");
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6 4 12l5 6M15 6l5 6-5 6"/></svg>';

      /** 当前宽度比例（读 --dsh-pa-dw 的 vw 值）。 */
      const ratioOf = () => {
        const raw = window.getComputedStyle(document.documentElement).getPropertyValue("--dsh-pa-dw");
        const vw = Number.parseFloat(raw);
        return Number.isFinite(vw) ? vw / 100 : DEFAULT_RATIO;
      };

      const applyRatio = (ratio) => {
        const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
        document.documentElement.style.setProperty("--dsh-pa-dw", `${Math.round(clamped * 1000) / 10}vw`);
      };

      const remember = () => {
        try {
          window.localStorage.setItem(WIDTH_KEY, String(ratioOf()));
        } catch {
          // 隐私模式写不进去，忽略
        }
      };

      /** 单点：切到下一档。 */
      const cycleStep = () => {
        const current = ratioOf();
        const next = WIDTH_STEPS.find((step) => step > current + 0.01) ?? WIDTH_STEPS[0];
        applyRatio(next);
        remember();
        console.log(`${LOG} 抽屉宽度 → ${Math.round(next * 100)}%（切档）`);
      };

      let startX = 0;
      let startRatio = DEFAULT_RATIO;
      let dragging = false;
      let lastTouchAt = 0;

      const onStart = (event) => {
        const touch = event.touches[0];
        if (touch === undefined) return;
        startX = touch.clientX;
        startRatio = ratioOf();
        dragging = false;
        lastTouchAt = window.performance.now();
        button.setAttribute("data-active", "");
      };

      const onMove = (event) => {
        const touch = event.touches[0];
        if (touch === undefined || event.touches.length !== 1) return;
        const dx = touch.clientX - startX;
        if (!dragging) {
          if (Math.abs(dx) < 6) return;
          dragging = true;
        }
        if (event.cancelable) event.preventDefault();
        applyRatio(startRatio + dx / window.innerWidth);
      };

      const onEnd = (event) => {
        button.removeAttribute("data-active");
        if (event.cancelable) event.preventDefault();
        if (dragging) {
          dragging = false;
          remember();
          console.log(`${LOG} 抽屉宽度 → ${Math.round(ratioOf() * 100)}%（拖拽）`);
          return;
        }
        cycleStep();
      };

      const onCancel = () => {
        button.removeAttribute("data-active");
        if (dragging) {
          dragging = false;
          remember();
        }
      };

      button.addEventListener("touchstart", onStart, { passive: true });
      button.addEventListener("touchmove", onMove, { passive: false });
      button.addEventListener("touchend", onEnd, { passive: false });
      button.addEventListener("touchcancel", onCancel, { passive: true });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        // 触摸序列已经处理过（单点/拖拽），这里只服务鼠标
        if (window.performance.now() - lastTouchAt < 700) return;
        cycleStep();
      });

      host.appendChild(button);
    }
    /** 安装抽屉遮罩（点一下收起抽屉）。 */
    function installScrim(ctx) {
      if (document.getElementById(SCRIM_ID) !== null) return;
      const scrim = document.createElement("div");
      scrim.id = SCRIM_ID;
      scrim.setAttribute("aria-hidden", "true");
      scrim.addEventListener("click", () => {
        // 会话切换后本插件会自动收起抽屉；此时手指抬起产生的 click 可能落到
        // 刚显形的遮罩上，抽屉已经关了就别再 toggle 回去。
        const frame = findFrame();
        if (frame !== null && !drawerOpen(frame)) return;
        // 刚滑开的 400ms 内不吃遮罩点击：滑动手势收尾时可能多派发一次 click，
        // 落在刚显形的遮罩上会把抽屉瞬间关掉（表现为「滑出来又自己缩回去」）。
        if (drawerOpenedAt !== 0 && window.performance.now() - drawerOpenedAt < 400) return;
        console.log(`${LOG} 遮罩被点击`);
        blurActive();
        try {
          ctx.layout.toggleSidebar();
        } catch {
          // 布局服务不可用时遮罩只作为视觉层
        }
      });
      document.body.appendChild(scrim);
    }

    /**
     * 软键盘避让。Android WebView 有两种键盘模式：整窗 resize（innerHeight 跟着
     * 变小，无需处理）与覆盖（只有 visualViewport 变矮）。只修正后者。
     * @param state - 运行时句柄，保存上一帧键盘高度以跳过无意义的样式写入。
     */
    function applyViewport(state) {
      const viewport = window.visualViewport;
      if (viewport === undefined) return;
      const occluded = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      const keyboard = occluded > 120 ? occluded : 0;
      if (keyboard === state.keyboard) return;
      state.keyboard = keyboard;
      document.documentElement.style.setProperty("--dsh-pa-im", `${keyboard}px`);
      document.documentElement.toggleAttribute("data-pa-ime", keyboard > 0);
      console.log(`${LOG} 键盘遮挡 ${keyboard}px（视口 ${Math.round(viewport.width)}x${Math.round(viewport.height)}）`);
    }

    /**
     * 把主题的正文字号镜像成 `--dsh-pa-content-base`，让 CSS 的 max() 下限
     * 仍然以用户设置为基准。
     * @param ctx - 客户端 ctx。
     * @returns 注销函数。
     */
    function mirrorContentFont(ctx) {
      const sync = () => {
        try {
          const snapshot = ctx.theme.getTheme();
          document.documentElement.style.setProperty("--dsh-pa-content-base", `${snapshot.fontSize}px`);
        } catch {
          // theme 服务缺失时用 CSS 里的 14px 兜底
        }
      };
      sync();
      try {
        return ctx.on("theme/change", sync);
      } catch {
        return () => {};
      }
    }

    /**
     * 插件入口。
     * @param ctx - 客户端 ctx（inject 声明了 layout）。
     * @returns 处置函数。
     */
    function apply(ctx) {
      window[GLOBAL_KEY]?.dispose?.();
      // HMR 重新求值不会调用旧实例的 dispose，残留控件会挡住重插；这里兜底清掉
      document.getElementById(SCRIM_ID)?.remove();
      document.getElementById("dsh-mobile-adapt-width")?.remove();
      document.getElementById("dsh-mobile-adapt-right-width")?.remove();

      // ---- 样式 ----
      let style = document.getElementById(STYLE_ID);
      if (style === null) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent = css;

      // 先把上次记住的宽度应用上（存比例，转屏/折叠屏都不会失效）
      // 兼容改名前存下的宽度（旧 key），免得用户白调一次
      const storedRatio = Number(
        window.localStorage.getItem(WIDTH_KEY) ?? window.localStorage.getItem("dsh-phone-adapt:drawer-ratio"),
      );
      const initialRatio = Number.isFinite(storedRatio) && storedRatio >= MIN_RATIO && storedRatio <= MAX_RATIO
        ? storedRatio
        : DEFAULT_RATIO;
      document.documentElement.style.setProperty("--dsh-pa-dw", `${Math.round(initialRatio * 1000) / 10}vw`);

      const state = { keyboard: -1, frame: null, raf: 0, settle: 0, longPress: 0, sessionId: undefined, dispose: () => {} };
      window[GLOBAL_KEY] = state;

      document.documentElement.toggleAttribute("data-pa-phone", phoneQuery.matches);

      /**
       * 会话切换后收起抽屉。
       *
       * 为什么不用固定延时：侧栏一收起，会话列表组件就卸载，正在进行的
       * openSession 会被中断（实测点了会话只收起抽屉、不切会话）。所以必须
       * 等切换**真的完成**——用会话内容区上的 data-conversation-session 属性
       * 作为完成信号，它变了才收起。
       */
      const watchSessionSwitch = (ctx, frame) => {
        const holder = document.querySelector("[data-conversation-session]");
        const current = holder === null ? null : holder.getAttribute("data-conversation-session");
        // 元素不在（面板切换 / 首屏挂载中）时只是「暂缺」，不是切换；
        // 否则 打开抽屉 → 会话区重排 → ID 变 null 再变回，会被误判成切会话而把抽屉收掉。
        if (current === null) return;
        if (current === state.sessionId) return;
        const switched = state.sessionId !== undefined && state.sessionId !== null;
        state.sessionId = current;
        if (!switched || !phoneQuery.matches) return;
        if (!drawerOpen(frame)) return;
        console.log(`${LOG} 会话已切换，收起抽屉`);
        // DSH 的 composer 在换会话后会自己 editor.focus()，手机上就是「点会话弹键盘」
        blurActive();
        window.setTimeout(blurActive, 120);
        window.setTimeout(blurActive, 400);
        window.setTimeout(blurActive, 800);
        if (state.settle !== 0) return;
        window.setTimeout(() => {
          if (state.frame !== null && drawerOpen(state.frame)) toggleDrawer(ctx, state.frame);
        }, 200);
      };
      const sync = () => {
        // 缓存的 frame 还挂在文档里就别重新查询：这个函数每帧都被调用
        const cached = state.frame;
        const frame = cached !== null && cached.isConnected ? cached : findFrame();
        if (frame === null) return;
        state.frame = frame;
        if (!frame.hasAttribute("data-pa-frame")) frame.setAttribute("data-pa-frame", "");
        if (!phoneQuery.matches) return;
        installScrim(ctx);
        installWidthButton();
        syncDrawerState(frame);
        watchSessionSwitch(ctx, frame);
        ensureInstallDialogLayout();
        syncRightbarGrid();
      };

      const scheduleSync = () => {
        if (state.raf !== 0) return;
        state.raf = window.requestAnimationFrame(() => {
          state.raf = 0;
          sync();
        });
      };

      // ---- 观察器 ----
      const observer = new MutationObserver(scheduleSync);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-sidebar-collapsed", "aria-modal", "data-conversation-session"],
      });

      const onModalChange = () => {
        const modal = document.querySelector("[aria-modal]") !== null;
        document.documentElement.toggleAttribute("data-pa-modal", modal);
        if (modal) pushBackReason("modal");
        // 对话框内容是分批渲染的：出现那一刻 querySelector 可能还拿不到，
        // 这里补几次延迟重试（幂等）。
        if (modal) {
          for (const delay of [0, 80, 250, 600]) {
            window.setTimeout(ensureInstallDialogLayout, delay);
          }
        }
        else removeBackReason("modal");
        // 打开设置/确认框时抽屉没有存在价值，主动收起
        if (modal && state.frame !== null && drawerOpen(state.frame)) {
          try {
            ctx.layout.toggleSidebar();
          } catch {
            // 忽略
          }
        }
        scheduleSync();
      };
      const modalObserver = new MutationObserver(onModalChange);
      modalObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-modal"],
      });

      // ---- 视口 / 键盘 / 聚焦 ----
      const onViewport = () => {
        applyViewport(state);
        document.documentElement.toggleAttribute("data-pa-phone", phoneQuery.matches);
        if (state.frame !== null) syncDrawerState(state.frame);
      };

      const onPopState = () => {
        if (!guardPushed) return;
        guardPushed = false;
        const reason = backReasons.pop();
        console.log(`${LOG} 返回键：关闭 ${reason ?? "?"}`);
        if (reason === "modal") {
          closeTopModal();
        } else if (reason === "drawer") {
          if (state.frame !== null && drawerOpen(state.frame)) toggleDrawer(ctx, state.frame);
        }
        // 还有没退完的层：补压一层，保证下一次返回键仍然可用
        if (backReasons.length > 0) pushGuardHistory();
      };
      window.addEventListener("popstate", onPopState);

      // ---- 滑动手势：右滑拉出抽屉，左滑推回 ----
      /**
       * 抽屉宽度。收起时它被 transform 移出屏幕，但仍参与布局，所以量得到。
       * @param sidebar - 侧栏列元素。
       */
      const drawerWidth = (sidebar) => {
        const width = sidebar.getBoundingClientRect().width;
        return width > 0 ? width : Math.min(322, window.innerWidth * 0.86);
      };

      const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

      /**
       * 手势起点是否落在可横向滚动的容器里（代码块、表格、长行）。
       * 这些地方手指横滑是「滚内容」，不能被抽屉手势吃掉。
       * @param node - touchstart 的目标节点。
       */
      const inHorizontalScroller = (node) => {
        let el = node instanceof Element ? node : null;
        while (el !== null && el !== document.body) {
          if (el instanceof HTMLElement) {
            const style = window.getComputedStyle(el);
            if ((style.overflowX === "auto" || style.overflowX === "scroll")
              && el.scrollWidth > el.clientWidth + 2) return true;
          }
          el = el.parentElement;
        }
        return false;
      };

      const onTouchStart = (event) => {
        if (!phoneQuery.matches || event.touches.length !== 1) return;
        const frame = state.frame;
        if (frame === null) return;
        // 弹窗（设置、确认框）里的横滑交给弹窗自己
        if (document.querySelector("[aria-modal]") !== null) return;
        if (event.target instanceof Element
          && event.target.closest("#" + WIDTH_BTN_ID) !== null) return;
        if (inHorizontalScroller(event.target)) return;
        // 正在选择文本时不要抢手势
        const selection = window.getSelection?.();
        if (selection !== undefined && selection !== null && String(selection).length > 0) return;

        const sidebar = findSidebarCol(frame);
        if (sidebar === null) return;
        const row = event.target instanceof Element
          ? event.target.closest("[class*='sessionRow'], [class*='projectRow']")
          : null;
        const touch = event.touches[0];
        state.gesture = {
          row,
          moved: false,
          sidebar,
          x0: touch.clientX,
          y0: touch.clientY,
          lastX: touch.clientX,
          lastT: event.timeStamp,
          vx: 0,
          open: drawerOpen(frame),
          width: drawerWidth(sidebar),
          decided: false,
          active: false,
        };
        // 长按 480ms 且手指没移动 → 展开该行的多级按钮（会话/工作区行）
        if (row !== null && drawerOpen(frame)) {
          if (state.longPress !== 0) window.clearTimeout(state.longPress);
          state.longPress = window.setTimeout(() => {
            state.longPress = 0;
            const g = state.gesture;
            if (g === null || g.moved || g.row === null) return;
            g.row.setAttribute("data-pa-actions", "");
            g.longPressFired = true;
            console.log(`${LOG} 长按：展开会话操作按钮`);
          }, 480);
        }
      };

      const onTouchMove = (event) => {
        const g = state.gesture;
        if (g === null || event.touches.length !== 1) return;
        const touch = event.touches[0];
        const dx = touch.clientX - g.x0;
        const dy = touch.clientY - g.y0;
        if (!g.moved && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
          g.moved = true;
          if (state.longPress !== 0) window.clearTimeout(state.longPress);
          state.longPress = 0;
        }

        if (!g.decided) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          const horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
          // 收起时只认向右、打开时只认向左；反向直接放弃，交回页面
          const wrongWay = g.open ? dx > 0 : dx < 0;
          if (!horizontal || wrongWay) {
            state.gesture = null;
            return;
          }
          g.decided = true;
          g.active = true;
          console.log(`${LOG} 抽屉手势开始（${g.open ? "左滑收起" : "右滑打开"}）`);
        }
        if (!g.active) return;

        if (event.cancelable) event.preventDefault();
        const now = event.timeStamp;
        if (now > g.lastT) g.vx = (touch.clientX - g.lastX) / (now - g.lastT);
        g.lastX = touch.clientX;
        g.lastT = now;

        const base = g.open ? 0 : -g.width * 1.02;
        g.sidebar.style.transition = "none";
        g.sidebar.style.transform = `translateX(${clamp(base + dx, -g.width * 1.02, 0)}px)`;
      };

      /**
       * 松手结算：过阈值或甩得够快就切状态，否则回弹。
       * 位置用 inline transform 钉住目标，过渡结束后再交还给 CSS 状态规则，
       * 这样动画不会因为 React 重渲染晚一帧而闪一下。
       */
      const onTouchEnd = (event) => {
        const g = state.gesture;
        state.gesture = null;
        if (g === null || !g.active) return;

        if (state.longPress !== 0) window.clearTimeout(state.longPress);
        state.longPress = 0;
        if (g.longPressFired) {
          // 长按已经展开按钮：这次抬起不该再触发「打开会话」
          if (event.cancelable) event.preventDefault();
          return;
        }
        const dx = g.lastX - g.x0;
        const base = g.open ? 0 : -g.width * 1.02;
        const visible = clamp(1 + clamp(base + dx, -g.width * 1.02, 0) / g.width, 0, 1);
        const flung = Math.abs(g.vx) > 0.45 && (g.open ? g.vx < 0 : g.vx > 0);
        const toOpen = flung ? !g.open : visible > (g.open ? 0.6 : 0.4);

        g.sidebar.style.transition = "transform 260ms cubic-bezier(.4, 0, .2, 1)";
        g.sidebar.style.transform = `translateX(${toOpen ? 0 : -g.width * 1.02}px)`;
        if (state.settle !== 0) {
          window.cancelAnimationFrame(state.settle);
          window.clearTimeout(state.settle);
          state.settle = 0;
        }
        /**
         * inline transform 必须等到「CSS 状态也已经切到目标」才能撤，
         * 否则撤销的瞬间会退回旧状态的 translateX(-102%)，表现为滑出时抖一下。
         * 首次打开要挂载完整侧栏，React 更新比后续慢，所以这里轮询等状态对齐。
         */
        state.settle = 1;
        const deadline = window.performance.now() + 900;
        const handBack = () => {
          const frame = state.frame;
          const aligned = frame !== null && drawerOpen(frame) === toOpen;
          if (!aligned && window.performance.now() < deadline) {
            state.settle = window.requestAnimationFrame(handBack);
            return;
          }
          state.settle = 0;
          g.sidebar.style.transition = "";
          g.sidebar.style.transform = "";
        };
        state.settle = window.requestAnimationFrame(handBack);

        console.log(`${LOG} 抽屉手势结束（位移 ${Math.round(dx)}px，可见 ${Math.round(visible * 100)}%，目标 ${toOpen ? "打开" : "收起"}）`);
        if (toOpen !== g.open) toggleDrawer(ctx, state.frame);
      };

      const onFocusIn = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT" && !target.isContentEditable) return;
        // 等键盘动画结束再滚，否则会量到动画中间的位置
        window.setTimeout(() => target.scrollIntoView({ block: "nearest" }), 280);
      };

      /** 点行外就收起行内展开态。 */
      const onDocumentClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        for (const el of document.querySelectorAll("[data-pa-actions]")) {
          if (target !== null && (el === target || el.contains(target))) continue;
          el.removeAttribute("data-pa-actions");
        }
      };
      document.addEventListener("click", onDocumentClick, true);

      phoneQuery.addEventListener("change", onViewport);
      window.visualViewport?.addEventListener("resize", onViewport);
      window.visualViewport?.addEventListener("scroll", onViewport);
      window.addEventListener("resize", onViewport);
      document.addEventListener("focusin", onFocusIn, true);
      // touchstart / touchend 只读位置，用 passive；touchmove 需要 preventDefault
      // 吃掉横向滚动，必须 passive: false
      document.addEventListener("touchstart", onTouchStart, { passive: true });
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd, { passive: true });
      document.addEventListener("touchcancel", onTouchEnd, { passive: true });

      // ---- 会话切换后收起抽屉 ----
      let offSessions = () => {};
      try {
        const service = ctx.get("sessions");
        const list = service?.list;
        if (list !== undefined && typeof list.subscribe === "function") {
          let last = list.getSnapshot?.().current;
          offSessions = list.subscribe(() => {
            const current = list.getSnapshot?.().current;
            if (current === last) return;
            last = current;
            if (state.frame !== null && drawerOpen(state.frame) && phoneQuery.matches) {
              window.setTimeout(() => {
                if (state.frame !== null && drawerOpen(state.frame)) toggleDrawer(ctx, state.frame);
              }, 120);
            }
          });
        }
      } catch (error) {
        console.log(`${LOG} 会话订阅不可用`, error);
      }

      const stopFont = mirrorContentFont(ctx);

      state.dispose = () => {
        observer.disconnect();
        modalObserver.disconnect();
        phoneQuery.removeEventListener("change", onViewport);
        window.visualViewport?.removeEventListener("resize", onViewport);
        window.visualViewport?.removeEventListener("scroll", onViewport);
        window.removeEventListener("resize", onViewport);
        document.removeEventListener("focusin", onFocusIn, true);
        window.removeEventListener("popstate", onPopState);
        document.removeEventListener("click", onDocumentClick, true);
        if (state.longPress !== 0) window.clearTimeout(state.longPress);
        document.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
        if (state.settle !== 0) window.clearTimeout(state.settle);
        const gestureSidebar = state.frame === null ? null : findSidebarCol(state.frame);
        if (gestureSidebar !== null) {
          gestureSidebar.style.transition = "";
          gestureSidebar.style.transform = "";
        }
        offSessions();
        stopFont();
        if (state.raf !== 0) window.cancelAnimationFrame(state.raf);
        document.getElementById(SCRIM_ID)?.remove();
        document.getElementById(WIDTH_BTN_ID)?.remove();
        document.documentElement.style.removeProperty("--dsh-pa-dw");
        document.getElementById(STYLE_ID)?.remove();
        const html = document.documentElement;
        html.removeAttribute("data-pa-phone");
        html.removeAttribute("data-pa-drawer");
        html.removeAttribute("data-pa-modal");
        html.removeAttribute("data-pa-ime");
        html.style.removeProperty("--dsh-pa-im");
        html.style.removeProperty("--dsh-pa-content-base");
        if (state.frame !== null) {
          state.frame.removeAttribute("data-pa-frame");
          state.frame.removeAttribute("data-pa-drawer");
        }
        if (window[GLOBAL_KEY] === state) delete window[GLOBAL_KEY];
      };

      sync();
      applyViewport(state);

      // 首帧可能早于 React 挂载，补几次延迟同步
      window.setTimeout(sync, 400);
      window.setTimeout(sync, 1500);
      window.setTimeout(() => {
        const frame = findFrame();
        console.log(
          `${LOG} 就绪（视口 ${window.innerWidth}x${window.innerHeight}，`
          + `手机布局 ${phoneQuery.matches ? "开" : "关"}，`
          + `AppFrame ${frame === null ? "未找到" : "已定位"}，`
          + `侧栏 ${frame === null ? "-" : drawerOpen(frame) ? "展开" : "收起"}）`,
        );

      }, 2000);
    }

    return { inject: ["layout"], apply };
  },
});
