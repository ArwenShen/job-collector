# Spec: 求职岗位收集 Chrome 插件

## 1. 文档状态

- 状态：待用户书面复核
- 日期：2026-09-02
- 产品用户：需要集中整理职位信息、再交给后续分析工具处理的求职者
- 支持平台：BOSS直聘、猎聘、智联招聘、前程无忧
- 输出基准：`docs/sample/job-collector-boss.csv`
- 页面样例：`docs/sample/sample-BOSS直聘.html`、`sample-猎聘.html`、`sample-智联招聘.html`、`sample-前程无忧.html`

## 2. Objective

开发一个 Chrome Manifest V3 插件，让求职者在四个支持平台的职位详情页上主动收集当前岗位，免去反复复制职位信息给后续 AI 工具的操作。

用户每次打开一个职位详情页，点击插件，再点击“收集当前岗位”。插件立即从当前页面提取并在浏览器本地保存完整岗位数据，但弹窗只显示简短摘要，也不会立即下载文件。用户收集完多个岗位后点击“导出 CSV”，插件才生成并下载包含完整 JD 的 CSV。

成功意味着：四个平台的当前职位详情可以被准确提取；多条记录可可靠保存、去重和导出；CSV 与现有 `ai-job-analysis/scripts/prepare_jobs.py` 兼容；插件不访问当前页之外的职位。

## 3. Scope

### 3.1 In scope

- 识别四个平台的职位详情页。
- 读取用户当前激活标签页中正在展示的一个职位详情。
- 提取职位基本信息、完整职位描述和公司介绍。
- 在弹窗中紧凑预览平台、岗位名、公司、地点和薪资。
- 将完整记录保存到 `chrome.storage.local`。
- 按 `source_site + source_job_id` 去重；重复收集覆盖原记录并刷新采集时间。
- 将全部已保存记录导出为 CSV。
- 导出后继续保留本地记录。
- 经二次确认后清空全部本地记录。

### 3.2 Out of scope

- 自动遍历、扫描或点击职位列表。
- 开启一次插件后自动收集后续页面。
- 新标签页自动收集。
- 抓取未被用户打开的职位 URL。
- 自动投递、聊天、收藏、取消收藏或修改招聘平台数据。
- AI 分析、AI 托管、推荐、评分或简历匹配。
- 账号系统、后端、数据库、云同步或遥测。
- 手动字段编辑、备注输入和岗位管理列表。
- 保存原始 HTML、Cookie、登录凭据、聊天记录、联系人信息或个人简历。

## 4. Confirmed product decisions

- 每个职位都需要用户在当前详情页主动点击一次“收集当前岗位”。
- 收集时保存完整数据；弹窗只显示摘要；只有导出时才下载文件。
- 导出不会删除本地数据。
- 清空是唯一删除方式，并且必须二次确认。
- 同一平台的同一岗位再次收集时更新原记录，不新增重复行。
- 不提供连续收集模式。
- `note` 列为兼容案例保留，当前始终为空，不增加备注输入框。

## 5. Tech stack

- Chrome Extension Manifest V3
- 原生 HTML、CSS、TypeScript
- Vite 构建
- Vitest + jsdom 自动化测试
- Chrome `activeTab`、`scripting`、`storage` API
- 无 UI 框架、无后端、无远程 API

依赖版本在工程初始化时锁定到 lockfile。新增运行时依赖、扩大 Chrome 权限或引入远程资源前必须先征得用户同意。

## 6. Permissions and privacy

Manifest 只申请：

```json
{
  "permissions": ["activeTab", "scripting", "storage"]
}
```

- `activeTab`：仅在用户点击插件后临时读取当前标签页。
- `scripting`：向当前标签页执行一次性提取逻辑。
- `storage`：在浏览器本地保存已收集记录。
- 不申请静态全站访问权限、浏览历史、下载、Cookie 或身份权限。
- CSV 使用浏览器端 Blob 与下载链接生成，不需要 `downloads` 权限。
- 插件不得发起网络请求，不得加载远程字体、脚本、样式或图片。

## 7. Data contract

### 7.1 CSV columns

CSV 必须与 `docs/sample/job-collector-boss.csv` 保持以下 16 列及顺序完全一致：

1. `schema_version`
2. `source_site`
3. `source_job_id`
4. `source_url`
5. `job_title`
6. `company_name`
7. `salary`
8. `note`
9. `location`
10. `experience`
11. `education`
12. `job_description`
13. `company_description`
14. `missing_fields`
15. `collected_at`
16. `collector_version`

