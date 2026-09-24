package com.menote.p2p

import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

/**
 * 系统栏安全区适配。
 *
 * 背景：`targetSdk = 35` 起，Android 15+ 对应用**强制 edge-to-edge** ——
 * 窗口铺满整屏、状态栏/导航栏透明悬浮在内容之上。表现就是本 App 在新手机上
 * 标题行、按钮、WebView 页面顶部全钻到状态栏底下，按钮被状态栏盖住点不到。
 * （Android 16 起 `windowOptOutEdgeToEdgeEnforcement` 逃生舱被移除，只能正面适配。）
 *
 * 做法：把系统栏 inset 作为**额外 padding** 加到目标 View 上，保留其原有的
 * 基础 padding（如根布局的 16dp）不变。窗口本身仍是全屏的，状态栏区域显示窗口背景色。
 *
 * 注意：listener 必须原样 `return insets`（不 consume），
 * 否则子 View 与后续派发拿不到，会连带破坏其它 inset 消费方。
 *
 * @param top 是否避让顶部（状态栏 / 刘海）
 * @param bottom 是否避让底部（导航栏）
 * @param horizontal 是否避让左右。横屏时刘海在侧边、三键导航栏会跑到右侧，
 *   只避让上下是不够的 —— 这两个方向的 inset 只由 `displayCutout` / `systemBars`
 *   的左右边给出，竖屏下恒为 0，所以打开它不影响竖屏表现。
 * @param ime 是否把输入法高度也算进底部 padding。**必须配合
 *   `android:windowSoftInputMode="adjustResize"`**：`enableEdgeToEdge()` 关掉了
 *   decorFitsSystemWindows，窗口不再随键盘自动缩小，不显式消费 `ime()` 的话
 *   WebView 里的编辑器、日志面板会被键盘直接盖住（这是开启 edge-to-edge 后
 *   相对旧版本新增的回归，Android 14 及以下同样受影响）。
 */
fun View.applySystemBarPadding(
    top: Boolean = true,
    bottom: Boolean = true,
    horizontal: Boolean = false,
    ime: Boolean = false,
) {
    val baseLeft = paddingLeft
    val baseTop = paddingTop
    val baseRight = paddingRight
    val baseBottom = paddingBottom

    val types = WindowInsetsCompat.Type.systemBars() or
        WindowInsetsCompat.Type.displayCutout() or
        (if(ime) WindowInsetsCompat.Type.ime() else 0)

    ViewCompat.setOnApplyWindowInsetsListener(this) { v, insets ->
        val bars = insets.getInsets(types)
        v.updatePadding(
            left = if(horizontal) baseLeft + bars.left else baseLeft,
            top = if(top) baseTop + bars.top else baseTop,
            right = if(horizontal) baseRight + bars.right else baseRight,
            bottom = if(bottom) baseBottom + bars.bottom else baseBottom,
        )
        insets
    }
    // 监听器若晚于首次 inset 派发设置，需主动补一次
    ViewCompat.requestApplyInsets(this)
}
