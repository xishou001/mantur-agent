# 应用内置生产线技能适配器

[English](README.md) | 中文

官方生产线技能 1.2.9 归档保留在 `archives/mantur-drama-visual-studio-1.2.9.zip`，SHA-256 为 `980bc9e9f352f1170e0bdfe641a08b7fbaf23854b9f4171d7cc80f1ba674f73b`。[patch-visual-studio.py](patch-visual-studio.py)接受此不可变归档及一个新的输出路径，仅修改 `scripts/access-base.mjs`：Main 提供私有描述文件时保留桌面托管身份，独立登录与连接器行为保持不变。桌面授权缺失时提示通过桌面应用登录，不回退到全局 CLI 账号。

`source.json`固定补丁后的 ZIP、完整文件清单及应用技能摘要，资源准备离线校验这些身份。Main 导出内置 CLI 的确切入口与 既有 CLI 状态目录，适配器不再从 shell 启动器推测包位置，也不选择环境中的 CLI。上游技能或 CLI 变更时须联合审核两处补丁，不以未经校验的下载替换固定归档。