### 7.2 Field rules

- `schema_version`：固定为字符串 `"1"`。
- `source_site`：只允许 `boss`、`liepin`、`zhaopin`、`51job`。
- `source_job_id`：从详情页规范 URL 或结构化数据中提取的平台岗位 ID。
- `source_url`：当前岗位的规范 HTTP(S) URL；移除 hash 和无关追踪参数。
- `job_title`：当前岗位名称，必需。
- `company_name`：招聘公司展示名称。
- `salary`：保留平台展示原文，不进行数值换算。
- `note`：当前版本固定为空字符串。
- `location`：保留平台展示的城市或城市区域文本。
- `experience`：保留平台展示原文。
- `education`：保留平台展示原文。
- `job_description`：当前岗位完整 JD 的可见纯文本，必需。
- `company_description`：当前公司介绍的可见纯文本。
- `missing_fields`：所有缺失可选字段的英文列名，以英文逗号连接；无缺失时为空。
- `collected_at`：带毫秒的 UTC ISO 8601，例如 `2026-09-02T09:02:29.943Z`。
- `collector_version`：读取扩展 manifest 版本。

`job_title` 或 `job_description` 缺失时禁止收集。其他字段缺失时允许收集，并写入 `missing_fields`。

### 7.3 CSV serialization

- UTF-8 BOM，文件开头必须是 `EF BB BF`。
- 使用 CRLF 行分隔符。
- 每个字段统一使用双引号包裹。
- 字段中的双引号按 RFC 4180 规则写成两个双引号。
- 多行职位描述保留在单个 CSV 单元格内。
- 默认文件名使用 `job-collector-YYYY-MM-DD-HHmm.csv`。
- 只有用户点击“导出 CSV”时才生成和下载文件。

## 8. Extraction architecture

### 8.1 Data flow

```text
用户点击插件
→ 校验当前标签页域名和详情 URL
→ 执行对应平台适配器
→ 结构化数据优先 / DOM 精确补齐
→ 可见文本与 URL 清洗
→ 必需字段校验和 missing_fields 计算
→ 弹窗显示摘要
→ 用户点击“收集当前岗位”
→ 按唯一键写入 chrome.storage.local
→ 用户稍后点击“导出 CSV”
→ 序列化全部完整记录并下载
```

### 8.2 Adapter interface

每个平台一个独立适配器，统一返回结果，不使用跨平台文本猜测：

```ts
type SourceSite = "boss" | "liepin" | "zhaopin" | "51job";

interface ExtractResult {
  record: JobRecord | null;
  missingRequiredFields: Array<"job_title" | "job_description">;
  diagnostics: string[];
}

interface JobExtractor {
  matches(url: URL, document: Document): boolean;
  extract(url: URL, document: Document): ExtractResult;
}
```

诊断信息只用于弹窗错误提示和测试，不写入 CSV，也不发送到外部。

### 8.3 Platform rules

#### BOSS直聘

- 详情 URL：`/job_detail/<job-id>.html`。
- 岗位名称：`.job-primary .info-primary h1`。
- 薪资：`.job-primary .salary`。
- 地点：`.job-primary .text-city`。
- 经验：`.job-primary .text-experiece`；保留页面中的拼写。
- 学历：`.job-primary .text-degree`。
- 公司名称：优先读取 `.job-primary .detail-op .info` 的自身可见文本，排除“查看所有职位”和下载提示；回退到 `.sider-company .company-info`。
- JD：定位标题可见文本为“职位描述”的首个 `.job-detail > .job-detail-section`，只读取其直属 `.job-sec-text`。
- 公司介绍：`.job-detail-company .company-info-box > .job-sec-text`。
- 必须排除 `.similar-job-wrapper`、`.smallbanner`、安全提示、操作按钮和推荐岗位。
- BOSS 会在文字中插入 `display:none`、`visibility:hidden` 或零尺寸反复制节点。文本提取必须基于实际可见节点，不能直接使用未经处理的 `textContent`。

#### 猎聘

- 详情 URL：`/job/<job-id>.shtml`。
- 岗位名称：`.job-apply-container .name.ellipsis-2`。
- 薪资：`.job-apply-container .salary`。
- 地点、经验、学历：限定在 `.job-apply-container .job-properties` 内按当前岗位属性读取。
- 公司名称：`.company-card .name.ellipsis-1`，必要时回退招聘者公司链接。
- JD：`[data-selector="job-intro-content"]`。
- 公司介绍：`.company-intro-container .paragraph-box .inner`。
- 样例中的 `JobPosting` 含未转义控制字符，不能作为唯一提取源。

