(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'system-update'">
                    <!-- 系统更新 -->
                    <div>
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.update.title') }}</h4>
                        </div>

                        <!-- 当前版本 -->
                        <div class="card mb-3">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <div>
                                        <h5 class="mb-1">{{ t('admin.update.currentVersion') }}</h5>
                                        <span class="fs-4 fw-bold text-primary" id="currentVersion">{{ t('common.loading') }}</span>
                                    </div>
                                    <pv-button variant="outline" size="lg" @click="checkUpdate" :disabled="updateChecking">

                                        <span v-if="updateChecking" class="spinner-border spinner-border-sm me-1"></span>
                                        {{ t('admin.update.check') }}
                                    
</pv-button>
                                </div>

                                <!-- 更新源选择 -->
                                <div class="mt-3 pt-3 border-top border-secondary" style="border-color: rgba(255,255,255,0.08) !important;">
                                    <label class="form-label text-muted small mb-2">{{ t('admin.update.source') }}</label>
                                    <select class="form-select form-select-sm bg-dark text-light border-secondary" style="max-width: 400px;" v-model="updateSource">
                                        <option value="gitee">{{ t('admin.update.giteeOption') }}</option>
                                        <option value="github">{{ t('admin.update.githubOption') }}</option>
                                    </select>
                                    <small class="text-muted d-block mt-1">
                                        <span v-if="updateSource === 'gitee'">
                                            <i class="bi bi-info-circle"></i>
                                            {{ t('admin.update.giteeHint') }}
                                        </span>
                                        <span v-else>
                                            <i class="bi bi-info-circle"></i>
                                            {{ t('admin.update.githubHint') }}
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
                                <h5 class="mb-0">{{ tFormat('admin.update.foundNew', updateInfo.latest_version) }}</h5>
                            </div>
                            <div class="card-body">
                                <p class="text-muted mb-2">
                                    {{ t('admin.update.releaseTime') }}{{ formatDate(updateInfo.release.published_at) }}
                                    <span class="update-source-badge ms-1">{{ updateInfo.source === 'gitee' ? 'Gitee' : 'GitHub' }}</span>
                                    <a :href="updateInfo.release.html_url" target="_blank" class="ms-2">{{ t('admin.update.viewRelease') }}</a>
                                </p>

                                <!-- 更新日志 -->
                                <div v-if="updateInfo.release.body" class="mt-3">
                                    <h6>{{ t('admin.update.changelog') }}</h6>
                                    <div class="border rounded p-3 markdown-body" style="max-height: 400px; overflow-y: auto; background: rgba(255,255,255,0.03); color: var(--text-primary);" v-html="parseMarkdown(updateInfo.release.body)"></div>
                                </div>

                                <!-- 更新按钮 -->
                                <div class="mt-3">
                                    <pv-button @click="executeUpdate" :disabled="updateExecuting">

                                        <span v-if="updateExecuting" class="spinner-border spinner-border-sm me-1"></span>
                                        {{ updateExecuting ? t('admin.update.updating') : t('admin.update.updateNow') }}
                                    
</pv-button>
                                    <small class="text-muted ms-2">{{ t('admin.update.restartHint') }}</small>
                                </div>
                            </div>
                        </div>

                        <!-- 已是最新版本 -->
                        <div v-if="updateInfo && !updateInfo.has_update && !updateInfo.error" class="card mb-3">
                            <div class="card-body text-center py-4">
                                <div class="fs-1 mb-2" style="color:var(--color-success);"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                                <h5>{{ t('admin.update.latestTitle') }}</h5>
                                <p class="text-muted">{{ tFormat('admin.update.latestDesc', updateInfo.current_version) }}</p>
                            </div>
                        </div>

                        <!-- 更新中提示 -->
                        <div v-if="updateExecuting" class="alert alert-info">
                            <div class="d-flex align-items-center">
                                <div class="spinner-border spinner-border-sm me-2"></div>
                                <div>
                                    <strong>{{ t('admin.update.updating') }}</strong><br>
                                    <small>{{ t('admin.update.updatingHint') }}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 消息详情弹窗 -->
                

`);
})();
