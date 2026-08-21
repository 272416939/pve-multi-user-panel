(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<!-- 安全防护 - 限速设置 -->
<div v-if="activeSection === 'security' && activeTabSecurity === 'ratelimit'">
    <div class="module-header">
        <h4 class="module-title">{{ t('admin.ratelimit.title') }}</h4>
    </div>
    <p class="text-muted small mb-3">{{ t('admin.ratelimit.desc') }}</p>

    <!-- 限速总开关 -->
    <div class="card mb-4">
        <div class="card-body">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <strong>{{ t('admin.ratelimit.master') }}</strong>
                    <p class="text-muted small mb-0">{{ t('admin.ratelimit.masterDesc') }}</p>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="rateLimitMaster" v-model="rateLimitConfig.master_enabled">
                    <label class="form-check-label" for="rateLimitMaster">{{ rateLimitConfig.master_enabled ? t('admin.ratelimit.masterOn') : t('admin.ratelimit.masterOff') }}</label>
                </div>
            </div>
        </div>
    </div>

    <!-- 分类规则（表格容器统一玻璃态 table-container） -->
    <div v-for="cat in rateLimitConfig.categories" :key="cat.key" class="table-container mb-4" style="padding:12px;">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">{{ t('admin.ratelimit.cat.' + cat.key) || cat.label }}</h5>
        </div>
        <table class="table table-hover align-middle mb-0">
                <thead>
                    <tr>
                        <th style="width:28%">{{ t('admin.ratelimit.rule') }}</th>
                        <th style="width:12%" class="text-center">{{ t('admin.ratelimit.enable') }}</th>
                        <th style="width:36%">{{ t('admin.ratelimit.limit') }}</th>
                        <th>{{ t('common.description') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="rule in cat.rules" :key="rule.key">
                        <td>{{ t('admin.ratelimit.rule.' + rule.key) || rule.label }}</td>
                        <td class="text-center">
                            <div class="form-check form-switch d-inline-block">
                                <input class="form-check-input" type="checkbox" :id="'rl-' + rule.key" v-model="rule.enabled">
                            </div>
                        </td>
                        <td>
                            <div class="d-flex align-items-center gap-2" :class="{ 'opacity-50': !rule.enabled }">
                                <input type="number" class="form-control form-control-sm" style="width:90px" v-model.number="rule.max" min="1" max="10000">
                                <span>{{ t('admin.ratelimit.timesPer') }}</span>
                                <input type="number" class="form-control form-control-sm" style="width:90px" v-model.number="rule.windowValue" min="1">
                                <select class="form-select form-select-sm" style="width:110px" v-model="rule.windowUnit">
                                    <option value="sec">{{ t('common.seconds') }}</option>
                                    <option value="min">{{ t('common.minutes') }}</option>
                                    <option value="hour">{{ t('common.hours') }}</option>
                                </select>
                            </div>
                        </td>
                        <td class="text-muted small">{{ t('admin.ratelimit.hint.' + rule.key) || rule.hint }}</td>
                    </tr>
                </tbody>
            </table>
    </div>

    <div class="d-flex gap-2">
        <pv-button type="button" variant="glass" @click="saveRateLimitConfig()" :disabled="rateLimitSaving">
            {{ rateLimitSaving ? t('common.saving') : t('admin.ratelimit.save') }}
        </pv-button>
        <pv-button type="button" variant="outline" @click="resetRateLimitConfig" :disabled="rateLimitSaving">{{ t('admin.ratelimit.resetDefaults') }}</pv-button>
    </div>
</div>
`);
})();