#### 智联招聘

- 详情 URL：支持 `/jobdetail/<job-id>.htm` 及页面声明的规范职位 URL。
- 首选数据源：`window.__INITIAL_STATE__.jobDetail`。
- 职位字段：`detailedPosition` 中的 `positionNumber`、`positionName`、`salary`、`positionWorkCity`、`positionWorkingExp`、`education`、`description`。
- 公司字段：`detailedCompany.companyName` 和 `detailedCompany.companyDescription`。
- DOM 回退只限定 `.summary-planes` 和标题为“职位描述/公司信息”的对应当前岗位区块。

#### 前程无忧

- 详情 URL：`jobs.51job.com/.../<job-id>.html`。
- 首选数据源：`application/ld+json` 中 `@type = "JobPosting"` 的对象。
- 使用 `identifier.value`、`url`、`title`、`hiringOrganization.name`、`baseSalary`、`jobLocation`、`experienceRequirements`、`educationRequirements`、`description`。
- 薪资优先保留页面展示值 `.cn strong`，避免重新格式化结构化数值。
- 公司介绍由标题为“公司信息”的主内容区块补齐。
- DOM 回退：`.cn h1`、`.cn strong`、`.type_2`、`.type_3`、`.type_4`、`.job_msg` 和当前公司区块。

### 8.4 Text normalization

- 读取实际可见文本，排除隐藏节点、脚本、样式、按钮和辅助操作文案。
- 将 `<br>`、块级元素和列表项转换为自然换行。
- 删除行首尾空白和多余空行，但不改写 JD 的词语、标点或顺序。
- 不能把相似职位、推荐企业、举报提示、地图、招聘者介绍混入 JD。
- BOSS 新记录不得出现案例历史数据中的 `职直聘位描述`、`kanzhun`、`来自BOSS直聘` 或末尾 `base 北京 上海` 等隐藏干扰内容。

## 9. Storage and deduplication

- 完整 `JobRecord` 在用户点击收集时立即写入 `chrome.storage.local`。
- 存储唯一键：`${source_site}:${source_job_id}`。
- 已存在时整条覆盖，刷新 `collected_at`，记录总数不变。
- 弹窗关闭、标签页关闭或浏览器重启后记录仍然存在。
- 导出成功或失败都不改变存储。
- 清空操作调用浏览器原生二次确认；用户取消时不得修改存储。
- 不保存原始 DOM 或 HTML 快照。

## 10. Popup design

### 10.1 Layout

- 固定宽度约 380px，高度随状态变化。
- 顶部：产品标题和已收集数量。
- 中部：当前岗位紧凑预览卡。
- 主按钮：收集或更新当前岗位。
- 底部：导出 CSV 和清空。
- 不增加标签页、详情展开、搜索、筛选、列表或备注输入。

### 10.2 States

| State | Display | Primary action |
|---|---|---|
| Loading | 正在读取当前页面… | 禁用 |
| Collectable | 平台、岗位、公司、地点、薪资 | 收集当前岗位 |
| Collected | 同一摘要及“已收集”状态 | 更新当前岗位 |
| Not detail page | 请打开支持平台的职位详情页 | 不显示 |
| Extraction failed | 无法完整识别该岗位及缺失必需字段 | 不显示 |
| Export failed | 简短错误提示 | 允许重试 |

没有本地记录时，“导出 CSV”和“清空”不可用。

### 10.3 Visual rules

只从 `docs/design` 提取适合小型插件界面的规则：

- 画布 `#16165c`。
- 卡片 `#232269`，边框 `#4846c6`。
- 主按钮 `#5350cc`。
- 主文字 `#ffffff`，次级文字 `#d8d8e3`，弱化文字 `#9494a9`。
- 数据或识别提示 `#59b4ff`。
- 8px 间距基准；卡片 16px 圆角；按钮胶囊圆角。
- 系统无衬线字体，权重 500/600。
- 一屏只突出“收集当前岗位”一个核心动作。

不采用医疗品牌语义、大字号营销标题、插画、手绘批注、图表、渐变、阴影、纹理、动画、装饰图标或额外字体。

### 10.4 Accessibility

