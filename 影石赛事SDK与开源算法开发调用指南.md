# 影石赛事SDK & 开源算法开发调用指南

> 欢迎使用影石设备开发！这是一份帮助您快速上手的开发指南。

---

# Insta360 SDK介绍

> SDK 仅作为"设备"与相机之间的通信/控制桥梁，不会改变相机内部原有的功能逻辑。

## 整体介绍

> - 不同相机系列使用的开发方式不同。X 系列提供 Camera SDK 和 Media SDK，ACE 和 GO 系列只提供 Camera SDK。Link 系列通过 Link 协议接入，相关代码在 Link SDK 仓库中提供。
> - 接口文档：[https://insta360develop.github.io/Insta360-Developer_Docs/ch/](https://insta360develop.github.io/Insta360-Developer_Docs/ch/)
> - SDK中包括SDK软件包 和 Demo（可以先参考Demo跑通流程）
> - SDK下载：**9月21日晚开启**

| 相机系列 | 开发方式/软件包 | 支持平台 | 连接方式 | 主要功能 | 软件包 |
|---------|---------------|---------|---------|---------|--------|
| X 系列 | Camera SDK、Media SDK | Android、iOS | Wi-Fi、蓝牙、USB | 连接、预览（实时）、参数设置、拍摄控制、文件管理、全景拼接 | [Android-SDK-2.1.5.zip](#) · [iOS-SDK-1.10.4.zip](#) |
| X 系列 | Camera SDK、Media SDK（MediaSDK必须有GPU才能用） | Linux（X86 & ARM）、Windows | USB | 连接、预览（实时）、参数设置、拍摄控制、文件管理、全景拼接 | [CameraSDK_MediaSDK.zip](#) |
| X系列 | OSC协议 | 不限制平台 | WiFi连接 | 连接、参数设置、拍摄控制、文件管理 | 见接口文档 |
| ACE 系列 | Camera SDK | Android | Wi-Fi、蓝牙 | 连接、预览（实时）、参数设置、拍摄控制、文件管理 | 同X系列安卓 |
| GO 系列 | Camera SDK | Android | Wi-Fi、蓝牙 | 连接、预览（实时）、参数设置、拍摄控制、文件管理 | 同X系列安卓 |
| Link 系列 | 协议 | macOS、Linux、Windows | USB | 云台转动、对焦、曝光控制、音频设置 | [Link SDK.zip](#) |

- **Camera SDK** 负责连接相机、获取预览流和控制拍摄。**Media SDK** 只用于 X 系列，主要负责把双鱼眼图像拼接成全景画面。

### 注意事项

1. 使用桌面端SDK连接全景相机时，插上USB线后必须选择"安卓模式"才能通过SDK建立连接（安卓模式的切换需要满足5V3A）
2. 蓝牙连接模式下，相机不支持预览和文件管理功能（传输带宽有限，无法传输大文件）
3. 使用SDK时建议把相机固件更新到官网最新版 [https://www.insta360.com/cn/download](https://www.insta360.com/cn/download)
4. X6/X5/X4/X4 Air 仅照片可在相机内直接拼接（在设置中打开），视频需通过 Media SDK 拼接

## 基本概念 和 重点能力介绍

### 全景相机的基本概念

X 系列全景相机有两个背靠背的鱼眼镜头，每个镜头的视角超过 180°。相机输出的是两块鱼眼画面，不是可以直接拖动观看的全景画面。

把两块鱼眼画面校正、对齐并合成完整球面画面的过程叫作**拼接（Stitching）**。常见的输出格式是 **ERP（Equirectangular Projection，等距柱状投影）**。

### 预览功能 - 所有"实时"类项目的基础（重点功能）

**1. X 系列全景预览**

> X 系列：通过CameraSDK获取到的预览流是 H.264 或 H.265 编码的双鱼眼视频流。需要调用 Media SDK 拼接，最后渲染 ERP 全景画面。
>
> 预览数据中带有 IMU 数据，可用于处理画面姿态和方向。接入时需要做好视频帧与 IMU 数据的时间同步。
>
> 三个建议了解的细节：
>
> 1. **取得的视频流是未拼接的双鱼眼**，编码为 H.264/H.265（可用 `GetVideoEncodeType` 查询）。若要显示全景，需自行解码后交给 Media SDK 拼接。
> 2. **分辨率 ≥ 5.7K 时会分成两路流**（stream_index 0/1，各对应一个镜头）；低于 5.7K 为单路。预览分辨率推荐 **1920×960**。
> 3. **OnGyroData 可直接获取陀螺仪数据** —— 这是防抖与姿态感知的基础，开发机器人/无人机方向的选手可重点关注（这一能力容易被忽略）。
>
> 其他实用接口：`SetActiveSensor`（切换前/后/全景镜头）、`ShutdownCamera`（远程关机，X5+）。

**2. ACE 和 GO系列预览**

> ACE 和 GO 系列输出平面视频，不需要全景拼接。应用获取并解码预览流后，可直接显示或继续处理。

**3. 音频数据** 只有调到"直播模式"下才有（正常的预览流没有音频数据），并且只有X系列在"直播模式"下有音频数据，ACE和GO无法通过SDK拿到音频数据

### 获取相机内参 - 需要签署保密协议

> 如果需要图像数据跟激光雷达等点云数据对齐，可以通过Metadata SDK（Offset版本）获取相机的内参 - 需要签署保密协议找Insta360获取，请联系工作人员 xuyongbo@insta360.com

### Media SDK （全景SDK独有）—— 将双鱼眼拼接为全景

**主要功能**：输入未拼接的 `.insv`/`.insp` → 输出拼接完成的 `.mp4`/`.jpg`。核心是**拼接**，同时支持防抖、调色、降噪、导出。

---

# Insta360 AI开源算法

> 以下项目来自影石研究院，围绕全景数据生成、深度估计、全景图像生成和三维重建展开。

| 模型 | 简介 | 项目地址 |
|------|------|---------|
| AirSim360 | 基于 Unreal Engine 5 的全景无人机仿真平台，可生成全景 RGB、深度、语义分割等数据，适合算法训练和仿真测试。 | [GitHub](https://github.com/Insta360-Research-Team/AirSim360) |
| DAP | 全景深度估计模型。输入单张 ERP 全景图，可预测对应的深度信息。 | [GitHub](https://github.com/Insta360-Research-Team/DAP) |
| DiT360 | 全景图像生成模型，可根据文字生成 360° 全景图，也支持局部重绘和画面扩展。 | [GitHub](https://github.com/Insta360-Research-Team/DiT360) |
| DDGS | 面向稀疏视角的三维重建模型，使用深度和密度信息改善 Gaussian Splatting 的稳定性与场景完整度。 | [GitHub](https://github.com/Insta360-Research-Team/DDGS) |

> 这些模型可以单独使用，也可以按项目需要组合。例如先用 DiT360 生成全景图，再用 DAP 估计深度，并将结果用于后续维场景处理。

![影石AI开源算法模型总览](images/影石AI开源算法模型总览.png)

### 样例

#### X5全景图 vs DAP深度图效果对比

| X5全景图 | DAP深度图 |
|---------|----------|
| ![X5全景图](images/X5全景图.png) | ![DAP深度图](images/DAP深度图.png) |

> *图片来源：AttraX黑客松作品-PeterPan赛博管家项目，黑客松现场实测参考如上*

#### 模型组合使用

> DiT360生成全景图 → DAP补充深度信息 → DDGS构建3D场景 → AirSim360构建仿真环境
