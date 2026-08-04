(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<!-- 安全防护 - 限速设置 -->
<div v-if="activeSection === 'security' && activeTabSecurity === 'ratelimit'">
    <div class="module-header">
        <h4 class="module-title">限速设置</h4>
    </div>
    <p class="text-muted small mb-3">配置全站接口限速：限速总开关关闭后所有规则（含全局接口限速）立即失效；规则默认值与系统内置一致（默认全部开启），保存后立即生效。</p>

    <!-- 限速总开关 -->
    <div class="card mb-4">
        <div class="card-body">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <strong>限速总开关</strong>
                    <p class="text-muted small mb-0">关闭后全站所有限速规则将不再生效，仅建议在故障排查时临时关闭，排查完成后请及时重新开启。</p>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="rateLimitMaster" v-model="rateLimitConfig.master_enabled">
                    <label class="form-check-label" for="rateLimitMaster">{{ rateLimitConfig.master_enabled ? '已开启' : '已关闭' }}</label>
                </div>
            </div>
        </div>
    </div>

    <!-- 分类规则（表格容器统一玻璃态 table-container） -->
    <div v-for="cat in rateLimitConfig.categories" :key="cat.key" class="table-container mb-4" style="padding:12px;">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">{{ cat.label }}</h5>
        </div>
        <table class="table table-hover align-middle mb-0">
                <thead>
                    <tr>
                        <th style="width:28%">规则</th>
                        <th style="width:12%" class="text-center">启用</th>
                        <th style="width:36%">限速</th>
                        <th>说明</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="rule in cat.rules" :key="rule.key">
                        <td>{{ rule.label }}</td>
                        <td class="text-center">
                            <div class="form-check form-switch d-inline-block">
                                <input class="form-check-input" type="checkbox" :id="'rl-' + rule.key" v-model="rule.enabled">
                            </div>
                        </td>
                        <td>
                            <div class="d-flex align-items-center gap-2" :class="{ 'opacity-50': !rule.enabled }">
                                <input type="number" class="form-control form-control-sm" style="width:90px" v-model.number="rule.max" min="1" max="10000">
                                <span>次 /</span>
                                <input type="number" class="form-control form-control-sm" style="width:90px" v-model.number="rule.windowValue" min="1">
                                <select class="form-select form-select-sm" style="width:110px" v-model="rule.windowUnit">
                                    <option value="sec">秒</option>
                                    <option value="min">分钟</option>
                                    <option value="hour">小时</option>
                                </select>
                            </div>
                        </td>
                        <td class="text-muted small">{{ rule.hint }}</td>
                    </tr>
                </tbody>
            </table>
    </div>

    <div class="d-flex gap-2">
        <pv-button type="button" variant="glass" @click="saveRateLimitConfig" :disabled="rateLimitSaving">
            {{ rateLimitSaving ? '保存中...' : '保存配置' }}
        </pv-button>
        <pv-button type="button" variant="outline" @click="resetRateLimitConfig" :disabled="rateLimitSaving">恢复默认配置</pv-button>
    </div>
</div>
`);
})();