- 所有按钮可通过键盘操作。
- 焦点状态清晰可见。
- 动态状态使用 `aria-live`。
- 状态不能只靠颜色表达。
- 长岗位名最多显示两行，完整文本保留在 `title` 属性中。

## 11. Error handling

- 不支持的平台：说明支持的四个平台，不执行提取。
- 支持平台的非详情页：提示打开职位详情页，不写入数据。
- 必需字段缺失：列出缺失字段，不写入数据。
- 可选字段缺失：允许收集并更新 `missing_fields`。
- 存储失败：显示错误，保留当前页面提取结果以便重试。
- CSV 生成或下载失败：显示错误，不删除或修改本地数据。
- 单个平台适配器失败不得影响其他平台和已有记录。

## 12. Project structure

```text
docs/sample/                 真实页面和 CSV 样例，只读测试输入
docs/superpowers/specs/      产品与技术规格
docs/superpowers/plans/      经 Spec 复核后的详细实施计划
src/manifest.json            Chrome MV3 清单
src/popup/                   弹窗 HTML、样式、状态和交互
src/extractors/              平台识别、公共文本工具和四个平台适配器
src/storage/                 本地存储、唯一键、去重与清空
src/csv/                     固定字段、序列化与下载
src/shared/                  JobRecord 类型和共享协议
tests/extractors/            四份真实 HTML 的适配器测试
tests/storage/               去重与数据生命周期测试
tests/csv/                   编码、列顺序和转义测试
tests/popup/                 弹窗状态测试
dist/                        可加载到 Chrome 的构建产物，不手工编辑
```

## 13. Commands

工程初始化后提供以下命令：

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

在提交或声明完成前，必须依次通过 `npm run typecheck`、`npm test` 和 `npm run build`。

## 14. Code style

- TypeScript 开启严格类型检查。
- 文件和函数按单一职责拆分。
- 平台差异留在各自适配器，公共清洗逻辑不得依赖平台类名。
- 不使用 `any` 绕过提取结果类型。
- 选择器使用可读的候选数组，并按优先级尝试。
- 无副作用的提取函数优先，存储和下载由独立模块负责。

示例：

```ts
export function buildStorageKey(record: Pick<JobRecord, "source_site" | "source_job_id">): string {
  return `${record.source_site}:${record.source_job_id}`;
}
```

## 15. Testing strategy

### 15.1 Unit and fixture tests

- 每个平台使用对应真实 HTML 样例测试，不手写缩小版 DOM 代替核心选择器测试。
- 逐字段断言当前岗位的标题、公司、薪资、地点、经验、学历、JD 和公司介绍。
- 对 BOSS 单独断言隐藏反复制字符、相似职位和安全提示不会混入。
- 测试缺少可选字段、缺少必需字段和未知页面。
- 测试唯一键、覆盖更新、数量不变、导出不清空和取消清空。
- 测试 CSV BOM、CRLF、16 列顺序、全字段引号、双引号转义和多行字段往返解析。

### 15.2 Integration and manual tests

- 将 `dist/` 作为 unpacked extension 加载到 Chrome。
- 四个平台各在一个真实职位详情页完成收集。
- 重复收集同一岗位并验证更新行为。
- 合并导出至少四个平台各一条记录的 CSV。
- 使用 `ai-job-analysis/scripts/prepare_jobs.py` 解析导出文件。
- 检查扩展网络面板，确认没有插件发起的请求。
- 检查 Manifest 权限和控制台错误。

## 16. Phased implementation plan

### Phase 1: 工程骨架与统一数据契约

- 创建 Manifest V3、TypeScript、Vite 和 Vitest 工程。
- 定义 16 列数据模型、平台枚举、字段验证和公共清洗接口。
- 建立只读 fixture 测试框架。

阶段验收：空扩展可加载；类型检查、测试和生产构建可运行。

### Phase 2: 四个平台提取器

- 按 BOSS直聘、猎聘、智联招聘、前程无忧逐个先写失败测试，再实现适配器。
- 每个平台独立验证必需字段、可选字段、当前岗位边界和污染排除。

阶段验收：四份样例均返回统一 `JobRecord`；完整 JD 不含推荐内容或隐藏干扰文字。

### Phase 3: 存储、去重与 CSV

- 实现本地保存、覆盖更新、记录数量、导出保留和确认清空。
- 实现与案例完全一致的 16 列 CSV 格式。
- 验证现有下游脚本兼容性。

阶段验收：重复记录不增加数量；导出 CSV 可由标准解析器和 `prepare_jobs.py` 正确读取。

