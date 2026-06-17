(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'system-update'">
                    <!-- 系统更新 -->
                    <div>
                        <h4 class="module-title">系统更新</h4>

                        <!-- 当前版本 -->
                        <div class="card mb-3">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <div>
                                        <h5 class="mb-1">当前版本</h5>
                                        <span class="fs-4 fw-bold text-primary" id="currentVersion">加载中...</span>
                                    </div>
                                    <pv-button style="border-color:rgba(99,102,241,0.25);background:rgba(99,102,241,0.08);color:#A5B4FC;" @click="checkUpdate" :disabled="updateChecking" variant="glass">

                                        <span v-if="updateChecking" class="spinner-border spinner-border-sm me-1"></span>
                                        <span v-else>🔍</span>
                                        检查更新
                                    
</pv-button>
                                </div>

                                <!-- 更新源选择 -->
                                <div class="mt-3 pt-3 border-top border-secondary" style="border-color: rgba(255,255,255,0.08) !important;">
                                    <label class="form-label text-muted small mb-2">更新源</label>
                                    <select class="form-select form-select-sm bg-dark text-light border-secondary" style="max-width: 400px;" v-model="updateSource">
                                        <option value="gitee">Gitee（推荐）— 国内访问速度快，服务器部署首选</option>
                                        <option value="github">GitHub — 海外环境 / Gitee 不可达时使用</option>
                                    </select>
                                    <small class="text-muted d-block mt-1">
                                        <span v-if="updateSource === 'gitee'">
                                            <i class="bi bi-info-circle"></i>
                                            Gitee 国内镜像仓库，从 gitee.com 拉取代码，速度更快
                                        </span>
                                        <span v-else>
                                            <i class="bi bi-info-circle"></i>
                                            GitHub 官方仓库，海外服务器或网络特殊时选择
                                        </span>
                                    </small>
                                </div>
                            </div>
                        </div>

                        <!-- 检查错误 -->
                        <div v-if="updateInfo && updateInfo.error" class="alert alert-warning">
                            {{ updateInfo.error }}
                        </div>

                        <!-- 最新版本信息 -->
                        <div v-if="updateInfo && updateInfo.has_update" class="card mb-3 update-banner">
                            <div class="card-header update-banner-header">
                                <h5 class="mb-0">发现新版本 v{{ updateInfo.latest_version }}</h5>
                            </div>
                            <div class="card-body">
                                <p class="text-muted mb-2">
                                    发布时间：{{ formatDate(updateInfo.release.published_at) }}
                                    <span class="update-source-badge ms-1">{{ updateInfo.source === 'gitee' ? 'Gitee' : 'GitHub' }}</span>
                                    <a :href="updateInfo.release.html_url" target="_blank" class="ms-2">查看 Release</a>
                                </p>

                                <!-- 更新日志 -->
                                <div v-if="updateInfo.release.body" class="mt-3">
                                    <h6>更新日志</h6>
                                    <div class="border rounded p-3 markdown-body" style="max-height: 400px; overflow-y: auto; background: rgba(255,255,255,0.03); color: var(--text-primary);" v-html="parseMarkdown(updateInfo.release.body)"></div>
                                </div>

                                <!-- 更新按钮 -->
                                <div class="mt-3">
                                    <pv-button @click="executeUpdate" :disabled="updateExecuting">

                                        <span v-if="updateExecuting" class="spinner-border spinner-border-sm me-1"></span>
                                        {{ updateExecuting ? '正在更新中...' : '⚡ 立即更新' }}
                                    
</pv-button>
                                    <small class="text-muted ms-2">更新后服务会自动重启，请确保已保存所有操作</small>
                                </div>
                            </div>
                        </div>

                        <!-- 已是最新版本 -->
                        <div v-if="updateInfo && !updateInfo.has_update && !updateInfo.error" class="card mb-3">
                            <div class="card-body text-center py-4">
                                <div class="fs-1 mb-2">✅</div>
                                <h5>已是最新版本</h5>
                                <p class="text-muted">当前运行版本 v{{ updateInfo.current_version }} 为最新版本</p>
                            </div>
                        </div>

                        <!-- 更新中提示 -->
                        <div v-if="updateExecuting" class="alert alert-info">
                            <div class="d-flex align-items-center">
                                <div class="spinner-border spinner-border-sm me-2"></div>
                                <div>
                                    <strong>正在更新中...</strong><br>
                                    <small>服务即将重启，页面将在重启后自动刷新。如果长时间未恢复，请手动刷新页面。</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 消息详情弹窗 -->
                

`);
})();