### Phase 4: 紧凑弹窗

- 实现已确认的布局和全部状态。
- 接入提取、保存、更新、导出和清空流程。
- 完成键盘、焦点和状态播报。

阶段验收：用户可在当前详情页完成端到端收集；弹窗不出现范围外元素。

### Phase 5: 集成验证与交付

- 在 Chrome 真实页面验证四个平台。
- 完成权限、网络、控制台、类型、测试和构建检查。
- 编写安装、使用和已知限制文档。
- 交付可加载的 `dist/`。

阶段验收：四个平台记录可合并导出；全部自动化与人工验收通过。

## 17. Acceptance criteria

### 17.1 BOSS fixture

- `job_title` 为 `多模态大模型项目交付经理（2B / FDE）`。
- `company_name` 为 `模思`。
- `salary` 为 `40-70K·15薪`。
- `location` 为 `上海`。
- `experience` 为 `3-5年`。
- `education` 为 `本科`。
- JD 包含“负责多模态大模型及 AI 全栈产品在企业客户侧的端到端交付”。
- JD 不包含相似职位、`kanzhun`、隐藏的“来自BOSS直聘”、安全提示或 `base 北京 上海`。

### 17.2 Liepin fixture

- `job_title` 为 `医疗AI产品经理`。
- `company_name` 为 `商汤科技SenseTime`。
- `salary` 为 `20-30k`。
- JD 包含完整岗位职责和任职要求。
- 公司介绍只来自当前公司的简介区块。

### 17.3 Zhaopin fixture

- `job_title` 为 `AI客服产品经理(J16563)`。
- `company_name` 为 `中通快递`。
- `salary` 为 `2-4万·13薪`。
- `location` 为 `上海`。
- `experience` 为 `5-10年`。
- `education` 为 `本科`。
- JD 来自 `detailedPosition.description`。

### 17.4 51job fixture

- `job_title` 为 `AI用户产品经理-TikTok旗下图文独立端`。
- `company_name` 为 `抖音视界有限公司`。
- `salary` 为 `3.5-5.5万`。
- `location` 为 `上海`。
- `experience` 为 `2年`。
- `education` 为 `本科`。
- JD 来自 `JobPosting.description`，转换后保持列表顺序。

### 17.5 Storage and CSV

- 用户点击收集时完整记录立即写入本地。
- 弹窗只显示摘要，不显示或下载完整 JD。
- 同一岗位收集两次后记录数量不变，内容和时间更新。
- 浏览器或弹窗关闭后记录仍存在。
- CSV 恰好包含约定的 16 列且顺序一致。
- `note` 存在且为空。
- 文件以 UTF-8 BOM 开头，使用 CRLF，全字段加双引号。
- 多行 JD、中文、逗号和双引号往返解析后不丢失。
- `prepare_jobs.py` 解析导出文件时无阻塞错误。
- 导出成功或失败均不删除本地数据。

### 17.6 UI, permissions, and safety

- 只有点击“导出 CSV”才触发文件下载。
- 不支持页面和提取失败页面不会写入记录。
- 清空需要二次确认；取消后数据不变。
- 键盘可以完成收集和导出。
- Manifest 只含 `activeTab`、`scripting`、`storage` 权限。
- 插件不发起网络请求。
- Chrome 加载构建产物时无 Manifest 错误和未处理控制台错误。

## 18. Boundaries

### Always

- 先写或更新对应测试，再修改提取逻辑。
- 使用四份真实 HTML 样例回归选择器。
- 在完成声明前运行类型检查、测试和生产构建。
- 保持 CSV 向后兼容并维护固定列顺序。
- 保持权限最小化和本地处理。

### Ask first

- 增加 Chrome 权限或 host permissions。
- 新增运行时依赖、远程资源或网络请求。
- 修改 CSV 列名、顺序、编码或 schema version。
- 增加自动收集、列表扫描、字段编辑或云同步。
- 替换已确认的弹窗信息架构。

### Never

- 提交密钥、Cookie、账号数据或用户个人信息。
- 抓取用户没有主动打开的职位。
- 绕过招聘平台登录、验证码或反自动化机制。
- 把推荐职位、隐藏反复制节点或页面提示混入当前岗位 JD。
- 因测试失败而删除或弱化验收标准。

## 19. Open questions

无。产品范围、数据契约、交互、设计方向、提取架构、实施阶段和验收标准均已由用户确认。
